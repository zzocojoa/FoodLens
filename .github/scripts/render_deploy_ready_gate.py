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


REQUIRED_ENV_NAMES: tuple[str, ...] = (
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
    "RENDER_DEPLOY_MIN_CREATED_AT",
)
EXPECTED_COMMIT_ENV = "RENDER_DEPLOY_EXPECTED_COMMIT"
GITHUB_SHA_ENV = "GITHUB_SHA"
LIVE_STATUS = "live"
FAILED_STATUSES: frozenset[str] = frozenset(("build_failed", "update_failed", "canceled", "cancelled"))
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_POLL_SECONDS = 10
DEFAULT_SUMMARY_PATH = "artifacts/phase6/staging-integration-smoke/render-deploy-ready-summary.json"
FORBIDDEN_SERVICE_NAMES_ENV = "RENDER_FORBIDDEN_SERVICE_NAMES"
ALLOWED_SERVICE_PLANS_ENV = "RENDER_ALLOWED_SERVICE_PLANS"
ALLOWED_SERVICE_NAMES_ENV = "RENDER_ALLOWED_SERVICE_NAMES"
EXPECTED_DEPLOY_ID_ENV = "RENDER_DEPLOY_EXPECTED_DEPLOY_ID"


JsonRequester = Callable[[str, str, str], dict[str, object]]
Sleeper = Callable[[float], None]
Clock = Callable[[], float]


def missing_required_env(env: dict[str, str]) -> list[str]:
    return [name for name in REQUIRED_ENV_NAMES if not (env.get(name) or "").strip()]


def _positive_int_env(env: dict[str, str], name: str, fallback: int) -> int:
    raw_value = (env.get(name) or "").strip()
    if not raw_value:
        return fallback
    value = int(raw_value)
    if value <= 0:
        raise ValueError(f"{name} must be greater than 0.")
    return value


def _parse_timestamp(value: str) -> datetime:
    normalized = value.strip()
    if not normalized:
        raise ValueError("timestamp must not be empty.")
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include timezone.")
    return parsed.astimezone(timezone.utc)


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _split_csv(value: str) -> frozenset[str]:
    return frozenset(item.strip() for item in value.split(",") if item.strip())


def _service_id_from_url(url: str) -> str | None:
    if "/services/" not in url:
        return None
    candidate = url.split("/services/", 1)[1].split("/", 1)[0].strip()
    if not candidate:
        return None
    return candidate.split("?", 1)[0]


def _redact_render_api_detail(detail: str, url: str, api_key: str) -> str:
    redacted = detail.replace(api_key, "[redacted]")
    service_id = _service_id_from_url(url)
    if service_id is not None:
        redacted = redacted.replace(service_id, "[redacted-service]")
    return redacted


