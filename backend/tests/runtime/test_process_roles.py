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
