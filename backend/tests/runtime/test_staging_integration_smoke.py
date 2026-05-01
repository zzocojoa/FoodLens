import ast
import importlib.util
import io
import json
import os
import sys
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import patch


ROOT_DIR: Path = Path(__file__).resolve().parents[3]
SMOKE_SCRIPT_PATH: Path = ROOT_DIR / "backend" / "scripts" / "staging_integration_smoke.py"
WORKFLOW_PATH: Path = ROOT_DIR / ".github" / "workflows" / "staging-integration-smoke.yml"
EXPECTED_REQUIRED_ENV_NAMES: tuple[str, ...] = (
    "DATABASE_URL",
    "AUTH_STATE_KEY",
    "MEDIA_GCS_BUCKET",
    "GCP_SERVICE_ACCOUNT_JSON",
)
FORBIDDEN_SUMMARY_DETAIL_KEYS: frozenset[str] = frozenset(
    (
        "Authorization",
        "authorization",
        "access_token",
        "refresh_token",
        "id_token",
        "database_url",
        "service_account_json",
        "gcp_service_account_json",
        "auth_state_key",
        "media_gcs_bucket",
        "object_key",
        "storage_key",
        "render_url",
        "signed_url",
        "asset_id",
        "user_id",
        "email",
        "password",
    )
)
FORBIDDEN_SUMMARY_FRAGMENTS: tuple[str, ...] = (
    "Authorization",
    "Bearer ",
    "access_token",
    "refresh_token",
    "id_token",
    "private_key",
    "DATABASE_URL",
    "AUTH_STATE_KEY",
    "GCP_SERVICE_ACCOUNT_JSON",
    "MEDIA_GCS_BUCKET",
    "/media/render/",
    "object_key",
    "storage_key",
    "render_url",
)


