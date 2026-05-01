import importlib.util
import sys
import unittest
from pathlib import Path


def _load_smoke_module():
    module_path = Path(__file__).resolve().parents[2] / "scripts" / "staging_integration_smoke.py"
    spec = importlib.util.spec_from_file_location("staging_integration_smoke", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("staging integration smoke module is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class StagingIntegrationSmokeTests(unittest.TestCase):
    def test_required_env_reports_only_names(self) -> None:
        smoke = _load_smoke_module()

        missing = smoke.missing_required_env(
            {
                "DATABASE_URL": "postgresql://user:password@example.com/db",
                "MEDIA_GCS_BUCKET": "",
                "GCP_SERVICE_ACCOUNT_JSON": "{}",
            }
        )

        self.assertEqual(missing, ["MEDIA_GCS_BUCKET"])

    def test_summary_payload_is_sanitized(self) -> None:
        smoke = _load_smoke_module()

        payload = smoke._summary_payload(
            [
                smoke.SmokeResult(
                    name="media_delete",
                    passed=True,
                    details={
                        "render_before_status": 200,
                        "render_after_status": 404,
                        "metadata_removed": True,
                    },
                )
            ]
        )
        serialized = str(payload)

        self.assertNotIn("Authorization", serialized)
        self.assertNotIn("/media/render/", serialized)
        self.assertNotIn("object_key", serialized)

    def test_workflow_uses_staging_environment_and_artifact_scan(self) -> None:
        workflow_path = Path(__file__).resolve().parents[3] / ".github" / "workflows" / "staging-integration-smoke.yml"
        workflow = workflow_path.read_text(encoding="utf-8")

        self.assertIn("environment: staging", workflow)
        self.assertIn("STAGING_DATABASE_URL", workflow)
        self.assertIn("STAGING_MEDIA_GCS_BUCKET", workflow)
        self.assertIn("STAGING_GCP_SERVICE_ACCOUNT_JSON", workflow)
        self.assertIn("scan_artifact_secrets.py artifacts/phase6/staging-integration-smoke", workflow)
        self.assertLess(
            workflow.index("Scan staging smoke artifacts for secret leaks"),
            workflow.index("Upload staging smoke artifacts"),
        )


if __name__ == "__main__":
    unittest.main()
