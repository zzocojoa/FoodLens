#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence
from urllib.parse import urlparse

VALID_AUTH_STATE_BACKENDS: tuple[str, ...] = ("memory", "postgres")
EXPECTED_BACKENDS: tuple[str, ...] = ("any", "memory", "postgres")
OAUTH_STATE_FAILURE_LOG_FIELDS: tuple[str, ...] = (
    "request_id",
    "provider",
    "failure_code",
    "state_age_bucket",
)
RENDER_INSTANCE_COUNT_ENV_NAMES: tuple[str, ...] = (
    "RENDER_FOODLENS_API_INSTANCE_COUNT",
    "FOODLENS_API_INSTANCE_COUNT",
    "RENDER_SERVICE_INSTANCE_COUNT",
)


@dataclass(frozen=True)
class CheckResult:
    name: str
    passed: bool
    message: str


@dataclass(frozen=True)
class RuntimeConfig:
    requested_backend: str
    resolved_backend: str
    database_url_set: bool
    masked_database_url: str
    token_hash_secret_set: bool
    render_instance_count_env_name: str
    render_instance_count_value: str


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _mask_database_url(value: str) -> str:
    normalized_value = value.strip()
    if not normalized_value:
        return "unset"
    parsed = urlparse(normalized_value)
    if parsed.scheme:
        return f"{parsed.scheme}://[REDACTED_DATABASE_URL]"
    return "[REDACTED_DATABASE_URL]"


def _requested_backend(env: Mapping[str, str]) -> str:
    return (env.get("AUTH_STATE_BACKEND") or "").strip().lower()


def _resolved_backend(env: Mapping[str, str]) -> str:
    requested_backend = _requested_backend(env=env)
    if requested_backend:
        return requested_backend
    database_url = (env.get("DATABASE_URL") or "").strip()
    if database_url:
        return "postgres"
    return "memory"


def _runtime_config(env: Mapping[str, str]) -> RuntimeConfig:
    database_url = (env.get("DATABASE_URL") or "").strip()
    token_hash_secret = (env.get("AUTH_TOKEN_HASH_SECRET") or "").strip()
    requested_backend = _requested_backend(env=env)
    render_instance_count_env_name, render_instance_count_value = _render_instance_count(env=env)
    return RuntimeConfig(
        requested_backend=requested_backend or "auto",
        resolved_backend=_resolved_backend(env=env),
        database_url_set=bool(database_url),
        masked_database_url=_mask_database_url(value=database_url),
        token_hash_secret_set=bool(token_hash_secret),
        render_instance_count_env_name=render_instance_count_env_name,
        render_instance_count_value=render_instance_count_value,
    )


def _render_instance_count(env: Mapping[str, str]) -> tuple[str, str]:
    for env_name in RENDER_INSTANCE_COUNT_ENV_NAMES:
        env_value = (env.get(env_name) or "").strip()
        if env_value:
            return (env_name, env_value)
    return ("unset", "")


def _render_instance_count_display(config: RuntimeConfig) -> str:
    if not config.render_instance_count_value:
        return "unset"
    if config.render_instance_count_value.isdigit():
        return f"{config.render_instance_count_env_name}={config.render_instance_count_value}"
    return f"{config.render_instance_count_env_name}=invalid"


def _backend_is_valid(config: RuntimeConfig) -> CheckResult:
    if config.resolved_backend in VALID_AUTH_STATE_BACKENDS:
        return CheckResult(
            name="auth_state_backend_valid",
            passed=True,
            message=f"resolved_backend={config.resolved_backend}",
        )
    return CheckResult(
        name="auth_state_backend_valid",
        passed=False,
        message="AUTH_STATE_BACKEND must be one of: memory, postgres, or unset for auto resolution.",
    )


def _expected_backend_matches(config: RuntimeConfig, expected_backend: str) -> CheckResult:
    if expected_backend == "any":
        return CheckResult(
            name="expected_backend",
            passed=True,
            message="expected_backend=any",
        )
    return CheckResult(
        name="expected_backend",
        passed=config.resolved_backend == expected_backend,
        message=f"expected_backend={expected_backend} resolved_backend={config.resolved_backend}",
    )


