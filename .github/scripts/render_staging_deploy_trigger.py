#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


RENDER_API_BASE_URL = "https://api.render.com/v1"
REQUIRED_ENV_NAMES: tuple[str, ...] = (
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
)
EXPECTED_COMMIT_ENV = "RENDER_DEPLOY_EXPECTED_COMMIT"
GITHUB_SHA_ENV = "GITHUB_SHA"
SUMMARY_PATH_ENV = "RENDER_DEPLOY_TRIGGER_SUMMARY_PATH"
DEFAULT_SUMMARY_PATH = "artifacts/phase6/staging-integration-smoke/render-deploy-trigger-summary.json"
FORBIDDEN_SERVICE_NAMES_ENV = "RENDER_FORBIDDEN_SERVICE_NAMES"
ALLOWED_SERVICE_NAMES_ENV = "RENDER_ALLOWED_SERVICE_NAMES"
ALLOWED_SERVICE_PLANS_ENV = "RENDER_ALLOWED_SERVICE_PLANS"
EXPECTED_DEPLOY_ID_ENV = "RENDER_DEPLOY_EXPECTED_DEPLOY_ID"
LOOKUP_TIMEOUT_SECONDS_ENV = "RENDER_DEPLOY_TRIGGER_LOOKUP_TIMEOUT_SECONDS"
LOOKUP_POLL_SECONDS_ENV = "RENDER_DEPLOY_TRIGGER_LOOKUP_POLL_SECONDS"
DEFAULT_LOOKUP_TIMEOUT_SECONDS = 120
DEFAULT_LOOKUP_POLL_SECONDS = 5
COMMIT_UNSUPPORTED_SERVICE_TYPES: frozenset[str] = frozenset(("cron", "cron_job"))


JsonRequester = Callable[[str, str, str, dict[str, object] | None], dict[str, object]]


def missing_required_env(env: dict[str, str]) -> list[str]:
    return [name for name in REQUIRED_ENV_NAMES if not (env.get(name) or "").strip()]


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _split_csv(value: str) -> frozenset[str]:
    return frozenset(item.strip() for item in value.split(",") if item.strip())


def _positive_int_env(env: dict[str, str], name: str, fallback: int) -> int:
    raw_value = (env.get(name) or "").strip()
    if not raw_value:
        return fallback
    value = int(raw_value)
    if value <= 0:
        raise ValueError(f"{name} must be greater than 0.")
    return value


def _parse_timestamp(value: str) -> datetime | None:
    normalized = value.strip()
    if not normalized:
        return None
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _format_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _service_id_from_url(url: str) -> str | None:
    if "/services/" not in url:
        return None
    candidate = url.split("/services/", 1)[1].split("/", 1)[0].strip()
    if not candidate:
        return None
    return candidate


def _redact_render_api_detail(detail: str, url: str, api_key: str) -> str:
    redacted = detail.replace(api_key, "[redacted]")
    service_id = _service_id_from_url(url)
    if service_id is not None:
        redacted = redacted.replace(service_id, "[redacted-service]")
    return redacted


def _request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            response_body = response.read().decode("utf-8")
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        safe_body = _redact_render_api_detail(error_body[:300], url, api_key)
        raise RuntimeError(f"Render API {method} request failed with status {error.code}: {safe_body}") from error
    except TimeoutError as error:
        raise RuntimeError(f"Render API {method} request timed out.") from error
    except URLError as error:
        safe_reason = _redact_render_api_detail(str(error.reason), url, api_key)
        raise RuntimeError(f"Render API {method} request failed: {safe_reason}") from error
    if not response_body.strip():
        return {}
    try:
        decoded = json.loads(response_body)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Render API {method} request returned invalid JSON.") from error
    if not isinstance(decoded, dict):
        raise RuntimeError(f"Render API {method} request returned a non-object response.")
    return decoded


def _retrieve_service(api_key: str, service_id: str, request_json: JsonRequester) -> dict[str, object]:
    url = f"{RENDER_API_BASE_URL}/services/{service_id}"
    return request_json("GET", url, api_key, None)


def _create_deploy(
    api_key: str,
    service_id: str,
    expected_commit: str | None,
    request_json: JsonRequester,
) -> dict[str, object]:
    payload: dict[str, object] = {}
    if expected_commit is not None:
        payload["commitId"] = expected_commit
    url = f"{RENDER_API_BASE_URL}/services/{service_id}/deploys"
    return request_json("POST", url, api_key, payload)


def _extract_deploys(response: dict[str, object]) -> list[dict[str, object]]:
    raw_deploys = response.get("deploys")
    if raw_deploys is None:
        raw_deploys = response.get("data")
    if not isinstance(raw_deploys, list):
        return []
    deploys: list[dict[str, object]] = []
    for item in raw_deploys:
        candidate = item.get("deploy") if isinstance(item, dict) and isinstance(item.get("deploy"), dict) else item
        if isinstance(candidate, dict):
            deploys.append(candidate)
    return deploys


