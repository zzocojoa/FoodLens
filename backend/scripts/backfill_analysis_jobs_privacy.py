#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Protocol, cast

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT_VALUE = str(REPO_ROOT)
if REPO_ROOT_VALUE not in sys.path:
    sys.path.insert(0, REPO_ROOT_VALUE)

from backend.modules.analysis_jobs import (
    AnalysisJobStoreError,
    PostgresAnalysisJobStore,
    USER_DATA_DELETED_ERROR_CODE,
)


Mode = Literal["dry-run", "execute"]
Reason = Literal["deleted_user_request", "missing_user_id"]
DEVICE_SCOPED_USER_ID_PATTERN = "device:%"
IP_SCOPED_USER_ID_PATTERN = "ip:%"


class DatabaseCursor(Protocol):
    def execute(self, query: str, params: Sequence[object]) -> object:
        ...

    def fetchone(self) -> tuple[object, ...] | None:
        ...

    def fetchall(self) -> list[tuple[object, ...]]:
        ...


class DatabaseConnection(Protocol):
    def cursor(self) -> AbstractContextManager[DatabaseCursor]:
        ...

    def commit(self) -> None:
        ...

    def rollback(self) -> None:
        ...


class DatabaseConnectionContext(Protocol):
    def __enter__(self) -> DatabaseConnection:
        ...

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> bool | None:
        ...


ConnectFactory = Callable[[str], DatabaseConnectionContext]


@dataclass(frozen=True)
class AnalysisJobsPrivacyBackfillConfig:
    mode: Mode
    database_url: str
    analysis_job_table: str
    auth_state_table: str
    auth_state_key: str
    deletion_status_table: str
    anonymous_cutoff: datetime
    allow_empty_auth_state: bool


@dataclass(frozen=True)
class TargetCount:
    target: int
    scrubbed: int
    skipped: int


@dataclass(frozen=True)
class DeletedMissingPlan:
    target: int
    skipped: int
    target_reasons: dict[str, int]
    skipped_reasons: dict[str, int]
    missing_user_ids: tuple[str, ...]


@dataclass(frozen=True)
class CleanupPlan:
    deleted_missing: DeletedMissingPlan
    old_anonymous_device_scoped: TargetCount
    already_user_data_deleted: TargetCount


