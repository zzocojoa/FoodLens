from __future__ import annotations

import io
import json
import unittest
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Literal
from unittest.mock import patch

from backend.modules.analysis_jobs import AnalysisJobStoreError
from backend.scripts import backfill_analysis_jobs_privacy as backfill
from backend.scripts.backfill_analysis_jobs_privacy import (
    AnalysisJobsPrivacyBackfillConfig,
    CleanupResult,
    run_dry_run,
    run_execute,
)


Mode = Literal["dry-run", "execute"]
Row = tuple[object, ...]
PRIVATE_TOKENS: tuple[str, ...] = (
    "usr_deleted_private",
    "usr_orphan_private",
    "device:dev-private-123",
    "private-idempotency",
    "peanut secret allergy",
    "private-image-base64",
    "Private Meal",
)


@dataclass(frozen=True)
class _SqlCall:
    statement: str
    params: tuple[object, ...]


class _FakeCursor:
    def __init__(self, *, fetchone_results: list[Row | None], fetchall_results: list[list[Row]]) -> None:
        self.fetchone_results: list[Row | None] = list(fetchone_results)
        self.fetchall_results: list[list[Row]] = list(fetchall_results)
        self.calls: list[_SqlCall] = []

    def execute(self, statement: str, params: Sequence[object]) -> object:
        placeholder_count = statement.count("%s")
        if placeholder_count != len(params):
            raise AssertionError(
                f"Placeholder count mismatch: expected {placeholder_count} params, received {len(params)}."
            )
        self.calls.append(_SqlCall(statement=statement, params=tuple(params)))
        return None

    def fetchone(self) -> Row | None:
        if not self.fetchone_results:
            raise AssertionError("Unexpected fetchone call.")
        return self.fetchone_results.pop(0)

    def fetchall(self) -> list[Row]:
        if not self.fetchall_results:
            raise AssertionError("Unexpected fetchall call.")
        return self.fetchall_results.pop(0)

    def __enter__(self) -> _FakeCursor:
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> bool:
        return False


class _FakeConnection:
    def __init__(self, *, cursor: _FakeCursor) -> None:
        self.cursor_instance: _FakeCursor = cursor
        self.commit_count: int = 0
        self.rollback_count: int = 0

    def cursor(self) -> _FakeCursor:
        return self.cursor_instance

    def commit(self) -> None:
        self.commit_count += 1

    def rollback(self) -> None:
        self.rollback_count += 1

    def __enter__(self) -> _FakeConnection:
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> bool:
        return False


class _FakeConnectFactory:
    def __init__(self, *, connection: _FakeConnection) -> None:
        self.connection: _FakeConnection = connection
        self.calls: list[str] = []

    def __call__(self, database_url: str) -> _FakeConnection:
        self.calls.append(database_url)
        return self.connection


