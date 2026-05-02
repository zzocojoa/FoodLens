#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Mapping, Sequence
from urllib.parse import urlsplit
from uuid import uuid4

DATABASE_URL_ENV_NAME = "DATABASE_URL"
ENABLE_ENV_NAME = "FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE"
ENABLE_ENV_VALUE = "1"
TABLE_PREFIX_ENV_NAME = "COST_GUARDRAIL_POSTGRES_SMOKE_TABLE_PREFIX"
DEFAULT_TABLE_PREFIX = "cost_guardrail_smoke"
POSTGRES_IDENTIFIER_MAX_LENGTH = 63
RUN_ID_LENGTH = 12
RESERVATION_SUFFIX = "_reservations"
DATABASE_URL_PATTERN = re.compile(r"postgres(?:ql)?://[^\s'\"),]+", re.IGNORECASE)
PSYCOPG_HOST_FIELD_PATTERN = re.compile(r"(host(?:addr)?):\s*'[^']+'", re.IGNORECASE)
IPV4_PATTERN = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


@dataclass(frozen=True)
class SmokeCheck:
    name: str
    passed: bool
    details: dict[str, object]


@dataclass(frozen=True)
class SmokeOutcome:
    status: Literal["passed", "failed", "skipped"]
    exit_code: int
    checks: tuple[SmokeCheck, ...]
    details: dict[str, object]


@dataclass(frozen=True)
class SmokeTableNames:
    usage_table: str
    reservation_table: str


def _ensure_repo_root_on_path() -> None:
    root = Path(__file__).resolve().parents[2]
    root_value = str(root)
    if root_value not in sys.path:
        sys.path.insert(0, root_value)


def _safe_error_message(error: BaseException, env: Mapping[str, str]) -> str:
    message = str(error)
    database_url = env.get(DATABASE_URL_ENV_NAME)
    if database_url:
        message = message.replace(database_url, "[REDACTED_DATABASE_URL]")
        try:
            parsed_url = urlsplit(database_url)
        except ValueError:
            parsed_url = None
        if parsed_url is not None:
            for value in (
                parsed_url.netloc,
                parsed_url.hostname or "",
                parsed_url.username or "",
                parsed_url.password or "",
            ):
                if value:
                    message = message.replace(value, "[REDACTED_DATABASE_URL_DETAIL]")
    message = DATABASE_URL_PATTERN.sub("[REDACTED_DATABASE_URL]", message)
    message = PSYCOPG_HOST_FIELD_PATTERN.sub(lambda match: f"{match.group(1)}: '[REDACTED_HOST]'", message)
    message = IPV4_PATTERN.sub("[REDACTED_IP]", message)
    return message[:500]


def _safe_error_details(error: BaseException, env: Mapping[str, str]) -> dict[str, object]:
    details: dict[str, object] = {"error_type": type(error).__name__}
    message = _safe_error_message(error, env)
    if message:
        details["error_message"] = message
    return details


def _safe_table_prefix(env: Mapping[str, str]) -> str:
    raw_prefix = (env.get(TABLE_PREFIX_ENV_NAME) or DEFAULT_TABLE_PREFIX).strip().lower()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", raw_prefix):
        raise ValueError(f"{TABLE_PREFIX_ENV_NAME} must be a valid postgres identifier prefix.")
    max_prefix_length = POSTGRES_IDENTIFIER_MAX_LENGTH - RUN_ID_LENGTH - len(RESERVATION_SUFFIX) - 1
    if len(raw_prefix) > max_prefix_length:
        raise ValueError(
            f"{TABLE_PREFIX_ENV_NAME} must be {max_prefix_length} characters or fewer "
            "so cleanup table names cannot be truncated by postgres."
        )
    return raw_prefix


def _table_names(table_prefix: str, run_id: str) -> SmokeTableNames:
    table_suffix = re.sub(r"[^A-Za-z0-9_]", "_", run_id.lower())[:RUN_ID_LENGTH]
    usage_table = f"{table_prefix}_{table_suffix}"
    reservation_table = f"{usage_table}_reservations"
    if (
        len(usage_table) > POSTGRES_IDENTIFIER_MAX_LENGTH
        or len(reservation_table) > POSTGRES_IDENTIFIER_MAX_LENGTH
    ):
        raise ValueError("Smoke table names exceed postgres identifier length.")
    return SmokeTableNames(usage_table=usage_table, reservation_table=reservation_table)


def _assert_usage(
    *,
    check_name: str,
    actual_cost_usd: float,
    expected_cost_usd: float,
    actual_tokens: int,
    expected_tokens: int,
    actual_reserved_cost_usd: float,
    expected_reserved_cost_usd: float,
    actual_reserved_tokens: int,
    expected_reserved_tokens: int,
) -> SmokeCheck:
    cost_ok = abs(actual_cost_usd - expected_cost_usd) < 0.000001
    reserved_cost_ok = abs(actual_reserved_cost_usd - expected_reserved_cost_usd) < 0.000001
    passed = (
        cost_ok
        and actual_tokens == expected_tokens
        and reserved_cost_ok
        and actual_reserved_tokens == expected_reserved_tokens
    )
    return SmokeCheck(
        name=check_name,
        passed=passed,
        details={
            "actual_cost_usd": actual_cost_usd,
            "expected_cost_usd": expected_cost_usd,
            "actual_tokens": actual_tokens,
            "expected_tokens": expected_tokens,
            "actual_reserved_cost_usd": actual_reserved_cost_usd,
            "expected_reserved_cost_usd": expected_reserved_cost_usd,
            "actual_reserved_tokens": actual_reserved_tokens,
            "expected_reserved_tokens": expected_reserved_tokens,
        },
    )


