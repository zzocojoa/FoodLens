#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BLUEPRINT_PATH="${ROOT_DIR}/render.yaml"

if [[ ! -f "${BLUEPRINT_PATH}" ]]; then
  echo "[Render Blueprint Gate] missing file: ${BLUEPRINT_PATH}"
  exit 1
fi

echo "[Render Blueprint Gate] validating ${BLUEPRINT_PATH}"

python3 - "${BLUEPRINT_PATH}" <<'PY'
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any


def fail(message: str) -> None:
    print(f"[Render Blueprint Gate] {message}")
    raise SystemExit(1)


def unquote(value: str) -> str:
    trimmed = value.strip()
    if len(trimmed) >= 2 and trimmed[0] == '"' and trimmed[-1] == '"':
        return trimmed[1:-1]
    if len(trimmed) >= 2 and trimmed[0] == "'" and trimmed[-1] == "'":
        return trimmed[1:-1]
    return trimmed


def field_value(block: list[str], field_name: str) -> str | None:
    pattern = re.compile(rf"^\s+{re.escape(field_name)}:\s*(.*)$")
    for line in block:
        match = pattern.match(line)
        if match is not None:
            return unquote(match.group(1))
    return None


def parse_env_vars(block: list[str]) -> dict[str, dict[str, str | None]]:
    env_vars: dict[str, dict[str, str | None]] = {}
    current_key: str | None = None
    for line in block:
        key_match = re.match(r"^\s+- key:\s*([A-Z0-9_]+)\s*$", line)
        if key_match is not None:
            current_key = key_match.group(1)
            env_vars[current_key] = {"value": None, "sync": None}
            continue
        if current_key is None:
            continue
        value_match = re.match(r"^\s+value:\s*(.*)$", line)
        if value_match is not None and env_vars[current_key]["value"] is None:
            env_vars[current_key]["value"] = unquote(value_match.group(1))
            continue
        sync_match = re.match(r"^\s+sync:\s*(\S+)\s*$", line)
        if sync_match is not None and env_vars[current_key]["sync"] is None:
            env_vars[current_key]["sync"] = sync_match.group(1)
            continue
    return env_vars


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def require_env_key(env_vars: dict[str, dict[str, str | None]], key: str) -> None:
    require(key in env_vars, f"missing env key: {key}")


def require_env_value(env_vars: dict[str, dict[str, str | None]], key: str, expected: str) -> None:
    require_env_key(env_vars, key)
    actual = env_vars[key]["value"]
    require(actual == expected, f"unexpected env value for {key}: expected {expected}, got {actual}")


def require_env_int_at_least(env_vars: dict[str, dict[str, str | None]], key: str, minimum: int) -> None:
    require_env_key(env_vars, key)
    raw_value = env_vars[key]["value"]
    try:
        parsed = int(str(raw_value))
    except ValueError as error:
        fail(f"env value for {key} is not an integer: {raw_value}")
        raise error
    require(parsed >= minimum, f"env value for {key} must be >= {minimum}, got {parsed}")


def parse_services(lines: list[str]) -> list[dict[str, Any]]:
    starts = [index for index, line in enumerate(lines) if re.match(r"^  - type: ", line)]
    require(bool(starts), "no services found in render.yaml")
    services: list[dict[str, Any]] = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        block = lines[start:end]
        start_match = re.match(r"^  - type:\s*(\S+)\s*$", block[0])
        require(start_match is not None, f"unable to parse service type from line: {block[0]}")
        services.append(
            {
                "block": block,
                "type": start_match.group(1) if start_match is not None else None,
                "name": field_value(block, "name"),
                "runtime": field_value(block, "runtime"),
                "plan": field_value(block, "plan"),
                "docker_context": field_value(block, "dockerContext"),
                "dockerfile_path": field_value(block, "dockerfilePath"),
                "docker_command": field_value(block, "dockerCommand"),
                "health_check_path": field_value(block, "healthCheckPath"),
                "schedule": field_value(block, "schedule"),
                "max_shutdown_delay_seconds": field_value(block, "maxShutdownDelaySeconds"),
                "env_vars": parse_env_vars(block),
            }
        )
    return services