def _postgres_env_is_complete(config: RuntimeConfig) -> CheckResult:
    if config.resolved_backend != "postgres":
        return CheckResult(
            name="postgres_env_complete",
            passed=True,
            message="postgres checks skipped for memory backend",
        )
    missing_names: list[str] = []
    if not config.database_url_set:
        missing_names.append("DATABASE_URL")
    if not config.token_hash_secret_set:
        missing_names.append("AUTH_TOKEN_HASH_SECRET")
    if missing_names:
        return CheckResult(
            name="postgres_env_complete",
            passed=False,
            message="missing=" + ",".join(missing_names),
        )
    return CheckResult(
        name="postgres_env_complete",
        passed=True,
        message="DATABASE_URL and AUTH_TOKEN_HASH_SECRET are set",
    )


def _database_url_scheme_is_valid(env: Mapping[str, str], config: RuntimeConfig) -> CheckResult:
    if config.resolved_backend != "postgres":
        return CheckResult(
            name="database_url_scheme",
            passed=True,
            message="scheme check skipped for memory backend",
        )
    database_url = (env.get("DATABASE_URL") or "").strip()
    parsed = urlparse(database_url)
    return CheckResult(
        name="database_url_scheme",
        passed=parsed.scheme in ("postgres", "postgresql"),
        message=f"DATABASE_URL={config.masked_database_url}",
    )


def _shared_state_is_required(config: RuntimeConfig, require_shared_state: bool) -> CheckResult:
    if not require_shared_state:
        return CheckResult(
            name="shared_state_required",
            passed=True,
            message="require_shared_state=false",
        )
    if config.resolved_backend != "postgres":
        return CheckResult(
            name="shared_state_required",
            passed=False,
            message="persisted OAuth state requires AUTH_STATE_BACKEND=postgres.",
        )
    if not config.database_url_set or not config.token_hash_secret_set:
        return CheckResult(
            name="shared_state_required",
            passed=False,
            message="persisted OAuth state requires DATABASE_URL and AUTH_TOKEN_HASH_SECRET.",
        )
    return CheckResult(
        name="shared_state_required",
        passed=True,
        message="persisted state backend is configured",
    )


def _single_render_instance_is_required(
    config: RuntimeConfig,
    require_single_render_instance: bool,
) -> CheckResult:
    if not require_single_render_instance:
        return CheckResult(
            name="single_render_instance_required",
            passed=True,
            message="require_single_render_instance=false",
        )
    if not config.render_instance_count_value:
        return CheckResult(
            name="single_render_instance_required",
            passed=False,
            message="set one of "
            + ",".join(RENDER_INSTANCE_COUNT_ENV_NAMES)
            + " to the verified Render foodlens-api instance count.",
        )
    if not config.render_instance_count_value.isdigit():
        return CheckResult(
            name="single_render_instance_required",
            passed=False,
            message=f"{config.render_instance_count_env_name} must be a positive integer.",
        )
    render_instance_count = int(config.render_instance_count_value)
    return CheckResult(
        name="single_render_instance_required",
        passed=render_instance_count == 1,
        message=(
            "foodlens-api instance count must stay 1 until atomic OAuth state consume is deployed "
            "and live-concurrency validated. "
            f"current_count={render_instance_count}"
        ),
    )


def _server_log_fields_are_present(repo_root: Path) -> CheckResult:
    server_path = repo_root / "backend" / "server.py"
    server_source = server_path.read_text(encoding="utf-8")
    missing_fields = [
        field_name
        for field_name in OAUTH_STATE_FAILURE_LOG_FIELDS
        if f'"{field_name}"' not in server_source
    ]
    if "[OAuthState] validation failed" not in server_source:
        missing_fields.append("oauth_state_log_message")
    if missing_fields:
        return CheckResult(
            name="oauth_state_failure_log_fields",
            passed=False,
            message="missing=" + ",".join(missing_fields),
        )
    return CheckResult(
        name="oauth_state_failure_log_fields",
        passed=True,
        message="fields=" + ",".join(OAUTH_STATE_FAILURE_LOG_FIELDS),
    )