def _cleanup_tables(database_url: str, table_names: SmokeTableNames) -> None:
    from psycopg import connect, sql

    with connect(database_url, autocommit=True) as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(table_names.reservation_table)))
            cursor.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(table_names.usage_table)))


def _run_live_smoke(database_url: str, table_names: SmokeTableNames) -> tuple[SmokeCheck, ...]:
    _ensure_repo_root_on_path()
    from backend.modules.ops.cost_guardrail import CostGuardrailService, PostgresMonthlyUsageStorage

    storage = PostgresMonthlyUsageStorage(
        database_url=database_url,
        table_name=table_names.usage_table,
        reservation_table_name=table_names.reservation_table,
    )
    service = CostGuardrailService(storage, monthly_budget_usd=1.0, reservation_ttl_seconds=0)
    now_value = datetime.now(timezone.utc)
    period_key = service._period_key(now_value)
    checks: list[SmokeCheck] = []

    commit_reservation = service.reserve(cost_usd=0.07, tokens=4000, now=now_value)
    if not commit_reservation.reserved:
        raise RuntimeError("commit path reservation was not created.")
    committed_usage = service.commit(commit_reservation, cost_usd=0.02, tokens=1500)
    checks.append(
        _assert_usage(
            check_name="reserve_commit",
            actual_cost_usd=committed_usage.total_cost_usd,
            expected_cost_usd=0.02,
            actual_tokens=committed_usage.total_tokens,
            expected_tokens=1500,
            actual_reserved_cost_usd=committed_usage.reserved_cost_usd,
            expected_reserved_cost_usd=0.0,
            actual_reserved_tokens=committed_usage.reserved_tokens,
            expected_reserved_tokens=0,
        )
    )

    release_reservation = service.reserve(cost_usd=0.03, tokens=900, now=now_value)
    if not release_reservation.reserved:
        raise RuntimeError("release path reservation was not created.")
    released_usage = service.release(release_reservation)
    checks.append(
        _assert_usage(
            check_name="reserve_release",
            actual_cost_usd=released_usage.total_cost_usd,
            expected_cost_usd=0.02,
            actual_tokens=released_usage.total_tokens,
            expected_tokens=1500,
            actual_reserved_cost_usd=released_usage.reserved_cost_usd,
            expected_reserved_cost_usd=0.0,
            actual_reserved_tokens=released_usage.reserved_tokens,
            expected_reserved_tokens=0,
        )
    )

    expired_reservation = service.reserve(cost_usd=0.04, tokens=1200, now=now_value)
    if not expired_reservation.reserved:
        raise RuntimeError("expired release path reservation was not created.")
    expired_usage = storage.release_expired(period_key=period_key, older_than=now_value + timedelta(days=1))
    checks.append(
        _assert_usage(
            check_name="reserve_release_expired",
            actual_cost_usd=expired_usage.total_cost_usd,
            expected_cost_usd=0.02,
            actual_tokens=expired_usage.total_tokens,
            expected_tokens=1500,
            actual_reserved_cost_usd=expired_usage.reserved_cost_usd,
            expected_reserved_cost_usd=0.0,
            actual_reserved_tokens=expired_usage.reserved_tokens,
            expected_reserved_tokens=0,
        )
    )
    return tuple(checks)


def run_from_env(env: Mapping[str, str]) -> SmokeOutcome:
    if (env.get(ENABLE_ENV_NAME) or "").strip() != ENABLE_ENV_VALUE:
        return SmokeOutcome(
            status="skipped",
            exit_code=0,
            checks=(),
            details={"reason": f"set {ENABLE_ENV_NAME}=1 to run live postgres smoke"},
        )

    database_url = (env.get(DATABASE_URL_ENV_NAME) or "").strip()
    if not database_url:
        return SmokeOutcome(
            status="failed",
            exit_code=2,
            checks=(),
            details={"error_message": f"{DATABASE_URL_ENV_NAME} is required when {ENABLE_ENV_NAME}=1."},
        )

    try:
        table_names = _table_names(_safe_table_prefix(env), uuid4().hex[:12])
    except ValueError as error:
        return SmokeOutcome(
            status="failed",
            exit_code=2,
            checks=(),
            details=_safe_error_details(error, env),
        )
    cleanup_error_details: dict[str, object] | None = None
    try:
        checks = _run_live_smoke(database_url, table_names)
    except Exception as error:
        checks = (SmokeCheck(name="live_postgres", passed=False, details=_safe_error_details(error, env)),)
    finally:
        try:
            _cleanup_tables(database_url, table_names)
        except Exception as error:
            cleanup_error_details = _safe_error_details(error, env)

    passed = all(check.passed for check in checks) and cleanup_error_details is None
    details: dict[str, object] = {
        "usage_table": table_names.usage_table,
        "reservation_table": table_names.reservation_table,
    }
    if cleanup_error_details is not None:
        details["cleanup_error"] = cleanup_error_details
    return SmokeOutcome(
        status="passed" if passed else "failed",
        exit_code=0 if passed else 1,
        checks=checks,
        details=details,
    )


def render_outcome(outcome: SmokeOutcome) -> str:
    payload: dict[str, object] = {
        "status": outcome.status,
        "details": outcome.details,
        "checks": [
            {
                "name": check.name,
                "passed": check.passed,
                "details": check.details,
            }
            for check in outcome.checks
        ],
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def main(argv: Sequence[str]) -> int:
    del argv
    outcome = run_from_env(os.environ)
    print(render_outcome(outcome))
    return outcome.exit_code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