def _list_deploys_after(
    api_key: str,
    service_id: str,
    created_after: datetime,
    request_json: JsonRequester,
) -> list[dict[str, object]]:
    query = urlencode({"limit": "100", "createdAfter": _format_timestamp(created_after)})
    url = f"{RENDER_API_BASE_URL}/services/{service_id}/deploys?{query}"
    return _extract_deploys(request_json("GET", url, api_key, None))


def _service_plan(service: dict[str, object]) -> str | None:
    details = service.get("serviceDetails")
    if isinstance(details, dict) and isinstance(details.get("plan"), str):
        return details["plan"]
    plan = service.get("plan")
    if isinstance(plan, str):
        return plan
    return None


def _service_summary(service: dict[str, object]) -> dict[str, object]:
    return {
        "name": service.get("name"),
        "type": service.get("type"),
        "branch": service.get("branch"),
        "repo": service.get("repo"),
        "plan": _service_plan(service),
    }


def _forbidden_service_error(service: dict[str, object], forbidden_names: frozenset[str]) -> str | None:
    if not forbidden_names:
        return None
    service_name = service.get("name")
    if not isinstance(service_name, str):
        return "render_service_name_missing"
    if service_name in forbidden_names:
        return "forbidden_render_service"
    return None


def _allowed_service_error(service: dict[str, object], allowed_names: frozenset[str]) -> str | None:
    if not allowed_names:
        return None
    service_name = service.get("name")
    if not isinstance(service_name, str):
        return "render_service_name_missing"
    if service_name not in allowed_names:
        return "disallowed_render_service"
    return None


def _service_plan_error(service: dict[str, object], allowed_plans: frozenset[str]) -> str | None:
    if not allowed_plans:
        return None
    service_plan = _service_plan(service)
    if service_plan is None:
        return "render_service_plan_missing"
    if service_plan not in allowed_plans:
        return "disallowed_render_service_plan"
    return None


def _expected_commit(env: dict[str, str]) -> str | None:
    explicit_commit = (env.get(EXPECTED_COMMIT_ENV) or "").strip()
    if explicit_commit:
        return explicit_commit
    github_sha = (env.get(GITHUB_SHA_ENV) or "").strip()
    if github_sha:
        return github_sha
    return None


def _deploy_commit_id(deploy: dict[str, object]) -> str | None:
    commit = deploy.get("commit")
    if isinstance(commit, dict):
        commit_id = commit.get("id")
        if isinstance(commit_id, str) and commit_id.strip():
            return commit_id.strip()
    for key in ("commitId", "commitSHA", "commitSha", "sha"):
        commit_id = deploy.get(key)
        if isinstance(commit_id, str) and commit_id.strip():
            return commit_id.strip()
    return None


def _deploy_payload(response: dict[str, object]) -> dict[str, object]:
    deploy = response.get("deploy")
    if isinstance(deploy, dict):
        return deploy
    return response


def _deploy_created_at(deploy: dict[str, object]) -> datetime | None:
    created_at = deploy.get("createdAt")
    if not isinstance(created_at, str):
        return None
    return _parse_timestamp(created_at)


def _matches_expected_commit(deploy: dict[str, object], expected_commit: str | None) -> bool:
    if expected_commit is None:
        return True
    commit_id = _deploy_commit_id(deploy)
    if commit_id is None:
        return False
    normalized_commit_id = commit_id.lower()
    normalized_expected = expected_commit.lower()
    return (
        normalized_commit_id == normalized_expected
        or (len(normalized_expected) >= 7 and normalized_commit_id.startswith(normalized_expected))
        or (len(normalized_commit_id) >= 7 and normalized_expected.startswith(normalized_commit_id))
    )


def _trigger_candidates(
    deploys: list[dict[str, object]],
    expected_commit: str | None,
    triggered_at: datetime,
) -> list[dict[str, object]]:
    candidates: list[tuple[datetime, str, dict[str, object]]] = []
    for deploy in deploys:
        created_at = _deploy_created_at(deploy)
        if created_at is None or created_at < triggered_at:
            continue
        if not _matches_expected_commit(deploy, expected_commit):
            continue
        deploy_id = deploy.get("id")
        deploy_id_sort_value = deploy_id if isinstance(deploy_id, str) else ""
        candidates.append((created_at, deploy_id_sort_value, deploy))
    sorted_candidates = sorted(candidates, key=lambda candidate: (candidate[0], candidate[1]), reverse=True)
    return [deploy for _created_at, _deploy_id, deploy in sorted_candidates]


def _deploy_summary(deploy: dict[str, object]) -> dict[str, object]:
    return {
        "commit": _deploy_commit_id(deploy),
        "created_at": deploy.get("createdAt"),
        "finished_at": deploy.get("finishedAt"),
        "id": deploy.get("id"),
        "status": deploy.get("status"),
        "updated_at": deploy.get("updatedAt"),
    }


