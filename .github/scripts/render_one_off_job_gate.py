#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REQUIRED_ENV_NAMES: tuple[str, ...] = (
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
    "RENDER_START_COMMAND",
)
TERMINAL_STATUSES: frozenset[str] = frozenset(("succeeded", "failed", "canceled", "cancelled"))
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_POLL_SECONDS = 10
DEFAULT_SUMMARY_PATH = "artifacts/phase6/staging-integration-smoke/render-one-off-job-summary.json"


JsonRequester = Callable[[str, str, str, dict[str, object] | None], dict[str, object]]
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


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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
        raise RuntimeError(f"Render API {method} failed with status {error.code}: {error_body[:300]}") from error
    except URLError as error:
        raise RuntimeError(f"Render API {method} failed: {error.reason}") from error
    decoded = json.loads(response_body)
    if not isinstance(decoded, dict):
        raise RuntimeError("Render API returned a non-object response.")
    return decoded


def _create_job(api_key: str, service_id: str, start_command: str, request_json: JsonRequester) -> dict[str, object]:
    url = f"https://api.render.com/v1/services/{service_id}/jobs"
    return request_json("POST", url, api_key, {"startCommand": start_command})


def _retrieve_job(api_key: str, service_id: str, job_id: str, request_json: JsonRequester) -> dict[str, object]:
    url = f"https://api.render.com/v1/services/{service_id}/jobs/{job_id}"
    return request_json("GET", url, api_key, None)


def _job_summary(job: dict[str, object], status: str, passed: bool) -> dict[str, object]:
    return {
        "passed": passed,
        "render_job": {
            "created_at": job.get("createdAt"),
            "finished_at": job.get("finishedAt"),
            "id": job.get("id"),
            "started_at": job.get("startedAt"),
            "status": status,
        },
    }


def run_gate(
    env: dict[str, str],
    request_json: JsonRequester,
    sleeper: Sleeper,
    clock: Clock,
) -> int:
    missing = missing_required_env(env)
    summary_path = Path((env.get("RENDER_JOB_SUMMARY_PATH") or DEFAULT_SUMMARY_PATH).strip())
    if missing:
        _write_json(summary_path, {"passed": False, "missing_env": missing})
        print(f"[RenderOneOffJobGate] Missing required env: {', '.join(missing)}", file=sys.stderr)
        return 2

    api_key = env["RENDER_API_KEY"]
    service_id = env["RENDER_SERVICE_ID"]
    start_command = env["RENDER_START_COMMAND"]
    timeout_seconds = _positive_int_env(env, "RENDER_JOB_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)
    poll_seconds = _positive_int_env(env, "RENDER_JOB_POLL_SECONDS", DEFAULT_POLL_SECONDS)
    deadline = clock() + timeout_seconds

    created = _create_job(api_key, service_id, start_command, request_json)
    job_id = str(created.get("id") or "")
    if not job_id:
        _write_json(summary_path, {"passed": False, "error": "render_job_id_missing"})
        print("[RenderOneOffJobGate] Render job id was missing.", file=sys.stderr)
        return 1

    latest_job = created
    status = str(latest_job.get("status") or "created")
    print(f"[RenderOneOffJobGate] Created Render one-off job: {job_id}")
    while status not in TERMINAL_STATUSES:
        if clock() >= deadline:
            _write_json(summary_path, _job_summary(latest_job, "timed_out", False))
            print("[RenderOneOffJobGate] Render one-off job timed out.", file=sys.stderr)
            return 1
        sleeper(poll_seconds)
        latest_job = _retrieve_job(api_key, service_id, job_id, request_json)
        status = str(latest_job.get("status") or "unknown")
        print(f"[RenderOneOffJobGate] Render one-off job status: {status}")

    passed = status == "succeeded"
    _write_json(summary_path, _job_summary(latest_job, status, passed))
    if passed:
        print("[RenderOneOffJobGate] Render one-off staging smoke passed.")
        return 0
    print(f"[RenderOneOffJobGate] Render one-off staging smoke failed with status: {status}", file=sys.stderr)
    return 1


def main() -> int:
    return run_gate(dict(os.environ), _request_json, time.sleep, time.monotonic)


if __name__ == "__main__":
    raise SystemExit(main())
