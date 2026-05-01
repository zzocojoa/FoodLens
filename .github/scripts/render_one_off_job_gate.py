#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Callable
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REQUIRED_ENV_NAMES: tuple[str, ...] = (
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
    "RENDER_START_COMMAND",
)
TERMINAL_STATUSES: frozenset[str] = frozenset(("succeeded", "failed", "canceled", "cancelled"))
EXPECTED_SMOKE_CHECK_NAMES: tuple[str, ...] = (
    "media_delete",
    "retention_retry",
    "postgres_queue_crash_rehearsal",
)
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_POLL_SECONDS = 10
DEFAULT_LOG_WAIT_SECONDS = 60
DEFAULT_SUMMARY_PATH = "artifacts/phase6/staging-integration-smoke/render-one-off-job-summary.json"
DEFAULT_LOG_PATH = "artifacts/phase6/staging-integration-smoke/render-one-off-job.log"
RENDER_API_BASE_URL = "https://api.render.com/v1"
SMOKE_CHECK_PATTERN = re.compile(r"^\[StagingSmoke\]\s+([A-Za-z0-9_]+):\s+(PASS|FAIL)\s*$")
LOG_REDACTION_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"authorization\s*:\s*bearer\s+[\w.\-~+/=]+", re.IGNORECASE), "Authorization: Bearer [REDACTED]"),
    (re.compile(r"\bbearer\s+[\w.\-~+/=]+", re.IGNORECASE), "Bearer [REDACTED]"),
    (re.compile(r"postgres(?:ql)?://[^\s\"'<>]+", re.IGNORECASE), "[REDACTED_DATABASE_URL]"),
    (re.compile(r'"(?:access_token|refresh_token|id_token)"\s*:\s*"[^"]+"', re.IGNORECASE), '"[REDACTED_TOKEN_KEY]":"[REDACTED]"'),
    (re.compile(r'"private_key"\s*:\s*"[^"]+"', re.IGNORECASE), '"private_key":"[REDACTED]"'),
    (re.compile(r"https?://[^\s\"'<>]+/media/render/[^\s\"'<>]+[?&][^\s\"'<>]*sig=[^\s\"'<>]+", re.IGNORECASE), "[REDACTED_SIGNED_MEDIA_RENDER_URL]"),
    (re.compile(r"/media/render/[^\s\"'<>]+[?&][^\s\"'<>]*sig=[^\s\"'<>]+", re.IGNORECASE), "[REDACTED_SIGNED_MEDIA_RENDER_URL]"),
)


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


