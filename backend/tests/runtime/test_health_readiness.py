import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["ANALYSIS_JOB_BACKEND"] = "memory"
os.environ["ANALYSIS_NUTRITION_CACHE_BACKEND"] = "memory"
os.environ["MEDIA_STORAGE_BACKEND"] = "disabled"
from backend.server import app  # noqa: E402


class _DisabledMediaStorage:
    enabled = False


def _snapshot_app_state() -> dict[str, object]:
    state = getattr(app.state, "_state", None)
    if not isinstance(state, dict):
        raise TypeError("app.state._state must be a dictionary.")

    snapshot: dict[str, object] = {}
    for key, value in state.items():
        if not isinstance(key, str):
            raise TypeError("app.state key must be a string.")
        snapshot[key] = value
    return snapshot


def _restore_app_state(snapshot: dict[str, object]) -> None:
    state = getattr(app.state, "_state", None)
    if not isinstance(state, dict):
        raise TypeError("app.state._state must be a dictionary.")

    state.clear()
    state.update(snapshot)


class HealthReadinessTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_state: dict[str, object] = _snapshot_app_state()

    def tearDown(self) -> None:
        _restore_app_state(self._original_state)

    @patch("backend.server.initialize_services")
    @patch("backend.server._is_openapi_export_mode", return_value=False)
    def test_health_ready_returns_200_when_runtime_state_is_ready(
        self,
        _is_openapi_export_mode: object,
        initialize_services: object,
    ) -> None:
        initialize_services.return_value = (object(), object(), object())

        with TestClient(app) as client:
            response = client.get("/health/ready")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ready")
        self.assertTrue(payload["ready"])
        self.assertTrue(payload["checks"]["startup_completed"])
        self.assertTrue(payload["checks"]["core_services"])
        self.assertIn("media_storage", payload["checks"])
        self.assertIn("media_storage_enabled", payload["checks"])
        self.assertTrue(payload["checks"]["media_storage"])
        self.assertFalse(payload["checks"]["media_storage_enabled"])

    @patch("backend.server.initialize_services")
    @patch("backend.server._is_openapi_export_mode", return_value=False)
    def test_health_ready_returns_503_when_core_services_are_missing(
        self,
        _is_openapi_export_mode: object,
        initialize_services: object,
    ) -> None:
        initialize_services.return_value = (None, None, None)

        with TestClient(app) as client:
            response = client.get("/health/ready")

        self.assertEqual(response.status_code, 503)
        payload = response.json()
        self.assertEqual(payload["status"], "not_ready")
        self.assertFalse(payload["ready"])
        self.assertIn("CORE_SERVICES_MISSING", {issue["code"] for issue in payload["issues"]})

    @patch("backend.server.build_media_storage_from_env", return_value=_DisabledMediaStorage())
    @patch("backend.server.initialize_services")
    @patch("backend.server._is_openapi_export_mode", return_value=False)
    def test_health_ready_returns_503_when_media_storage_is_disabled_for_gcs_backend(
        self,
        _is_openapi_export_mode: object,
        initialize_services: object,
        _build_media_storage_from_env: object,
    ) -> None:
        initialize_services.return_value = (object(), object(), object())

        with patch.dict(os.environ, {"MEDIA_STORAGE_BACKEND": "gcs"}, clear=False):
            with TestClient(app) as client:
                response = client.get("/health/ready")

        self.assertEqual(response.status_code, 503)
        payload = response.json()
        self.assertEqual(payload["status"], "not_ready")
        self.assertFalse(payload["ready"])
        self.assertIn("MEDIA_STORAGE_NOT_READY", {issue["code"] for issue in payload["issues"]})

    def test_health_ready_returns_503_when_export_mode_is_enabled(self) -> None:
        with TestClient(app) as client:
            response = client.get("/health/ready")

        self.assertEqual(response.status_code, 503)
        payload = response.json()
        self.assertEqual(payload["status"], "not_ready")
        self.assertFalse(payload["ready"])
        self.assertIn("OPENAPI_EXPORT_ONLY", {issue["code"] for issue in payload["issues"]})


if __name__ == "__main__":
    unittest.main()