def _supports_expected_commit(service: dict[str, object]) -> bool:
    service_type = service.get("type")
    if not isinstance(service_type, str):
        return True
    return service_type not in COMMIT_UNSUPPORTED_SERVICE_TYPES


def _base_summary(service: dict[str, object], expected_commit: str | None) -> dict[str, object]:
    summary: dict[str, object] = {
        "render_service": _service_summary(service),
    }
    if expected_commit is not None:
        summary["expected_commit"] = expected_commit
    return summary


def _lookup_triggered_deploy(
    api_key: str,
    service_id: str,
    expected_commit: str | None,
    triggered_at: datetime,
    env: dict[str, str],
    request_json: JsonRequester,
) -> dict[str, object] | None:
    timeout_seconds = _positive_int_env(env, LOOKUP_TIMEOUT_SECONDS_ENV, DEFAULT_LOOKUP_TIMEOUT_SECONDS)
    poll_seconds = _positive_int_env(env, LOOKUP_POLL_SECONDS_ENV, DEFAULT_LOOKUP_POLL_SECONDS)
    deadline = time.monotonic() + timeout_seconds
    while True:
        deploys = _list_deploys_after(api_key, service_id, triggered_at, request_json)
        candidates = _trigger_candidates(deploys, expected_commit, triggered_at)
        if candidates:
            return candidates[0]
        if time.monotonic() >= deadline:
            return None
        time.sleep(poll_seconds)


def run_trigger(env: dict[str, str], request_json: JsonRequester) -> int:
    summary_path = Path((env.get(SUMMARY_PATH_ENV) or DEFAULT_SUMMARY_PATH).strip())
    missing = missing_required_env(env)
    if missing:
        _write_json(summary_path, {"passed": False, "missing_env": missing})
        print(f"[RenderStagingDeployTrigger] Missing required env: {', '.join(missing)}", file=sys.stderr)
        return 2

    api_key = env["RENDER_API_KEY"]
    service_id = env["RENDER_SERVICE_ID"]
    expected_commit = _expected_commit(env)
    forbidden_names = _split_csv(env.get(FORBIDDEN_SERVICE_NAMES_ENV, ""))
    allowed_names = _split_csv(env.get(ALLOWED_SERVICE_NAMES_ENV, ""))
    allowed_plans = _split_csv(env.get(ALLOWED_SERVICE_PLANS_ENV, ""))

    service = _retrieve_service(api_key, service_id, request_json)
    service_error = (
        _forbidden_service_error(service, forbidden_names)
        or _allowed_service_error(service, allowed_names)
        or _service_plan_error(service, allowed_plans)
    )
    if service_error is not None:
        summary = _base_summary(service, expected_commit)
        summary.update({"passed": False, "error": service_error})
        _write_json(summary_path, summary)
        print(f"[RenderStagingDeployTrigger] Refusing to trigger Render deploy: {service_error}", file=sys.stderr)
        return 1

    if expected_commit is not None and not _supports_expected_commit(service):
        summary = _base_summary(service, expected_commit)
        summary.update({"passed": False, "error": "expected_commit_not_supported_for_service_type"})
        _write_json(summary_path, summary)
        print("[RenderStagingDeployTrigger] Refusing to trigger deploy because commit pinning is unsupported.", file=sys.stderr)
        return 1

    triggered_at = datetime.now(timezone.utc)
    created = _deploy_payload(_create_deploy(api_key, service_id, expected_commit, request_json))
    deploy_id = created.get("id")
    if not isinstance(deploy_id, str) or not deploy_id.strip():
        resolved = _lookup_triggered_deploy(api_key, service_id, expected_commit, triggered_at, env, request_json)
        if resolved is not None:
            created = resolved
            deploy_id = resolved.get("id")
    if not isinstance(deploy_id, str) or not deploy_id.strip():
        summary = _base_summary(service, expected_commit)
        summary.update(
            {
                "passed": False,
                "error": "render_deploy_id_missing",
                "render_deploy": _deploy_summary(created),
            }
        )
        _write_json(summary_path, summary)
        print("[RenderStagingDeployTrigger] Render deploy id was missing.", file=sys.stderr)
        return 1

    summary = _base_summary(service, expected_commit)
    summary.update(
        {
            "passed": True,
            "render_deploy": _deploy_summary(created),
            "trigger": {
                "commit_id_requested": expected_commit is not None,
            },
        }
    )
    _write_json(summary_path, summary)
    github_env = env.get("GITHUB_ENV")
    if github_env:
        with Path(github_env).open("a", encoding="utf-8") as fp:
            fp.write(f"{EXPECTED_DEPLOY_ID_ENV}={deploy_id}\n")
    print(f"[RenderStagingDeployTrigger] Triggered Render deploy: {deploy_id}")
    return 0


def main() -> int:
    return run_trigger(dict(os.environ), _request_json)


if __name__ == "__main__":
    raise SystemExit(main())