class AnalysisJobsPrivacyBackfillTests(unittest.TestCase):
    def test_dry_run_reports_targets_without_scrubbing(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[_auth_state_row(("usr_active",)), (1,), (2,), (4,)],
            fetchall_results=[
                [
                    ("usr_deleted_private", "deleted_user_request", 1),
                    ("usr_orphan_private", "missing_user_id", 1),
                    ("usr_active", "missing_user_id", 1),
                ],
            ],
        )
        connection = _FakeConnection(cursor=cursor)

        result = run_dry_run(
            config=_config(mode="dry-run", allow_empty_auth_state=False),
            connect_factory=_FakeConnectFactory(connection=connection),
        )

        statements = "\n".join(call.statement for call in cursor.calls)
        self.assertEqual(result.counts["total"], {"target": 3, "scrubbed": 0, "skipped": 7})
        self.assertEqual(
            result.counts["deleted_missing_user_id"]["target_reasons"],
            {"deleted_user_request": 1, "missing_user_id": 1},
        )
        self.assertEqual(result.counts["deleted_missing_user_id"]["skipped_reasons"], {"active_user_id": 1})
        self.assertFalse(result.criteria["deleted_missing_user_id"]["allow_empty_auth_state"])
        self.assertEqual(connection.commit_count, 0)
        self.assertEqual(connection.rollback_count, 1)
        self.assertNotIn("UPDATE analysis_jobs", statements)
        _assert_output_has_no_pii(test_case=self, result=result)

    def test_execute_scrubs_deleted_missing_and_old_anonymous_rows(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[(True,), _auth_state_row(("usr_active",)), (1,), (2,), (0,)],
            fetchall_results=[
                [
                    ("usr_deleted_private", "deleted_user_request", 1),
                    ("usr_orphan_private", "missing_user_id", 1),
                    ("usr_active", "missing_user_id", 1),
                ],
                [("job_deleted",), ("job_missing",)],
                [("job_old_device",)],
            ],
        )
        connection = _FakeConnection(cursor=cursor)

        result = run_execute(
            config=_config(mode="execute", allow_empty_auth_state=False),
            connect_factory=_FakeConnectFactory(connection=connection),
        )

        deleted_missing_update = _single_statement_containing(cursor=cursor, text="UPDATE analysis_jobs jobs")
        anonymous_update = _single_statement_containing(cursor=cursor, text="UPDATE analysis_jobs\nSET user_id = NULL")
        deleted_missing_params = _single_params_for_statement(cursor=cursor, text="UPDATE analysis_jobs jobs")
        self.assertEqual(result.counts["total"], {"target": 3, "scrubbed": 3, "skipped": 3})
        self.assertEqual(
            result.counts["deleted_missing_user_id"]["target_reasons"],
            {"deleted_user_request": 1, "missing_user_id": 1},
        )
        self.assertEqual(result.counts["deleted_missing_user_id"]["skipped_reasons"], {"active_user_id": 1})
        self.assertEqual(connection.commit_count, 1)
        self.assertEqual(connection.rollback_count, 0)
        self.assertTrue(any("pg_try_advisory_xact_lock" in call.statement for call in cursor.calls))
        self.assertTrue(any("set_config" in call.statement for call in cursor.calls))
        for statement in (deleted_missing_update, anonymous_update):
            self.assertIn("user_id = NULL", statement)
            self.assertIn("idempotency_key = NULL", statement)
            self.assertIn("allergy_info = ''", statement)
            self.assertIn("image_base64 = ''", statement)
            self.assertIn("image_sha256 = ''", statement)
            self.assertIn("result_json = NULL", statement)
            self.assertIn("error_code = %s", statement)
        self.assertIn(["usr_orphan_private"], [item for item in deleted_missing_params if isinstance(item, list)])
        _assert_output_has_no_pii(test_case=self, result=result)

    def test_device_and_ip_subjects_are_only_old_anonymous_candidates(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[_auth_state_row(("usr_active",)), (0,), (0,), (0,)],
            fetchall_results=[[]],
        )
        connection = _FakeConnection(cursor=cursor)

        run_dry_run(
            config=_config(mode="dry-run", allow_empty_auth_state=False),
            connect_factory=_FakeConnectFactory(connection=connection),
        )

        statements = "\n".join(call.statement for call in cursor.calls)
        all_params = tuple(param for call in cursor.calls for param in call.params)
        self.assertNotIn("'device:%'", statements)
        self.assertNotIn("'ip:%'", statements)
        self.assertIn("btrim(jobs.user_id) NOT LIKE %s", statements)
        self.assertIn("btrim(user_id) LIKE %s", statements)
        self.assertIn(backfill.DEVICE_SCOPED_USER_ID_PATTERN, all_params)
        self.assertIn(backfill.IP_SCOPED_USER_ID_PATTERN, all_params)
        self.assertIn("accepted_at < %s::timestamptz", statements)

    def test_user_scoped_rows_fail_closed_when_auth_state_is_empty(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[_auth_state_row(())],
            fetchall_results=[[("usr_orphan_private", "missing_user_id", 1)]],
        )

        with self.assertRaises(AnalysisJobStoreError):
            run_dry_run(
                config=_config(mode="dry-run", allow_empty_auth_state=False),
                connect_factory=_FakeConnectFactory(connection=_FakeConnection(cursor=cursor)),
            )

    def test_user_data_deleted_rows_are_counted_as_skipped_for_rerun(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[_auth_state_row(("usr_active",)), (0,), (0,), (3,)],
            fetchall_results=[[]],
        )

        result = run_dry_run(
            config=_config(mode="dry-run", allow_empty_auth_state=False),
            connect_factory=_FakeConnectFactory(connection=_FakeConnection(cursor=cursor)),
        )

        self.assertEqual(result.counts["already_user_data_deleted"], {"target": 0, "scrubbed": 0, "skipped": 3})
        self.assertEqual(result.counts["total"], {"target": 0, "scrubbed": 0, "skipped": 3})

    def test_allow_empty_auth_state_override_targets_non_device_user_rows(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[_auth_state_row(()), (0,), (0,), (0,)],
            fetchall_results=[[("usr_orphan_private", "missing_user_id", 2)]],
        )

        result = run_dry_run(
            config=_config(mode="dry-run", allow_empty_auth_state=True),
            connect_factory=_FakeConnectFactory(connection=_FakeConnection(cursor=cursor)),
        )

        self.assertEqual(result.counts["deleted_missing_user_id"]["target"], 2)
        self.assertEqual(result.counts["deleted_missing_user_id"]["target_reasons"], {"missing_user_id": 2})
        self.assertTrue(result.criteria["deleted_missing_user_id"]["allow_empty_auth_state"])

    def test_execute_rolls_back_when_scrubbed_count_mismatches_plan(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[(True,), _auth_state_row(("usr_active",)), (1,), (0,), (0,)],
            fetchall_results=[
                [],
                [],
                [],
            ],
        )
        connection = _FakeConnection(cursor=cursor)

        with self.assertRaises(AnalysisJobStoreError):
            run_execute(
                config=_config(mode="execute", allow_empty_auth_state=False),
                connect_factory=_FakeConnectFactory(connection=connection),
            )

        self.assertEqual(connection.commit_count, 0)
        self.assertEqual(connection.rollback_count, 1)

    def test_execute_rolls_back_when_advisory_lock_is_unavailable(self) -> None:
        cursor = _FakeCursor(
            fetchone_results=[(False,)],
            fetchall_results=[],
        )
        connection = _FakeConnection(cursor=cursor)

        with self.assertRaises(AnalysisJobStoreError):
            run_execute(
                config=_config(mode="execute", allow_empty_auth_state=False),
                connect_factory=_FakeConnectFactory(connection=connection),
            )

        self.assertEqual(connection.commit_count, 0)
        self.assertEqual(connection.rollback_count, 1)

    def test_execute_cli_requires_confirmation_flag(self) -> None:
        with patch("sys.argv", ["backfill_analysis_jobs_privacy.py", "--execute", "--anonymous-older-than-days", "30"]):
            with patch.object(backfill, "_load_backend_env", return_value=None):
                with patch.object(backfill, "_load_connect") as load_connect:
                    with patch("sys.stdout", new_callable=io.StringIO):
                        self.assertEqual(backfill.main(), 1)
                    load_connect.assert_not_called()

    def test_config_rejects_invalid_table_name(self) -> None:
        with self.assertRaises(AnalysisJobStoreError):
            backfill.build_config_from_env(
                mode="dry-run",
                anonymous_older_than_days=30,
                allow_empty_auth_state=False,
                getenv=_getenv_factory(
                    {
                        "DATABASE_URL": "postgresql://privacy-backfill-test",
                        "ANALYSIS_JOB_TABLE": "analysis_jobs;drop",
                    }
                ),
                now=datetime(2026, 5, 16, 0, 0, tzinfo=timezone.utc),
            )

    def test_error_payload_redacts_user_id_shapes(self) -> None:
        error = RuntimeError(
            'failed user_id=usr_private_one {"user_id":"usr_private_two"} '
            "'user_id': 'usr_private_three' user_id: usr_private_four "
            "password=private-password token=private-token "
            'DETAIL: Key (user_id, idempotency_key)=(usr_private_five, private-idempotency) already exists '
            '{"database_url":"postgresql://private-user:private-pass@private-host/private-db"}'
        )

        payload = backfill._error_payload(error=error)
        serialized = json.dumps(payload, sort_keys=True)

        self.assertNotIn("usr_private_one", serialized)
        self.assertNotIn("usr_private_two", serialized)
        self.assertNotIn("usr_private_three", serialized)
        self.assertNotIn("usr_private_four", serialized)
        self.assertNotIn("usr_private_five", serialized)
        self.assertNotIn("private-idempotency", serialized)
        self.assertNotIn("private-password", serialized)
        self.assertNotIn("private-token", serialized)
        self.assertNotIn("private-pass", serialized)
        self.assertNotIn("private-host", serialized)
        self.assertIn("[REDACTED]", serialized)


