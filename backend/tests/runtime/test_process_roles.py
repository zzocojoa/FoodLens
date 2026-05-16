import asyncio
import inspect
import os
import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["ANALYSIS_JOB_BACKEND"] = "memory"
os.environ["ANALYSIS_NUTRITION_CACHE_BACKEND"] = "memory"
os.environ["MEDIA_STORAGE_BACKEND"] = "disabled"

from backend.server import app  # noqa: E402
from backend import server  # noqa: E402


ROLE_ENV_NAMES = ("FOODLENS_PROCESS_ROLE", "PROCESS_ROLE", "RENDER_PROCESS_ROLE")
WEB_ROLE = getattr(server, "PROCESS_ROLE_WEB", getattr(server, "WEB_PROCESS_ROLE", "web"))
WORKER_ROLE = getattr(server, "PROCESS_ROLE_WORKER", getattr(server, "WORKER_PROCESS_ROLE", "worker"))
CRON_ROLE = getattr(server, "PROCESS_ROLE_CRON", getattr(server, "CRON_PROCESS_ROLE", "cron"))


class _DisabledMediaStorage:
    enabled = False


class _RunningTask:
    def done(self) -> bool:
        return False


def _fake_running_task(coroutine: object) -> _RunningTask:
    if inspect.iscoroutine(coroutine):
        coroutine.close()
    return _RunningTask()


