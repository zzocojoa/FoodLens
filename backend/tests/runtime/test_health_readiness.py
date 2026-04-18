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


class HealthReadinessTests(unittest.TestCase):
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