def main() -> None:
    path = Path(sys.argv[1])
    lines = path.read_text(encoding="utf-8").splitlines()
    services = parse_services(lines)

    require(len(services) == 3, f"expected 3 services, found {len(services)}")
    service_map = {service["name"]: service for service in services}
    expected_names = {"foodlens-api", "foodlens-worker", "foodlens-retention-cron"}
    require(set(service_map) == expected_names, f"unexpected service names: {sorted(service_map)}")

    required_env_keys = [
        "PORT",
        "DATABASE_URL",
        "AUTH_STATE_BACKEND",
        "AUTH_STATE_TABLE",
        "AUTH_STATE_KEY",
        "OPENAPI_EXPORT_ONLY",
        "ANALYSIS_RATE_LIMIT_ENABLED",
        "ANALYSIS_RATE_LIMIT_WINDOW_SECONDS",
        "ANALYSIS_RATE_LIMIT_ANALYZE_PER_MIN",
        "ANALYSIS_RATE_LIMIT_LABEL_PER_MIN",
        "ANALYSIS_RATE_LIMIT_SMART_PER_MIN",
        "ANALYSIS_RATE_LIMIT_JOBS_PER_MIN",
        "ANALYSIS_RATE_LIMIT_JOB_STATUS_PER_MIN",
        "ANALYSIS_RATE_LIMIT_BARCODE_PER_MIN",
        "ANALYSIS_INFLIGHT_GUARD_ENABLED",
        "ANALYSIS_INFLIGHT_MAX_ANALYZE",
        "ANALYSIS_INFLIGHT_MAX_LABEL",
        "ANALYSIS_INFLIGHT_MAX_SMART",
        "ANALYSIS_INFLIGHT_MAX_JOBS",
        "ANALYSIS_INFLIGHT_MAX_BARCODE",
        "ANALYSIS_INFLIGHT_RETRY_AFTER_SECONDS",
        "ANALYSIS_JOB_BACKEND",
        "ANALYSIS_JOB_TABLE",
        "ANALYSIS_JOB_WORKER_COUNT",
        "ANALYSIS_JOB_LEASE_SECONDS",
        "ANALYSIS_JOB_POLL_AFTER_MS",
        "ANALYSIS_JOB_POLL_INTERVAL_SECONDS",
        "ANALYSIS_JOB_MAX_UPLOAD_BYTES",
        "ANALYSIS_NUTRITION_CACHE_BACKEND",
        "ANALYSIS_NUTRITION_CACHE_TABLE",
        "ANALYSIS_NUTRITION_BUDGET_SECONDS",
        "ANALYSIS_NUTRITION_MAX_PARALLELISM",
        "ANALYSIS_CORS_ALLOWED_ORIGINS",
        "UPSTREAM_429_RETRY_AFTER_SECONDS",
        "GEMINI_RETRY_TIMEOUT_SECONDS",
        "GEMINI_RETRY_MAX_ATTEMPTS",
        "LABEL_COST_GUARDRAIL_ENABLED",
        "LABEL_MONTHLY_BUDGET_USD",
        "LABEL_ESTIMATED_COST_USD_PER_REQUEST",
        "LABEL_ESTIMATED_TOKENS_PER_REQUEST",
        "LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE",
        "LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE",
        "GCP_PROJECT_ID",
        "GCP_SERVICE_ACCOUNT_JSON",
        "AUTH_PUBLIC_BASE_URL",
        "MEDIA_PUBLIC_BASE_URL",
        "MEDIA_STORAGE_BACKEND",
        "MEDIA_GCS_BUCKET",
        "MEDIA_GCS_PREFIX",
        "MEDIA_MAX_UPLOAD_MB",
        "MEDIA_RENDER_SIGNING_SECRET",
        "MEDIA_RENDER_URL_TTL_SECONDS",
        "MEDIA_RENDER_SIGN_BUCKET_SECONDS",
        "MEDIA_RENDER_ALLOWED_WIDTHS",
        "MEDIA_RENDER_QUALITY_MIN",
        "MEDIA_RENDER_QUALITY_MAX",
        "MEDIA_RENDER_DEFAULT_WIDTH",
        "MEDIA_RENDER_DEFAULT_QUALITY",
        "MEDIA_RENDER_WEBP_METHOD",
        "MEDIA_RENDER_CACHE_ENABLED",
        "MEDIA_RENDER_CACHE_MAX_ITEMS",
        "MEDIA_RENDER_CACHE_TTL_SECONDS",
        "AUTH_APP_ALLOWED_REDIRECT_URIS",
        "AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS",
        "AUTH_GOOGLE_CLIENT_ID",
        "AUTH_GOOGLE_CLIENT_SECRET",
        "AUTH_GOOGLE_CODE_VERIFY_ENABLED",
        "AUTH_GOOGLE_OAUTH_SCOPE",
        "AUTH_GOOGLE_OAUTH_PROMPT",
        "AUTH_KAKAO_CLIENT_ID",
        "AUTH_KAKAO_CLIENT_SECRET",
        "AUTH_KAKAO_CODE_VERIFY_ENABLED",
        "AUTH_KAKAO_OAUTH_SCOPE",
        "AUTH_EMAIL_VERIFICATION_REQUIRED",
        "AUTH_EMAIL_VERIFICATION_DELIVERY_MODE",
        "AUTH_EMAIL_SMTP_HOST",
        "AUTH_EMAIL_SMTP_PORT",
        "AUTH_EMAIL_SMTP_USERNAME",
        "AUTH_EMAIL_SMTP_PASSWORD",
        "AUTH_EMAIL_SMTP_STARTTLS",
        "AUTH_EMAIL_SMTP_SSL",
        "AUTH_EMAIL_SMTP_TIMEOUT_SECONDS",
        "AUTH_EMAIL_SMTP_MAX_ATTEMPTS",
        "AUTH_EMAIL_SENDER_FROM",
        "AUTH_EMAIL_SENDER_NAME",
        "LABEL_ROLLOUT_ENABLED",
        "LABEL_ROLLOUT_STAGE",
        "LABEL_ROLLOUT_KPI_PARSE_SUCCESS",
        "LABEL_ROLLOUT_KPI_P95_MS",
        "LABEL_ROLLOUT_KPI_5XX_RATE",
        "LABEL_ROLLOUT_AUTO_ENABLED",
        "LABEL_ROLLOUT_PROMOTE_AFTER_PASSES",
        "LABEL_ROLLOUT_ROLLBACK_STAGE",
        "LABEL_ROLLOUT_STATE_BACKEND",
        "LABEL_ROLLOUT_STATE_PATH",
        "DATAGO_API_KEY",
        "DATAGO_I2790_API_KEY",
        "KOREAN_FDA_API_KEY",
        "PUBLIC_DATA_AUTH_COOLDOWN_SECONDS",
        "BARCODE_LOOKUP_CACHE_TTL_SECONDS",
        "BARCODE_LOOKUP_CACHE_MAX_ENTRIES",
        "BARCODE_LOOKUP_CACHE_PATH",
        "BARCODE_UPSTREAM_TIMEOUT_SECONDS",
        "BARCODE_UPSTREAM_RETRY_COUNT",
        "BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS",
        "BARCODE_DATAGO_FAILURE_THRESHOLD",
        "BARCODE_DATAGO_UNHEALTHY_COOLDOWN_SECONDS",
        "RETENTION_STORE_BACKEND",
        "RETENTION_STORE_TABLE",
        "RETENTION_DELETE_BACKEND",
        "RETENTION_CLEANUP_INTERVAL_SECONDS",
        "RETENTION_ORIGINAL_TTL_DAYS",
        "RETENTION_DERIVED_TTL_DAYS",
        "RETENTION_LOG_TTL_DAYS",
        "DELETION_QUEUE_BACKEND",
        "DELETION_QUEUE_TABLE",
        "DELETION_STATUS_TABLE",
        "DELETION_HANDLER_BACKEND",
        "DELETION_QUEUE_INTERVAL_SECONDS",
        "DELETION_QUEUE_MAX_BATCH",
        "SENTRY_DSN",
        "SENTRY_ENVIRONMENT",
    ]

    for service_name in expected_names:
        env_vars = service_map[service_name]["env_vars"]
        for required_key in required_env_keys:
            require_env_key(env_vars, required_key)

    web = service_map["foodlens-api"]
    worker = service_map["foodlens-worker"]
    cron = service_map["foodlens-retention-cron"]

    require(web["type"] == "web", f"foodlens-api type must be web, got {web['type']}")
    require(web["runtime"] == "docker", f"foodlens-api runtime must be docker, got {web['runtime']}")
    require(web["plan"] == "starter", f"foodlens-api plan must be starter, got {web['plan']}")
    require(web["docker_context"] == ".", f"foodlens-api dockerContext must be ., got {web['docker_context']}")
    require(web["dockerfile_path"] == "./Dockerfile", f"foodlens-api dockerfilePath must be ./Dockerfile, got {web['dockerfile_path']}")
    require(web["docker_command"] == "python -m backend.server", f"foodlens-api dockerCommand mismatch: {web['docker_command']}")
    require(web["health_check_path"] == "/health/ready", f"foodlens-api healthCheckPath mismatch: {web['health_check_path']}")
    require(web["schedule"] is None, "foodlens-api must not define schedule")
    require_env_value(web["env_vars"], "ANALYSIS_JOB_WORKER_COUNT", "0")

    require(worker["type"] == "worker", f"foodlens-worker type must be worker, got {worker['type']}")
    require(worker["runtime"] == "docker", f"foodlens-worker runtime must be docker, got {worker['runtime']}")
    require(worker["plan"] == "starter", f"foodlens-worker plan must be starter, got {worker['plan']}")
    require(worker["docker_context"] == ".", f"foodlens-worker dockerContext must be ., got {worker['docker_context']}")
    require(worker["dockerfile_path"] == "./Dockerfile", f"foodlens-worker dockerfilePath must be ./Dockerfile, got {worker['dockerfile_path']}")
    require(worker["docker_command"] == "python -m backend.worker_main", f"foodlens-worker dockerCommand mismatch: {worker['docker_command']}")
    require(worker["health_check_path"] is None, "foodlens-worker must not define healthCheckPath")
    require(worker["schedule"] is None, "foodlens-worker must not define schedule")
    require_env_int_at_least(worker["env_vars"], "ANALYSIS_JOB_WORKER_COUNT", 1)
    require(worker["max_shutdown_delay_seconds"] == "300", f"foodlens-worker maxShutdownDelaySeconds must be 300, got {worker['max_shutdown_delay_seconds']}")

    require(cron["type"] == "cron", f"foodlens-retention-cron type must be cron, got {cron['type']}")
    require(cron["runtime"] == "docker", f"foodlens-retention-cron runtime must be docker, got {cron['runtime']}")
    require(cron["plan"] == "starter", f"foodlens-retention-cron plan must be starter, got {cron['plan']}")
    require(cron["docker_context"] == ".", f"foodlens-retention-cron dockerContext must be ., got {cron['docker_context']}")
    require(cron["dockerfile_path"] == "./Dockerfile", f"foodlens-retention-cron dockerfilePath must be ./Dockerfile, got {cron['dockerfile_path']}")
    require(cron["docker_command"] == "python -m backend.retention_cron_main", f"foodlens-retention-cron dockerCommand mismatch: {cron['docker_command']}")
    require(cron["health_check_path"] is None, "foodlens-retention-cron must not define healthCheckPath")
    require(cron["schedule"] == "0 * * * *", f"foodlens-retention-cron schedule mismatch: {cron['schedule']}")
    require_env_value(cron["env_vars"], "ANALYSIS_JOB_WORKER_COUNT", "0")

    print("[Render Blueprint Gate] service structure and env contract checks passed.")


if __name__ == "__main__":
    main()
PY