def _write_text(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


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
    url = f"{RENDER_API_BASE_URL}/services/{service_id}/jobs"
    return request_json("POST", url, api_key, {"startCommand": start_command})


def _retrieve_job(api_key: str, service_id: str, job_id: str, request_json: JsonRequester) -> dict[str, object]:
    url = f"{RENDER_API_BASE_URL}/services/{service_id}/jobs/{job_id}"
    return request_json("GET", url, api_key, None)


def _retrieve_service(api_key: str, service_id: str, request_json: JsonRequester) -> dict[str, object]:
    url = f"{RENDER_API_BASE_URL}/services/{service_id}"
    return request_json("GET", url, api_key, None)


def _extract_owner_id(service: dict[str, object]) -> str:
    owner_id = service.get("ownerId")
    if isinstance(owner_id, str) and owner_id.strip():
        return owner_id
    owner = service.get("owner")
    if isinstance(owner, dict):
        nested_owner_id = owner.get("id")
        if isinstance(nested_owner_id, str) and nested_owner_id.strip():
            return nested_owner_id
    raise RuntimeError("Render service owner id was missing.")


def _list_job_logs(api_key: str, owner_id: str, job_id: str, request_json: JsonRequester) -> dict[str, object]:
    query = urlencode(
        {
            "ownerId": owner_id,
            "resource": job_id,
            "limit": "100",
            "direction": "forward",
        }
    )
    url = f"{RENDER_API_BASE_URL}/logs?{query}"
    return request_json("GET", url, api_key, None)


def _sanitize_log_line(line: str) -> str:
    sanitized = line
    for pattern, replacement in LOG_REDACTION_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def _log_message(entry: object) -> str:
    if isinstance(entry, dict):
        message = entry.get("message") or entry.get("text")
        if isinstance(message, str):
            return message
    return str(entry)


def _log_lines(response: dict[str, object]) -> list[str]:
    logs = response.get("logs")
    if not isinstance(logs, list):
        return []
    return [_sanitize_log_line(_log_message(entry)) for entry in logs]


def _parse_smoke_checks(lines: list[str]) -> dict[str, bool]:
    checks: dict[str, bool] = {}
    for line in lines:
        match = SMOKE_CHECK_PATTERN.match(line.strip())
        if match is None:
            continue
        checks[match.group(1)] = match.group(2) == "PASS"
    return checks


def _expected_checks_passed(checks: dict[str, bool]) -> bool:
    return all(checks.get(name) is True for name in EXPECTED_SMOKE_CHECK_NAMES)


def _expected_checks_observed(checks: dict[str, bool]) -> bool:
    return all(name in checks for name in EXPECTED_SMOKE_CHECK_NAMES)


def _smoke_check_summary(checks: dict[str, bool]) -> dict[str, str]:
    summary: dict[str, str] = {}
    for name in EXPECTED_SMOKE_CHECK_NAMES:
        value = checks.get(name)
        if value is None:
            summary[name] = "missing"
        elif value:
            summary[name] = "pass"
        else:
            summary[name] = "fail"
    return summary


def _collect_job_logs(
    api_key: str,
    service_id: str,
    job_id: str,
    wait_seconds: int,
    request_json: JsonRequester,
    sleeper: Sleeper,
    clock: Clock,
) -> list[str]:
    service = _retrieve_service(api_key, service_id, request_json)
    owner_id = _extract_owner_id(service)
    deadline = clock() + wait_seconds
    latest_lines: list[str] = []
    while True:
        latest_lines = _log_lines(_list_job_logs(api_key, owner_id, job_id, request_json))
        if _expected_checks_observed(_parse_smoke_checks(latest_lines)):
            return latest_lines
        if clock() >= deadline:
            return latest_lines
        sleeper(5)


def _job_summary(
    job: dict[str, object],
    status: str,
    passed: bool,
    smoke_checks: dict[str, bool],
    log_path: Path,
    log_collection_error: str | None,
    log_line_count: int,
) -> dict[str, object]:
    log_evidence: dict[str, object] = {
        "line_count": log_line_count,
        "path": str(log_path),
    }
    if log_collection_error is not None:
        log_evidence["collection_error"] = log_collection_error
    return {
        "passed": passed,
        "log_evidence": log_evidence,
        "render_job": {
            "created_at": job.get("createdAt"),
            "finished_at": job.get("finishedAt"),
            "id": job.get("id"),
            "started_at": job.get("startedAt"),
            "status": status,
        },
        "smoke_checks": _smoke_check_summary(smoke_checks),
    }


def run_gate(
    env: dict[str, str],
    request_json: JsonRequester,
    sleeper: Sleeper,
    clock: Clock,
) -> int:
    missing = missing_required_env(env)
    summary_path = Path((env.get("RENDER_JOB_SUMMARY_PATH") or DEFAULT_SUMMARY_PATH).strip())
    log_path = Path((env.get("RENDER_JOB_LOG_PATH") or DEFAULT_LOG_PATH).strip())
    if missing:
        _write_json(summary_path, {"passed": False, "missing_env": missing})
        print(f"[RenderOneOffJobGate] Missing required env: {', '.join(missing)}", file=sys.stderr)
        return 2

    api_key = env["RENDER_API_KEY"]
    service_id = env["RENDER_SERVICE_ID"]
    start_command = env["RENDER_START_COMMAND"]
    timeout_seconds = _positive_int_env(env, "RENDER_JOB_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS)
    poll_seconds = _positive_int_env(env, "RENDER_JOB_POLL_SECONDS", DEFAULT_POLL_SECONDS)
    log_wait_seconds = _positive_int_env(env, "RENDER_JOB_LOG_WAIT_SECONDS", DEFAULT_LOG_WAIT_SECONDS)
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
    empty_checks: dict[str, bool] = {}
    while status not in TERMINAL_STATUSES:
        if clock() >= deadline:
            _write_json(summary_path, _job_summary(latest_job, "timed_out", False, empty_checks, log_path, None, 0))
            print("[RenderOneOffJobGate] Render one-off job timed out.", file=sys.stderr)
            return 1
        sleeper(poll_seconds)
        latest_job = _retrieve_job(api_key, service_id, job_id, request_json)
        status = str(latest_job.get("status") or "unknown")
        print(f"[RenderOneOffJobGate] Render one-off job status: {status}")

    log_lines: list[str] = []
    log_collection_error: str | None = None
    try:
        log_lines = _collect_job_logs(
            api_key,
            service_id,
            job_id,
            log_wait_seconds,
            request_json,
            sleeper,
            clock,
        )
        _write_text(log_path, log_lines)
    except RuntimeError as error:
        log_collection_error = _sanitize_log_line(str(error))
        _write_text(log_path, [f"[RenderOneOffJobGate] log collection failed: {type(error).__name__}"])

    smoke_checks = _parse_smoke_checks(log_lines)
    passed = status == "succeeded" and _expected_checks_passed(smoke_checks)
    _write_json(summary_path, _job_summary(latest_job, status, passed, smoke_checks, log_path, log_collection_error, len(log_lines)))
    if passed:
        print("[RenderOneOffJobGate] Render one-off staging smoke passed.")
        return 0
    missing_checks = [name for name in EXPECTED_SMOKE_CHECK_NAMES if smoke_checks.get(name) is not True]
    if status == "succeeded" and missing_checks:
        print(
            f"[RenderOneOffJobGate] Render job succeeded but smoke log evidence is missing or failed: {', '.join(missing_checks)}",
            file=sys.stderr,
        )
        return 1
    print(f"[RenderOneOffJobGate] Render one-off staging smoke failed with status: {status}", file=sys.stderr)
    return 1


def main() -> int:
    return run_gate(dict(os.environ), _request_json, time.sleep, time.monotonic)


if __name__ == "__main__":
    raise SystemExit(main())