def _load_smoke_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("staging_integration_smoke", SMOKE_SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("staging integration smoke module is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _smoke_script_ast() -> ast.Module:
    return ast.parse(SMOKE_SCRIPT_PATH.read_text(encoding="utf-8"))


def _is_smoke_result_call(node: ast.Call) -> bool:
    return isinstance(node.func, ast.Name) and node.func.id == "SmokeResult"


def _details_dict_from_smoke_result(node: ast.Call) -> ast.Dict | None:
    for keyword in node.keywords:
        if keyword.arg == "details" and isinstance(keyword.value, ast.Dict):
            return keyword.value
    if len(node.args) >= 3 and isinstance(node.args[2], ast.Dict):
        return node.args[2]
    return None


def _literal_dict_keys(node: ast.Dict) -> set[str]:
    keys: set[str] = set()
    for key in node.keys:
        if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
            raise AssertionError("SmokeResult detail dictionaries must use literal string keys.")
        keys.add(key.value)
    return keys


def _details_subscript_key(node: ast.Subscript) -> str | None:
    if not isinstance(node.value, ast.Name) or node.value.id != "details":
        return None
    if not isinstance(node.slice, ast.Constant) or not isinstance(node.slice.value, str):
        return None
    return node.slice.value


def _smoke_result_detail_keys() -> set[str]:
    detail_keys: set[str] = set()
    for node in ast.walk(_smoke_script_ast()):
        if isinstance(node, ast.Call) and _is_smoke_result_call(node):
            details = _details_dict_from_smoke_result(node)
            if details is not None:
                detail_keys.update(_literal_dict_keys(details))
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Subscript):
                    key = _details_subscript_key(target)
                    if key is not None:
                        detail_keys.add(key)
    return detail_keys


def _referenced_function_names(function_name: str) -> set[str]:
    for node in ast.walk(_smoke_script_ast()):
        if isinstance(node, ast.FunctionDef) and node.name == function_name:
            return {name.id for name in ast.walk(node) if isinstance(name, ast.Name)}
    raise AssertionError(f"{function_name} was not found in the smoke script.")


class StagingIntegrationSmokeTests(unittest.TestCase):
    def test_required_env_reports_only_names(self) -> None:
        smoke = _load_smoke_module()

        missing = smoke.missing_required_env(
            {
                "DATABASE_URL": "postgresql://user:password@example.com/db",
                "AUTH_STATE_KEY": "state-key",
                "MEDIA_GCS_BUCKET": "",
                "GCP_SERVICE_ACCOUNT_JSON": "{}",
            }
        )

        self.assertEqual(missing, ["MEDIA_GCS_BUCKET"])

    def test_required_env_matches_staging_workflow_secret_contract(self) -> None:
        smoke = _load_smoke_module()
        workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertEqual(smoke.REQUIRED_ENV_NAMES, EXPECTED_REQUIRED_ENV_NAMES)
        for env_name in EXPECTED_REQUIRED_ENV_NAMES:
            expected_line = f"{env_name}: ${{{{ secrets.STAGING_{env_name} }}}}"
            self.assertIn(expected_line, workflow)

    def test_check_env_only_does_not_run_live_smokes(self) -> None:
        smoke = _load_smoke_module()
        env = {name: f"{name.lower()}-present" for name in EXPECTED_REQUIRED_ENV_NAMES}

        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(smoke, "_load_backend_env", return_value=None),
            patch.object(smoke, "_run_smokes", side_effect=AssertionError("live smoke should not run")),
        ):
            status = smoke.main(["--check-env-only"])

        self.assertEqual(status, 0)

    def test_check_env_only_missing_env_does_not_print_values(self) -> None:
        smoke = _load_smoke_module()
        env = {
            "DATABASE_URL": "postgresql://user:password@example.com/db",
            "AUTH_STATE_KEY": "state-key",
            "GCP_SERVICE_ACCOUNT_JSON": '{"private_key":"redacted-test-key"}',
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(smoke, "_load_backend_env", return_value=None),
            patch.object(smoke, "_run_smokes", side_effect=AssertionError("live smoke should not run")),
            patch("sys.stderr", new_callable=io.StringIO) as stderr,
        ):
            status = smoke.main(["--check-env-only"])

        output = stderr.getvalue()
        self.assertEqual(status, 2)
        self.assertIn("MEDIA_GCS_BUCKET", output)
        self.assertNotIn("postgresql://", output)
        self.assertNotIn("state-key", output)
        self.assertNotIn("private_key", output)

    def test_summary_payload_uses_only_safe_detail_keys(self) -> None:
        detail_keys = _smoke_result_detail_keys()

        self.assertTrue(detail_keys)
        self.assertTrue(FORBIDDEN_SUMMARY_DETAIL_KEYS.isdisjoint(detail_keys))

    def test_summary_payload_serializes_without_secret_fragments(self) -> None:
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
        serialized = json.dumps(payload, sort_keys=True)

        for fragment in FORBIDDEN_SUMMARY_FRAGMENTS:
            self.assertNotIn(fragment, serialized)

    def test_safe_error_details_redacts_sensitive_runtime_values(self) -> None:
        smoke = _load_smoke_module()
        env = {
            "DATABASE_URL": "postgresql://user:password@example.com/db",
            "AUTH_STATE_KEY": "state-key-secret",
            "GCP_SERVICE_ACCOUNT_JSON": '{"private_key":"redacted-test-key"}',
            "MEDIA_GCS_BUCKET": "foodlens-private-bucket",
        }

        with patch.dict(os.environ, env, clear=True):
            error = RuntimeError(
                "failed postgresql://user:password@example.com/db "
                "Bearer token-value server at \"private.example.com\" "
                "state-key-secret foodlens-private-bucket"
            )
            details = smoke._safe_error_details(error)

        serialized = json.dumps(details, sort_keys=True)
        self.assertIn("[REDACTED_DATABASE_URL]", serialized)
        self.assertIn('server at "[REDACTED_HOST]"', str(details["error_message"]))
        self.assertNotIn("postgresql://", serialized)
        self.assertNotIn("token-value", serialized)
        self.assertNotIn("state-key-secret", serialized)
        self.assertNotIn("foodlens-private-bucket", serialized)

    def test_run_smokes_keeps_expected_regression_checks(self) -> None:
        called_names = _referenced_function_names("_run_smokes")

        self.assertIn("_run_media_delete_smoke", called_names)
        self.assertIn("_run_retention_retry_smoke", called_names)
        self.assertIn("_run_postgres_queue_crash_rehearsal", called_names)

    def test_workflow_uses_staging_environment_and_artifact_scan(self) -> None:
        workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("environment: staging", workflow)
        self.assertIn("STAGING_DATABASE_URL", workflow)
        self.assertIn("STAGING_MEDIA_GCS_BUCKET", workflow)
        self.assertIn("STAGING_GCP_SERVICE_ACCOUNT_JSON", workflow)
        self.assertIn("scan_artifact_secrets.py artifacts/phase6/staging-integration-smoke", workflow)
        self.assertIn("steps.artifact_secret_scan.outcome == 'success'", workflow)
        self.assertLess(
            workflow.index("Scan staging smoke artifacts for secret leaks"),
            workflow.index("Upload staging smoke artifacts"),
        )


if __name__ == "__main__":
    unittest.main()