def _request_json(method: str, url: str, api_key: str) -> dict[str, object]:
    request = Request(
        url,
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
    decoded = json.loads(response_body)
    if isinstance(decoded, list):
        return {"deploys": decoded}
    if not isinstance(decoded, dict):
        raise RuntimeError("Render API returned a non-object response.")
    return decoded


def _extract_deploys(response: dict[str, object]) -> list[dict[str, object]]:
    raw_deploys = response.get("deploys")
    if raw_deploys is None:
        raw_deploys = response.get("data")
    if not isinstance(raw_deploys, list):
        raise RuntimeError("Render deploy list response did not include a deploy list.")
    deploys: list[dict[str, object]] = []
    for item in raw_deploys:
        candidate = item.get("deploy") if isinstance(item, dict) and isinstance(item.get("deploy"), dict) else item
        if isinstance(candidate, dict):
            deploys.append(candidate)
    return deploys


def _deploy_payload(response: dict[str, object]) -> dict[str, object]:
    deploy = response.get("deploy")
    if isinstance(deploy, dict):
        return deploy
    return response


def _list_deploys(api_key: str, service_id: str, request_json: JsonRequester) -> list[dict[str, object]]:
    query = urlencode({"limit": "20"})
    url = f"https://api.render.com/v1/services/{service_id}/deploys?{query}"
    return _extract_deploys(request_json("GET", url, api_key))


def _retrieve_deploy(api_key: str, service_id: str, deploy_id: str, request_json: JsonRequester) -> dict[str, object]:
    url = f"https://api.render.com/v1/services/{service_id}/deploys/{deploy_id}"
    return _deploy_payload(request_json("GET", url, api_key))


def _retrieve_service(api_key: str, service_id: str, request_json: JsonRequester) -> dict[str, object]:
    url = f"https://api.render.com/v1/services/{service_id}"
    return request_json("GET", url, api_key)


def _service_summary(service: dict[str, object]) -> dict[str, object]:
    return {
        "name": service.get("name"),
        "type": service.get("type"),
        "branch": service.get("branch"),
        "repo": service.get("repo"),
        "plan": _service_plan(service),
    }


def _service_plan(service: dict[str, object]) -> str | None:
    details = service.get("serviceDetails")
    if isinstance(details, dict) and isinstance(details.get("plan"), str):
        return details["plan"]
    plan = service.get("plan")
    if isinstance(plan, str):
        return plan
    return None


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


def _deploy_created_at(deploy: dict[str, object]) -> datetime | None:
    created_at = deploy.get("createdAt")
    if not isinstance(created_at, str):
        return None
    try:
        return _parse_timestamp(created_at)
    except ValueError:
        return None


def _candidate_deploys(deploys: list[dict[str, object]], min_created_at: datetime) -> list[dict[str, object]]:
    candidates: list[tuple[datetime, str, dict[str, object]]] = []
    for deploy in deploys:
        created_at = _deploy_created_at(deploy)
        if created_at is None or created_at < min_created_at:
            continue
        deploy_id = deploy.get("id")
        deploy_id_sort_value = deploy_id if isinstance(deploy_id, str) else ""
        candidates.append((created_at, deploy_id_sort_value, deploy))
    sorted_candidates = sorted(candidates, key=lambda candidate: (candidate[0], candidate[1]), reverse=True)
    return [deploy for _created_at, _deploy_id, deploy in sorted_candidates]


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


def _matches_expected_deploy_id(deploy: dict[str, object], expected_deploy_id: str | None) -> bool:
    if expected_deploy_id is None:
        return True
    deploy_id = deploy.get("id")
    if not isinstance(deploy_id, str):
        return False
    return deploy_id == expected_deploy_id


def _deploy_observation(deploy: dict[str, object]) -> dict[str, object]:
    return {
        "commit": _deploy_commit_id(deploy),
        "created_at": deploy.get("createdAt"),
        "finished_at": deploy.get("finishedAt"),
        "id": deploy.get("id"),
        "status": deploy.get("status"),
        "updated_at": deploy.get("updatedAt"),
    }


def _deploy_timeout_error(
    expected_commit: str | None,
    expected_deploy_id: str | None,
    latest_matching_deploy: dict[str, object] | None,
    latest_observed_deploy: dict[str, object] | None,
) -> str:
    if expected_deploy_id is not None:
        if latest_matching_deploy is not None:
            return "expected_deploy_not_ready"
        return "expected_deploy_not_found"
    if expected_commit is None:
        return "render_deploy_timed_out"
    if latest_matching_deploy is not None:
        return "expected_commit_deploy_not_ready"
    if latest_observed_deploy is not None:
        return "expected_commit_deploy_not_found"
    return "render_deploy_not_found_after_min_created_at"


def _deploy_summary(
    deploy: dict[str, object] | None,
    status: str,
    passed: bool,
    expected_commit: str | None,
    expected_deploy_id: str | None,
    latest_observed_deploy: dict[str, object] | None,
) -> dict[str, object]:
    selected = deploy or {}
    summary: dict[str, object] = {
        "passed": passed,
        "render_deploy": {
            "commit": _deploy_commit_id(selected),
            "created_at": selected.get("createdAt"),
            "finished_at": selected.get("finishedAt"),
            "id": selected.get("id"),
            "status": status,
            "updated_at": selected.get("updatedAt"),
        },
    }
    if expected_commit is not None:
        summary["expected_commit"] = expected_commit
    if expected_deploy_id is not None:
        summary["expected_deploy_id"] = expected_deploy_id
    if latest_observed_deploy is not None and latest_observed_deploy is not deploy:
        summary["latest_observed_deploy"] = _deploy_observation(latest_observed_deploy)
    return summary


def run_gate(
    env: dict[str, str],
    request_json: JsonRequester,
    sleeper: Sleeper,
    clock: Clock,
) -> int:
    summary_path = Path((env.get("RENDER_DEPLOY_SUMMARY_PATH") or DEFAULT_SUMMARY_PATH).strip())
    missing = missing_required_env(env)
    if missing:
        _write_json(summary_path, {"passed": False, "missing_env": missing})
        print(f"[RenderDeployReadyGate] Missing required env: {', '.join(missing)}", file=sys.stderr)
        return 2

    api_key = env["RENDER_API_KEY"]
    service_id = env["RENDER_SERVICE_ID"]
    forbidden_names = _split_csv(env.get(FORBIDDEN_SERVICE_NAMES_ENV, ""))
    allowed_names = _split_csv(env.get(ALLOWED_SERVICE_NAMES_ENV, ""))
    allowed_plans = _split_csv(env.get(ALLOWED_SERVICE_PLANS_ENV, ""))
    min_created_at = _parse_timestamp(env["RENDER_DEPLOY_MIN_CREATED_AT"])
    expected_commit = _expected_commit(env)
    expected_deploy_id = (env.get(EXPECTED_DEPLOY_ID_ENV) or "").strip() or None
    timeout_seconds = _positive_int_env(env, "RENDER_DEPLOY_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)
    poll_seconds = _positive_int_env(env, "RENDER_DEPLOY_POLL_SECONDS", DEFAULT_POLL_SECONDS)
    deadline = clock() + timeout_seconds

    if forbidden_names or allowed_names or allowed_plans:
        service = _retrieve_service(api_key, service_id, request_json)
        service_error = (
            _forbidden_service_error(service, forbidden_names)
            or _allowed_service_error(service, allowed_names)
            or _service_plan_error(service, allowed_plans)
        )
        if service_error is not None:
            _write_json(
                summary_path,
                {
                    "passed": False,
                    "error": service_error,
                    "render_service": _service_summary(service),
                },
            )
            print(f"[RenderDeployReadyGate] Refusing to wait on Render service: {service_error}", file=sys.stderr)
            return 1

    latest_candidate: dict[str, object] | None = None
    latest_observed_candidate: dict[str, object] | None = None
    while True:
        if expected_deploy_id is None:
            deploys = _list_deploys(api_key, service_id, request_json)
        else:
            deploys = [_retrieve_deploy(api_key, service_id, expected_deploy_id, request_json)]
        observed_candidates = _candidate_deploys(deploys, min_created_at)
        if observed_candidates:
            latest_observed_candidate = observed_candidates[0]
        candidates = [
            deploy
            for deploy in observed_candidates
            if _matches_expected_deploy_id(deploy, expected_deploy_id)
            and _matches_expected_commit(deploy, expected_commit)
        ]
        if candidates:
            latest_candidate = candidates[0]
            status = str(latest_candidate.get("status") or "unknown")
            deploy_id = str(latest_candidate.get("id") or "unknown")
            print(f"[RenderDeployReadyGate] Latest candidate deploy {deploy_id} status: {status}")
            if status == LIVE_STATUS:
                _write_json(
                    summary_path,
                    _deploy_summary(
                        latest_candidate,
                        status,
                        True,
                        expected_commit,
                        expected_deploy_id,
                        latest_observed_candidate,
                    ),
                )
                print("[RenderDeployReadyGate] Render deploy is live.")
                return 0
            if status in FAILED_STATUSES:
                _write_json(
                    summary_path,
                    _deploy_summary(
                        latest_candidate,
                        status,
                        False,
                        expected_commit,
                        expected_deploy_id,
                        latest_observed_candidate,
                    ),
                )
                print(f"[RenderDeployReadyGate] Render deploy failed with status: {status}", file=sys.stderr)
                return 1
        else:
            if expected_deploy_id is not None:
                print("[RenderDeployReadyGate] Waiting for the triggered Render deploy.")
            elif expected_commit is None:
                print("[RenderDeployReadyGate] Waiting for a Render deploy created after the workflow commit timestamp.")
            else:
                print("[RenderDeployReadyGate] Waiting for a Render deploy matching the expected commit.")

        if clock() >= deadline:
            summary = _deploy_summary(
                latest_candidate,
                "timed_out",
                False,
                expected_commit,
                expected_deploy_id,
                latest_observed_candidate,
            )
            summary["error"] = _deploy_timeout_error(
                expected_commit,
                expected_deploy_id,
                latest_candidate,
                latest_observed_candidate,
            )
            _write_json(summary_path, summary)
            print("[RenderDeployReadyGate] Timed out waiting for Render deploy readiness.", file=sys.stderr)
            return 1
        sleeper(poll_seconds)


def main() -> int:
    return run_gate(dict(os.environ), _request_json, time.sleep, time.monotonic)


if __name__ == "__main__":
    raise SystemExit(main())