class ProcessRoleRuntimeTests(unittest.TestCase):
    _STATE_ATTRS = (
        "startup_completed",
        "process_role",
        "auth_service",
        "media_storage",
        "analysis_job_store",
        "analysis_nutrition_service",
        "analyst",
        "barcode_service",
        "smart_router",
        "analysis_job_workers",
        "analysis_job_worker_heartbeat_store",
        "analysis_job_worker_heartbeat_task",
        "analysis_job_worker_started_at",
        "analysis_job_remote_worker_heartbeat_override",
        "retention_store",
        "retention_cleanup_job",
        "retention_cleanup_task",
        "deletion_queue_producer",
        "deletion_queue_consumer",
        "deletion_queue_task",
    )

    def tearDown(self) -> None:
        self._clear_runtime_state()

    def _clear_runtime_state(self) -> None:
        for attr_name in self._STATE_ATTRS:
            if hasattr(app.state, attr_name):
                delattr(app.state, attr_name)

    def _prime_common_runtime_state(self) -> None:
        app.state.startup_completed = True
        app.state.auth_service = object()
        app.state.media_storage = _DisabledMediaStorage()
        app.state.retention_store = object()
        app.state.retention_cleanup_job = object()
        app.state.deletion_queue_producer = object()
        app.state.deletion_queue_consumer = object()
        app.state.analysis_job_store = object()
        app.state.analysis_nutrition_service = object()
        app.state.analyst = object()
        app.state.barcode_service = object()
        app.state.smart_router = object()

    def _call_readiness_report(self, role: str | None = None) -> tuple[dict[str, Any], int]:
        readiness_helper = server._build_readiness_report
        readiness_signature = inspect.signature(readiness_helper)
        kwargs: dict[str, Any] = {}
        if role is not None:
            if "process_role" in readiness_signature.parameters:
                kwargs["process_role"] = role
            elif "role" in readiness_signature.parameters:
                kwargs["role"] = role
        app.state.process_role = role or WEB_ROLE
        with patch("backend.server._is_openapi_export_mode", return_value=False):
            return readiness_helper(**kwargs)

    def _set_running_workers(self, count: int) -> None:
        app.state.analysis_job_workers = [SimpleNamespace(_task=_RunningTask()) for _ in range(count)]

    def test_web_role_readiness_tolerates_missing_background_workers(self) -> None:
        self._prime_common_runtime_state()

        payload, status_code = self._call_readiness_report(WEB_ROLE)

        self.assertEqual(status_code, 200)
        self.assertEqual(payload["status"], "ready")
        self.assertTrue(payload["ready"])
        self.assertTrue(payload["checks"]["startup_completed"])
        self.assertFalse(payload["checks"]["analysis_job_workers"])
        self.assertFalse(payload["checks"]["retention_cleanup_task"])
        self.assertFalse(payload["checks"]["deletion_queue_task"])

    def test_initialize_auth_and_media_runtime_sets_media_render_runtime_state(self) -> None:
        server._initialize_auth_and_media_runtime()

        self.assertIsNotNone(getattr(app.state, "auth_service", None))
        self.assertIsNotNone(getattr(app.state, "media_storage", None))
        self.assertTrue(hasattr(app.state, "media_render_cache"))
        self.assertTrue(hasattr(app.state, "media_render_cache_lock"))
        self.assertTrue(hasattr(app.state, "media_render_inflight_tasks"))
        self.assertTrue(hasattr(app.state, "media_render_inflight_lock"))
        self.assertEqual(getattr(app.state, "media_render_max_concurrent_misses"), 2)
        self.assertIsNotNone(getattr(app.state, "media_render_miss_semaphore"))

    def test_web_role_readiness_requires_remote_worker_heartbeat_for_postgres_job_backend(self) -> None:
        self._prime_common_runtime_state()

        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://foodlens:test@db/foodlens",
                "AUTH_STATE_BACKEND": "postgres",
                "ANALYSIS_JOB_BACKEND": "postgres",
            },
            clear=False,
        ):
            payload, status_code = self._call_readiness_report(WEB_ROLE)

        self.assertEqual(status_code, 503)
        self.assertFalse(payload["ready"])
        self.assertIn("analysis_job_remote_worker", payload["required_checks"])
        self.assertIn("ANALYSIS_JOB_REMOTE_WORKER_NOT_READY", {issue["code"] for issue in payload["issues"]})

    def test_web_role_readiness_accepts_fresh_remote_worker_heartbeat_for_postgres_job_backend(self) -> None:
        self._prime_common_runtime_state()
        app.state.analysis_job_remote_worker_heartbeat_override = {
            "heartbeat_at": "2026-04-19T14:10:00+00:00",
            "heartbeat_epoch_seconds": 1763561400.0,
        }

        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://foodlens:test@db/foodlens",
                "AUTH_STATE_BACKEND": "postgres",
                "ANALYSIS_JOB_BACKEND": "postgres",
            },
            clear=False,
        ):
            with patch("backend.server.time.time", return_value=1763561410.0):
                payload, status_code = self._call_readiness_report(WEB_ROLE)

        self.assertEqual(status_code, 200)
        self.assertTrue(payload["ready"])
        self.assertTrue(payload["checks"]["analysis_job_remote_worker"])
        self.assertEqual(payload["analysis_job_remote_worker_heartbeat_at"], "2026-04-19T14:10:00+00:00")

    def test_web_role_readiness_accepts_embedded_worker_for_postgres_job_backend(self) -> None:
        self._prime_common_runtime_state()
        self._set_running_workers(1)
        app.state.deletion_queue_task = _RunningTask()

        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://foodlens:test@db/foodlens",
                "AUTH_STATE_BACKEND": "postgres",
                "ANALYSIS_JOB_BACKEND": "postgres",
                "ANALYSIS_JOB_EMBEDDED_WORKER_ENABLED": "1",
            },
            clear=False,
        ):
            payload, status_code = self._call_readiness_report(WEB_ROLE)

        self.assertEqual(status_code, 200)
        self.assertTrue(payload["ready"])
        self.assertTrue(payload["checks"]["analysis_job_embedded_worker_enabled"])
        self.assertTrue(payload["checks"]["analysis_job_workers"])
        self.assertTrue(payload["checks"]["deletion_queue_task"])
        self.assertIn("analysis_job_workers", payload["required_checks"])
        self.assertIn("deletion_queue_task", payload["required_checks"])
        self.assertNotIn("analysis_job_remote_worker", payload["required_checks"])

    def test_web_role_readiness_requires_embedded_worker_tasks_when_enabled(self) -> None:
        self._prime_common_runtime_state()

        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://foodlens:test@db/foodlens",
                "AUTH_STATE_BACKEND": "postgres",
                "ANALYSIS_JOB_BACKEND": "postgres",
                "ANALYSIS_JOB_EMBEDDED_WORKER_ENABLED": "1",
            },
            clear=False,
        ):
            payload, status_code = self._call_readiness_report(WEB_ROLE)

        self.assertEqual(status_code, 503)
        self.assertFalse(payload["ready"])
        issue_codes = {issue["code"] for issue in payload["issues"]}
        self.assertIn("ANALYSIS_JOB_WORKERS_NOT_READY", issue_codes)
        self.assertIn("DELETION_QUEUE_TASK_NOT_RUNNING", issue_codes)
        self.assertNotIn("ANALYSIS_JOB_REMOTE_WORKER_NOT_READY", issue_codes)

    def test_submit_job_worker_check_accepts_embedded_worker(self) -> None:
        self._prime_common_runtime_state()
        self._set_running_workers(1)
        app.state.deletion_queue_task = _RunningTask()

        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://foodlens:test@db/foodlens",
                "AUTH_STATE_BACKEND": "postgres",
                "ANALYSIS_JOB_BACKEND": "postgres",
                "ANALYSIS_JOB_EMBEDDED_WORKER_ENABLED": "1",
            },
            clear=False,
        ):
            server._assert_analysis_job_remote_worker_available(request_id="req-embedded-worker")

    def test_web_startup_starts_embedded_worker_runtime_when_enabled(self) -> None:
        with (
            patch("backend.server._initialize_auth_and_media_runtime"),
            patch("backend.server._initialize_analysis_runtime"),
            patch("backend.server._initialize_retention_runtime"),
            patch("backend.server._initialize_deletion_queue_runtime"),
            patch("backend.server._initialize_core_runtime_services"),
            patch("backend.server._initialize_api_runtime_controls"),
            patch("backend.server._start_analysis_job_workers") as start_workers,
            patch("backend.server._build_analysis_job_worker_heartbeat_store", return_value=object()),
            patch("backend.server.asyncio.create_task", side_effect=_fake_running_task) as create_task,
            patch.dict(
                os.environ,
                {
                    "ANALYSIS_JOB_EMBEDDED_WORKER_ENABLED": "1",
                    "OPENAPI_EXPORT_ONLY": "0",
                },
                clear=False,
            ),
        ):
            asyncio.run(server._startup_runtime(WEB_ROLE))

        start_workers.assert_called_once()
        self.assertEqual(create_task.call_count, 2)
        self.assertTrue(getattr(app.state, "startup_completed"))
        self.assertEqual(getattr(app.state, "process_role"), WEB_ROLE)

    def test_worker_role_readiness_requires_analysis_workers_and_deletion_queue_loop(self) -> None:
        self._prime_common_runtime_state()
        app.state.deletion_queue_task = _RunningTask()

        payload_missing_workers, status_missing_workers = self._call_readiness_report(WORKER_ROLE)
        self.assertEqual(status_missing_workers, 503)
        self.assertFalse(payload_missing_workers["ready"])
        self.assertIn("ANALYSIS_JOB_WORKERS_NOT_READY", {issue["code"] for issue in payload_missing_workers["issues"]})

        self._set_running_workers(1)
        delattr(app.state, "deletion_queue_task")

        payload_missing_loop, status_missing_loop = self._call_readiness_report(WORKER_ROLE)
        self.assertEqual(status_missing_loop, 503)
        self.assertFalse(payload_missing_loop["ready"])
        self.assertIn("DELETION_QUEUE_TASK_NOT_RUNNING", {issue["code"] for issue in payload_missing_loop["issues"]})

    def test_cron_role_can_initialize_retention_cleanup_state_without_analysis_workers(self) -> None:
        self._prime_common_runtime_state()
        delattr(app.state, "analysis_job_store")
        delattr(app.state, "analysis_nutrition_service")
        delattr(app.state, "analyst")
        delattr(app.state, "barcode_service")
        delattr(app.state, "smart_router")
        delattr(app.state, "deletion_queue_producer")
        delattr(app.state, "deletion_queue_consumer")

        payload, status_code = self._call_readiness_report(CRON_ROLE)

        self.assertEqual(status_code, 200)
        self.assertEqual(payload["status"], "ready")
        self.assertTrue(payload["ready"])
        self.assertEqual(payload["process_role"], CRON_ROLE)
        self.assertTrue(payload["checks"]["retention_cleanup_job"])
        self.assertFalse(payload["checks"]["analysis_job_workers"])
        self.assertFalse(payload["checks"]["deletion_queue_task"])


if __name__ == "__main__":
    unittest.main()