def _config(*, mode: Mode, allow_empty_auth_state: bool) -> AnalysisJobsPrivacyBackfillConfig:
    return AnalysisJobsPrivacyBackfillConfig(
        mode=mode,
        database_url="postgresql://privacy-backfill-test",
        analysis_job_table="analysis_jobs",
        auth_state_table="auth_runtime_state",
        auth_state_key="default",
        deletion_status_table="deletion_statuses",
        anonymous_cutoff=datetime(2026, 4, 1, 0, 0, 0, tzinfo=timezone.utc),
        allow_empty_auth_state=allow_empty_auth_state,
        execute_lock_timeout_ms=backfill.DEFAULT_EXECUTE_LOCK_TIMEOUT_MS,
        execute_statement_timeout_ms=backfill.DEFAULT_EXECUTE_STATEMENT_TIMEOUT_MS,
        advisory_lock_key=backfill.DEFAULT_ADVISORY_LOCK_KEY,
    )


def _auth_state_row(user_ids: tuple[str, ...]) -> Row:
    payload = {"_users_by_id": {user_id: {"user_id": user_id} for user_id in user_ids}}
    return ({"payload": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))},)


def _single_statement_containing(*, cursor: _FakeCursor, text: str) -> str:
    matches = [call.statement for call in cursor.calls if text in call.statement]
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one statement containing {text!r}; found {len(matches)}.")
    return matches[0]


def _single_params_for_statement(*, cursor: _FakeCursor, text: str) -> tuple[object, ...]:
    matches = [call.params for call in cursor.calls if text in call.statement]
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one params tuple for {text!r}; found {len(matches)}.")
    return matches[0]


def _assert_output_has_no_pii(*, test_case: unittest.TestCase, result: CleanupResult) -> None:
    output_json = json.dumps(asdict(result), ensure_ascii=False, sort_keys=True)
    for token in PRIVATE_TOKENS:
        test_case.assertNotIn(token, output_json)


def _getenv_factory(values: dict[str, str]) -> Callable[[str, str | None], str | None]:
    def _getenv(key: str, default: str | None) -> str | None:
        return values.get(key, default)

    return _getenv


if __name__ == "__main__":
    unittest.main()