def _live_smoke_supports_dry_run(repo_root: Path) -> CheckResult:
    smoke_path = repo_root / "backend" / "scripts" / "ci_auth_live_provider_smoke.sh"
    smoke_source = smoke_path.read_text(encoding="utf-8")
    missing_terms = [
        term
        for term in ("--dry-run", "AUTH_PROVIDER_SMOKE_MODE", "code_challenge_method", "No network requests")
        if term not in smoke_source
    ]
    if missing_terms:
        return CheckResult(
            name="live_provider_smoke_dry_run",
            passed=False,
            message="missing=" + ",".join(missing_terms),
        )
    return CheckResult(
        name="live_provider_smoke_dry_run",
        passed=True,
        message="dry-run smoke coverage present",
    )


def _build_results(
    *,
    env: Mapping[str, str],
    repo_root: Path,
    expected_backend: str,
    require_shared_state: bool,
    require_single_render_instance: bool,
) -> list[CheckResult]:
    config = _runtime_config(env=env)
    return [
        _backend_is_valid(config=config),
        _expected_backend_matches(config=config, expected_backend=expected_backend),
        _postgres_env_is_complete(config=config),
        _database_url_scheme_is_valid(env=env, config=config),
        _shared_state_is_required(config=config, require_shared_state=require_shared_state),
        _single_render_instance_is_required(
            config=config,
            require_single_render_instance=require_single_render_instance,
        ),
        _server_log_fields_are_present(repo_root=repo_root),
        _live_smoke_supports_dry_run(repo_root=repo_root),
    ]


def _print_config(config: RuntimeConfig) -> None:
    token_hash_secret_status = "set" if config.token_hash_secret_set else "unset"
    print("[AuthStateBackendSmoke] dry-run=true")
    print(f"[AuthStateBackendSmoke] requested_backend={config.requested_backend}")
    print(f"[AuthStateBackendSmoke] resolved_backend={config.resolved_backend}")
    print(f"[AuthStateBackendSmoke] DATABASE_URL={config.masked_database_url}")
    print(f"[AuthStateBackendSmoke] AUTH_TOKEN_HASH_SECRET={token_hash_secret_status}")
    print(f"[AuthStateBackendSmoke] render_instance_count={_render_instance_count_display(config=config)}")
    print(
        "[AuthStateBackendSmoke] oauth_state_failure_log_fields="
        + ",".join(OAUTH_STATE_FAILURE_LOG_FIELDS)
    )


def _print_results(results: Sequence[CheckResult]) -> None:
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"[AuthStateBackendSmoke] {status} {result.name}: {result.message}")


def _parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dry-run OAuth auth state backend and log alert configuration checks."
    )
    parser.add_argument(
        "--expected-backend",
        choices=EXPECTED_BACKENDS,
        default="any",
        help="Expected resolved auth state backend for this environment.",
    )
    parser.add_argument(
        "--require-shared-state",
        action="store_true",
        help="Require a persisted postgres auth state backend for staging/prod.",
    )
    parser.add_argument(
        "--require-single-render-instance",
        action="store_true",
        help="Require Render foodlens-api instance count to be explicitly verified as 1.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str]) -> int:
    args = _parse_args(argv=argv)
    env = os.environ
    config = _runtime_config(env=env)
    results = _build_results(
        env=env,
        repo_root=_repo_root(),
        expected_backend=str(args.expected_backend),
        require_shared_state=bool(args.require_shared_state),
        require_single_render_instance=bool(args.require_single_render_instance),
    )
    _print_config(config=config)
    _print_results(results=results)
    if all(result.passed for result in results):
        print("[AuthStateBackendSmoke] checks passed.")
        return 0
    print("[AuthStateBackendSmoke] checks failed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(argv=sys.argv[1:]))
