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
LIVE_STATUS = "live"
FAILED_STATUSES: frozenset[str] = frozenset(("build_failed", "update_failed", "canceled", "cancelled"))
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_POLL_SECONDS = 10
DEFAULT_SUMMARY_PATH = "artifacts/phase6/staging-integration-smoke/render-deploy-ready-summary.json"


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


def _truthy_env(env: dict[str, str], name: str) -> bool:
    return (env.get(name) or "").strip().lower() in {"1", "true", "yes"}


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
        raise RuntimeError(f"Render API {method} failed with status {error.code}: {error_body[:300]}") from error
    except URLError as error:
        raise RuntimeError(f"Render API {method} failed: {error.reason}") from error
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


def _list_deploys(api_key: str, service_id: str, request_json: JsonRequester) -> list[dict[str, object]]:
    query = urlencode({"limit": "20"})
    url = f"https://api.render.com/v1/services/{service_id}/deploys?{query}"
    return _extract_deploys(request_json("GET", url, api_key))


def _deploy_created_at(deploy: dict[str, object]) -> datetime | None:
    created_at = deploy.get("createdAt")
    if not isinstance(created_at, str):
        return None
    try:
        return _parse_timestamp(created_at)
    except ValueError:
        return None


def _candidate_deploys(deploys: list[dict[str, object]], min_created_at: datetime) -> list[dict[str, object]]:
    return [
        deploy
        for deploy in deploys
        if (created_at := _deploy_created_at(deploy)) is not None and created_at >= min_created_at
    ]


def _latest_live_deploy(deploys: list[dict[str, object]]) -> dict[str, object] | None:
    for deploy in deploys:
        if str(deploy.get("status") or "unknown") == LIVE_STATUS:
            return deploy
    return None


def _deploy_summary(deploy: dict[str, object] | None, status: str, passed: bool) -> dict[str, object]:
    selected = deploy or {}
    return {
        "passed": passed,
        "render_deploy": {
            "created_at": selected.get("createdAt"),
            "finished_at": selected.get("finishedAt"),
            "id": selected.get("id"),
            "status": status,
            "updated_at": selected.get("updatedAt"),
        },
    }


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
    min_created_at = _parse_timestamp(env["RENDER_DEPLOY_MIN_CREATED_AT"])
    timeout_seconds = _positive_int_env(env, "RENDER_DEPLOY_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)
    poll_seconds = _positive_int_env(env, "RENDER_DEPLOY_POLL_SECONDS", DEFAULT_POLL_SECONDS)
    allow_existing_live = _truthy_env(env, "RENDER_DEPLOY_ALLOW_EXISTING_LIVE")
    deadline = clock() + timeout_seconds

    latest_candidate: dict[str, object] | None = None
    while True:
        deploys = _list_deploys(api_key, service_id, request_json)
        candidates = _candidate_deploys(deploys, min_created_at)
        if candidates:
            latest_candidate = candidates[0]
            status = str(latest_candidate.get("status") or "unknown")
            deploy_id = str(latest_candidate.get("id") or "unknown")
            print(f"[RenderDeployReadyGate] Latest candidate deploy {deploy_id} status: {status}")
            if status == LIVE_STATUS:
                _write_json(summary_path, _deploy_summary(latest_candidate, status, True))
                print("[RenderDeployReadyGate] Render deploy is live.")
                return 0
            if status in FAILED_STATUSES:
                _write_json(summary_path, _deploy_summary(latest_candidate, status, False))
                print(f"[RenderDeployReadyGate] Render deploy failed with status: {status}", file=sys.stderr)
                return 1
        else:
            if allow_existing_live:
                latest_live = _latest_live_deploy(deploys)
                if latest_live is not None:
                    _write_json(summary_path, _deploy_summary(latest_live, LIVE_STATUS, True))
                    print("[RenderDeployReadyGate] Reusing existing live Render deploy.")
                    return 0
            print("[RenderDeployReadyGate] Waiting for a Render deploy created after the workflow commit timestamp.")

        if clock() >= deadline:
            _write_json(summary_path, _deploy_summary(latest_candidate, "timed_out", False))
            print("[RenderDeployReadyGate] Timed out waiting for Render deploy readiness.", file=sys.stderr)
            return 1
        sleeper(poll_seconds)


def main() -> int:
    return run_gate(dict(os.environ), _request_json, time.sleep, time.monotonic)


if __name__ == "__main__":
    raise SystemExit(main())