@dataclass(frozen=True)
class CleanupResult:
    mode: Mode
    generated_at: str
    criteria: dict[str, object]
    counts: dict[str, object]


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill/scrub privacy state for analysis_jobs.")
    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--dry-run", action="store_true")
    mode_group.add_argument("--execute", action="store_true")
    parser.add_argument("--anonymous-older-than-days", type=int, required=True)
    parser.add_argument("--allow-empty-auth-state", action="store_true")
    parser.add_argument("--confirm-production-backfill", action="store_true")
    args = parser.parse_args()

    try:
        _load_backend_env()
        if bool(args.execute) and not bool(args.confirm_production_backfill):
            raise AnalysisJobStoreError(
                "--execute requires --confirm-production-backfill after reviewing a dry-run result."
            )
        config = build_config_from_env(
            mode=_parse_mode(args),
            anonymous_older_than_days=int(args.anonymous_older_than_days),
            allow_empty_auth_state=bool(args.allow_empty_auth_state),
            getenv=os.environ.get,
            now=datetime.now(timezone.utc),
        )
        if config.mode == "execute":
            result = run_execute(config=config, connect_factory=_load_connect())
        else:
            result = run_dry_run(config=config, connect_factory=_load_connect())
        print(json.dumps({"analysis_jobs_privacy_backfill": asdict(result)}, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as error:
        print(
            json.dumps(
                {"analysis_jobs_privacy_backfill": _error_payload(error=error)},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 1


def build_config_from_env(
    *,
    mode: Mode,
    anonymous_older_than_days: int,
    allow_empty_auth_state: bool,
    getenv: Callable[[str, str | None], str | None],
    now: datetime,
) -> AnalysisJobsPrivacyBackfillConfig:
    database_url = (getenv("DATABASE_URL", None) or "").strip()
    if not database_url:
        raise AnalysisJobStoreError("DATABASE_URL is required.")
    if anonymous_older_than_days < 1:
        raise AnalysisJobStoreError("anonymous_older_than_days must be at least 1.")

    analysis_job_store = PostgresAnalysisJobStore(
        database_url=database_url,
        table_name=(getenv("ANALYSIS_JOB_TABLE", None) or "analysis_jobs").strip(),
    )
    return AnalysisJobsPrivacyBackfillConfig(
        mode=mode,
        database_url=database_url,
        analysis_job_table=analysis_job_store.table_name,
        auth_state_table=_sanitize_table_name(
            raw=getenv("AUTH_STATE_TABLE", None),
            fallback="auth_runtime_state",
            error_name="AUTH_STATE_TABLE",
        ),
        auth_state_key=(getenv("AUTH_STATE_KEY", None) or "default").strip(),
        deletion_status_table=_sanitize_table_name(
            raw=getenv("DELETION_STATUS_TABLE", None),
            fallback="deletion_statuses",
            error_name="DELETION_STATUS_TABLE",
        ),
        anonymous_cutoff=now - timedelta(days=anonymous_older_than_days),
        allow_empty_auth_state=allow_empty_auth_state,
    )


def run_dry_run(*, config: AnalysisJobsPrivacyBackfillConfig, connect_factory: ConnectFactory) -> CleanupResult:
    with connect_factory(config.database_url) as conn:
        plan = _build_cleanup_plan(config=config, conn=conn)
        conn.rollback()
    return _cleanup_result(config=config, plan=plan, deleted_missing_scrubbed=0, old_anonymous_scrubbed=0)


def run_execute(*, config: AnalysisJobsPrivacyBackfillConfig, connect_factory: ConnectFactory) -> CleanupResult:
    with connect_factory(config.database_url) as conn:
        plan = _build_cleanup_plan(config=config, conn=conn)
        deleted_missing_scrubbed = _scrub_deleted_missing_jobs(config=config, conn=conn, plan=plan.deleted_missing)
        old_anonymous_scrubbed = _scrub_old_anonymous_device_scoped_jobs(config=config, conn=conn)
        conn.commit()
    return _cleanup_result(
        config=config,
        plan=plan,
        deleted_missing_scrubbed=deleted_missing_scrubbed,
        old_anonymous_scrubbed=old_anonymous_scrubbed,
    )


def _build_cleanup_plan(*, config: AnalysisJobsPrivacyBackfillConfig, conn: DatabaseConnection) -> CleanupPlan:
    with conn.cursor() as cursor:
        active_user_ids = _load_active_user_ids(config=config, cursor=cursor)
        user_scoped_jobs = _fetch_user_scoped_job_counts(config=config, cursor=cursor)
        has_user_scoped_jobs = any(job_count > 0 for _, _, job_count in user_scoped_jobs)
        if not active_user_ids and has_user_scoped_jobs and not config.allow_empty_auth_state:
            raise AnalysisJobStoreError(
                "Auth state has no users while user-scoped analysis jobs exist. "
                "Pass --allow-empty-auth-state only after confirming this is expected."
            )
        deleted_missing = _deleted_missing_plan(
            active_user_ids=active_user_ids,
            user_scoped_jobs=user_scoped_jobs,
        )
        old_anonymous = TargetCount(
            target=_fetch_old_anonymous_device_scoped_count(config=config, cursor=cursor),
            scrubbed=0,
            skipped=_fetch_newer_anonymous_device_scoped_count(config=config, cursor=cursor),
        )
        already_deleted = TargetCount(
            target=0,
            scrubbed=0,
            skipped=_fetch_already_user_data_deleted_count(config=config, cursor=cursor),
        )
    return CleanupPlan(
        deleted_missing=deleted_missing,
        old_anonymous_device_scoped=old_anonymous,
        already_user_data_deleted=already_deleted,
    )


def _deleted_missing_plan(
    *,
    active_user_ids: set[str],
    user_scoped_jobs: list[tuple[str, Reason, int]],
) -> DeletedMissingPlan:
    target_reasons: dict[str, int] = {"deleted_user_request": 0, "missing_user_id": 0}
    skipped_reasons: dict[str, int] = {"active_user_id": 0}
    missing_user_ids: set[str] = set()

    for user_id, reason, count in user_scoped_jobs:
        if reason == "deleted_user_request":
            target_reasons[reason] += count
            continue
        if user_id in active_user_ids:
            skipped_reasons["active_user_id"] += count
            continue
        target_reasons["missing_user_id"] += count
        missing_user_ids.add(user_id)

    return DeletedMissingPlan(
        target=sum(target_reasons.values()),
        skipped=sum(skipped_reasons.values()),
        target_reasons={key: value for key, value in target_reasons.items() if value > 0},
        skipped_reasons={key: value for key, value in skipped_reasons.items() if value > 0},
        missing_user_ids=tuple(sorted(missing_user_ids)),
    )


def _scrub_deleted_missing_jobs(
    *,
    config: AnalysisJobsPrivacyBackfillConfig,
    conn: DatabaseConnection,
    plan: DeletedMissingPlan,
) -> int:
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
WITH deleted_users AS (
    SELECT btrim(user_id) AS user_id, MAX(updated_at) AS deleted_at
    FROM {config.deletion_status_table}
    WHERE user_id IS NOT NULL
      AND btrim(user_id) <> ''
      AND status = 'done'
      AND target IN ('account', 'data')
    GROUP BY btrim(user_id)
), matched AS (
    SELECT jobs.job_id
    FROM {config.analysis_job_table} jobs
    LEFT JOIN deleted_users ON deleted_users.user_id = btrim(jobs.user_id)
    WHERE jobs.user_id IS NOT NULL
      AND btrim(jobs.user_id) <> ''
      AND btrim(jobs.user_id) NOT LIKE %s
      AND btrim(jobs.user_id) NOT LIKE %s
      AND COALESCE(jobs.error_code, '') <> %s
      AND (
          (deleted_users.user_id IS NOT NULL AND jobs.accepted_at <= deleted_users.deleted_at)
          OR btrim(jobs.user_id) = ANY(%s::text[])
      )
)
UPDATE {config.analysis_job_table} jobs
SET user_id = NULL,
    idempotency_key = NULL,
    status = 'failed',
    allergy_info = '',
    image_base64 = '',
    image_sha256 = '',
    result_json = NULL,
    lease_expires_at = NULL,
    worker_id = NULL,
    updated_at = %s::timestamptz,
    fallback_reason = NULL,
    error_code = %s,
    error_message = NULL
FROM matched
WHERE jobs.job_id = matched.job_id
RETURNING jobs.job_id
""".strip(),
            (
                DEVICE_SCOPED_USER_ID_PATTERN,
                IP_SCOPED_USER_ID_PATTERN,
                USER_DATA_DELETED_ERROR_CODE,
                list(plan.missing_user_ids),
                _to_iso(datetime.now(timezone.utc)),
                USER_DATA_DELETED_ERROR_CODE,
            ),
        )
        return len(cursor.fetchall())


def _scrub_old_anonymous_device_scoped_jobs(
    *,
    config: AnalysisJobsPrivacyBackfillConfig,
    conn: DatabaseConnection,
) -> int:
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
UPDATE {config.analysis_job_table}
SET user_id = NULL,
    idempotency_key = NULL,
    status = 'failed',
    allergy_info = '',
    image_base64 = '',
    image_sha256 = '',
    result_json = NULL,
    lease_expires_at = NULL,
    worker_id = NULL,
    updated_at = %s::timestamptz,
    fallback_reason = NULL,
    error_code = %s,
    error_message = NULL
WHERE {_anonymous_or_device_scoped_predicate()}
  AND accepted_at < %s::timestamptz
  AND COALESCE(error_code, '') <> %s
RETURNING job_id
""".strip(),
            (
                _to_iso(datetime.now(timezone.utc)),
                USER_DATA_DELETED_ERROR_CODE,
                DEVICE_SCOPED_USER_ID_PATTERN,
                IP_SCOPED_USER_ID_PATTERN,
                _to_iso(config.anonymous_cutoff),
                USER_DATA_DELETED_ERROR_CODE,
            ),
        )
        return len(cursor.fetchall())


def _load_active_user_ids(*, config: AnalysisJobsPrivacyBackfillConfig, cursor: DatabaseCursor) -> set[str]:
    cursor.execute(
        f"SELECT state_json FROM {config.auth_state_table} WHERE state_key = %s",
        (config.auth_state_key,),
    )
    row = cursor.fetchone()
    if row is None:
        raise AnalysisJobStoreError("Auth state snapshot was not found for AUTH_STATE_KEY.")
    snapshot = _parse_json_object(value=row[0], label="auth state snapshot")
    raw_payload = snapshot.get("payload")
    if not isinstance(raw_payload, str) or not raw_payload.strip():
        raise AnalysisJobStoreError("Auth state snapshot payload is missing.")
    runtime_state = _parse_json_object(value=raw_payload, label="auth state runtime payload")
    raw_users = runtime_state.get("_users_by_id")
    if not isinstance(raw_users, dict):
        raise AnalysisJobStoreError("Auth state runtime payload is missing _users_by_id.")
    return {str(user_id).strip() for user_id in raw_users.keys() if str(user_id).strip()}


def _fetch_user_scoped_job_counts(
    *,
    config: AnalysisJobsPrivacyBackfillConfig,
    cursor: DatabaseCursor,
) -> list[tuple[str, Reason, int]]:
    cursor.execute(
        f"""
WITH deleted_users AS (
    SELECT btrim(user_id) AS user_id, MAX(updated_at) AS deleted_at
    FROM {config.deletion_status_table}
    WHERE user_id IS NOT NULL
      AND btrim(user_id) <> ''
      AND status = 'done'
      AND target IN ('account', 'data')
    GROUP BY btrim(user_id)
), classified AS (
    SELECT
        btrim(jobs.user_id) AS user_id,
        CASE
            WHEN deleted_users.user_id IS NOT NULL
             AND jobs.accepted_at <= deleted_users.deleted_at
                THEN 'deleted_user_request'
            ELSE 'missing_user_id'
        END AS reason
    FROM {config.analysis_job_table} jobs
    LEFT JOIN deleted_users ON deleted_users.user_id = btrim(jobs.user_id)
    WHERE jobs.user_id IS NOT NULL
      AND btrim(jobs.user_id) <> ''
      AND btrim(jobs.user_id) NOT LIKE %s
      AND btrim(jobs.user_id) NOT LIKE %s
      AND COALESCE(jobs.error_code, '') <> %s
)
SELECT user_id, reason, COUNT(*)
FROM classified
GROUP BY user_id, reason
ORDER BY MIN(user_id), reason
""".strip(),
        (DEVICE_SCOPED_USER_ID_PATTERN, IP_SCOPED_USER_ID_PATTERN, USER_DATA_DELETED_ERROR_CODE),
    )
    rows = cursor.fetchall()
    parsed_rows: list[tuple[str, Reason, int]] = []
    for row in rows:
        if len(row) != 3:
            raise AnalysisJobStoreError("Unexpected analysis job count row shape.")
        user_id = _coerce_text(value=row[0], label="analysis job user_id")
        reason = _coerce_reason(value=row[1])
        count = _coerce_count(value=row[2], label="analysis job count")
        parsed_rows.append((user_id, reason, count))
    return parsed_rows


def _fetch_old_anonymous_device_scoped_count(
    *,
    config: AnalysisJobsPrivacyBackfillConfig,
    cursor: DatabaseCursor,
) -> int:
    return _fetch_count(
        cursor=cursor,
        query=(
            f"SELECT COUNT(*) FROM {config.analysis_job_table} "
            f"WHERE {_anonymous_or_device_scoped_predicate()} "
            "AND accepted_at < %s::timestamptz "
            "AND COALESCE(error_code, '') <> %s"
        ),
        params=(
            DEVICE_SCOPED_USER_ID_PATTERN,
            IP_SCOPED_USER_ID_PATTERN,
            _to_iso(config.anonymous_cutoff),
            USER_DATA_DELETED_ERROR_CODE,
        ),
        label="old anonymous/device-scoped analysis jobs",
    )


def _fetch_newer_anonymous_device_scoped_count(
    *,
    config: AnalysisJobsPrivacyBackfillConfig,
    cursor: DatabaseCursor,
) -> int:
    return _fetch_count(
        cursor=cursor,
        query=(
            f"SELECT COUNT(*) FROM {config.analysis_job_table} "
            f"WHERE {_anonymous_or_device_scoped_predicate()} "
            "AND accepted_at >= %s::timestamptz "
            "AND COALESCE(error_code, '') <> %s"
        ),
        params=(
            DEVICE_SCOPED_USER_ID_PATTERN,
            IP_SCOPED_USER_ID_PATTERN,
            _to_iso(config.anonymous_cutoff),
            USER_DATA_DELETED_ERROR_CODE,
        ),
        label="newer anonymous/device-scoped analysis jobs",
    )


def _fetch_already_user_data_deleted_count(
    *,
    config: AnalysisJobsPrivacyBackfillConfig,
    cursor: DatabaseCursor,
) -> int:
    return _fetch_count(
        cursor=cursor,
        query=f"SELECT COUNT(*) FROM {config.analysis_job_table} WHERE COALESCE(error_code, '') = %s",
        params=(USER_DATA_DELETED_ERROR_CODE,),
        label="already USER_DATA_DELETED analysis jobs",
    )


def _fetch_count(*, cursor: DatabaseCursor, query: str, params: Sequence[object], label: str) -> int:
    cursor.execute(query, params)
    row = cursor.fetchone()
    if row is None or len(row) != 1:
        raise AnalysisJobStoreError(f"Unexpected count result for {label}.")
    return _coerce_count(value=row[0], label=label)


def _cleanup_result(
    *,
    config: AnalysisJobsPrivacyBackfillConfig,
    plan: CleanupPlan,
    deleted_missing_scrubbed: int,
    old_anonymous_scrubbed: int,
) -> CleanupResult:
    deleted_missing = TargetCount(
        target=plan.deleted_missing.target,
        scrubbed=deleted_missing_scrubbed,
        skipped=plan.deleted_missing.skipped,
    )
    old_anonymous = TargetCount(
        target=plan.old_anonymous_device_scoped.target,
        scrubbed=old_anonymous_scrubbed,
        skipped=plan.old_anonymous_device_scoped.skipped,
    )
    total_target = deleted_missing.target + old_anonymous.target
    total_scrubbed = deleted_missing.scrubbed + old_anonymous.scrubbed
    total_skipped = deleted_missing.skipped + old_anonymous.skipped + plan.already_user_data_deleted.skipped
    counts: dict[str, object] = {
        "deleted_missing_user_id": {
            **asdict(deleted_missing),
            "target_reasons": plan.deleted_missing.target_reasons,
            "skipped_reasons": plan.deleted_missing.skipped_reasons,
        },
        "old_anonymous_device_scoped": asdict(old_anonymous),
        "already_user_data_deleted": asdict(plan.already_user_data_deleted),
        "total": {
            "target": total_target,
            "scrubbed": total_scrubbed,
            "skipped": total_skipped,
        },
    }
    criteria: dict[str, object] = {
        "deleted_missing_user_id": {
            "user_id_scope": "non-empty user_id excluding device:/ip: legacy subjects",
            "deleted_request_status": "deletion_statuses.status=done and target in account/data",
            "missing_user_source": "auth runtime state _users_by_id",
        },
        "old_anonymous_device_scoped": {
            "accepted_before": _to_iso(config.anonymous_cutoff),
            "user_id_scope": "NULL, device:*, or ip:*",
        },
        "already_user_data_deleted": {
            "error_code": USER_DATA_DELETED_ERROR_CODE,
        },
    }
    return CleanupResult(
        mode=config.mode,
        generated_at=_to_iso(datetime.now(timezone.utc)),
        criteria=criteria,
        counts=counts,
    )


def _anonymous_or_device_scoped_predicate() -> str:
    return "(user_id IS NULL OR btrim(user_id) = '' OR btrim(user_id) LIKE %s OR btrim(user_id) LIKE %s)"


def _parse_json_object(*, value: object, label: str) -> dict[str, object]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    raise AnalysisJobStoreError(f"{label} must be a JSON object.")


def _coerce_text(*, value: object, label: str) -> str:
    if not isinstance(value, str):
        raise AnalysisJobStoreError(f"{label} must be text.")
    normalized = value.strip()
    if not normalized:
        raise AnalysisJobStoreError(f"{label} must not be empty.")
    return normalized


def _coerce_reason(*, value: object) -> Reason:
    if value == "deleted_user_request":
        return "deleted_user_request"
    if value == "missing_user_id":
        return "missing_user_id"
    raise AnalysisJobStoreError("Unexpected analysis job privacy backfill reason.")


def _coerce_count(*, value: object, label: str) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    raise AnalysisJobStoreError(f"{label} count must be an integer.")


def _sanitize_table_name(*, raw: str | None, fallback: str, error_name: str) -> str:
    candidate = (raw or "").strip() or fallback
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
        raise AnalysisJobStoreError(f"{error_name} has invalid format.")
    return candidate


def _to_iso(value: datetime) -> str:
    normalized = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return normalized.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_mode(args: argparse.Namespace) -> Mode:
    if bool(args.execute):
        return "execute"
    return "dry-run"


def _load_backend_env() -> None:
    env_path = REPO_ROOT / "backend" / ".env"
    if env_path.exists():
        load_dotenv(env_path, override=False)


def _load_connect() -> ConnectFactory:
    try:
        from psycopg import connect
    except ImportError as error:
        raise AnalysisJobStoreError("psycopg is required for analysis job privacy backfill.") from error
    return cast(ConnectFactory, connect)


def _error_payload(*, error: Exception) -> dict[str, object]:
    return {
        "status": "failed",
        "error": {
            "type": type(error).__name__,
            "message": _safe_error_message(error=error),
        },
    }


def _safe_error_message(*, error: Exception) -> str:
    message = str(error) or "analysis job privacy backfill failed"
    message = re.sub(r"postgres(?:ql)?://[^\s'\"),]+", "[REDACTED_DATABASE_URL]", message, flags=re.IGNORECASE)
    message = re.sub(
        r'("user_id"\s*:\s*")[^"]*(")',
        r'\1[REDACTED]\2',
        message,
        flags=re.IGNORECASE,
    )
    message = re.sub(
        r"('user_id'\s*:\s*')[^']*(')",
        r"\1[REDACTED]\2",
        message,
        flags=re.IGNORECASE,
    )
    message = re.sub(
        r"(\buser_id\s*:\s*)[^\s,;)}]+",
        r"\1[REDACTED]",
        message,
        flags=re.IGNORECASE,
    )
    message = re.sub(r"(user_id=)[^\s,;)]*", r"\1[REDACTED]", message, flags=re.IGNORECASE)
    message = re.sub(r"(Bearer\s+)[A-Za-z0-9._~+/=-]+", r"\1[REDACTED]", message)
    return message[:500]


if __name__ == "__main__":
    raise SystemExit(main())
