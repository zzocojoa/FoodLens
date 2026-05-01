import ast
import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import patch


ROOT_DIR: Path = Path(__file__).resolve().parents[3]
SMOKE_SCRIPT_PATH: Path = ROOT_DIR / "backend" / "scripts" / "staging_integration_smoke.py"
RENDER_DEPLOY_GATE_PATH: Path = ROOT_DIR / ".github" / "scripts" / "render_deploy_ready_gate.py"
RENDER_JOB_GATE_PATH: Path = ROOT_DIR / ".github" / "scripts" / "render_one_off_job_gate.py"
WORKFLOW_PATH: Path = ROOT_DIR / ".github" / "workflows" / "staging-integration-smoke.yml"
EXPECTED_REQUIRED_ENV_NAMES: tuple[str, ...] = (
    "DATABASE_URL",
    "AUTH_STATE_KEY",
    "MEDIA_GCS_BUCKET",
    "GCP_SERVICE_ACCOUNT_JSON",
)
EXPECTED_RENDER_JOB_ENV_NAMES: tuple[str, ...] = (
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
    "RENDER_START_COMMAND",
)
EXPECTED_RENDER_DEPLOY_ENV_NAMES: tuple[str, ...] = (
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
    "RENDER_DEPLOY_MIN_CREATED_AT",
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


def _load_render_job_gate_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("render_one_off_job_gate", RENDER_JOB_GATE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("render one-off job gate module is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_render_deploy_gate_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("render_deploy_ready_gate", RENDER_DEPLOY_GATE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("render deploy ready gate module is unavailable")
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

    def test_required_env_matches_staging_smoke_runtime_contract(self) -> None:
        smoke = _load_smoke_module()

        self.assertEqual(smoke.REQUIRED_ENV_NAMES, EXPECTED_REQUIRED_ENV_NAMES)

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
                "host: 'private.example.com' hostaddr: '203.0.113.10' "
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
        self.assertNotIn("private.example.com", serialized)
        self.assertNotIn("203.0.113.10", serialized)

    def test_run_smokes_keeps_expected_regression_checks(self) -> None:
        called_names = _referenced_function_names("_run_smokes")

        self.assertIn("_run_media_delete_smoke", called_names)
        self.assertIn("_run_retention_retry_smoke", called_names)
        self.assertIn("_run_postgres_queue_crash_rehearsal", called_names)

    def test_workflow_uses_staging_environment_and_artifact_scan(self) -> None:
        workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("environment: staging", workflow)
        self.assertIn("STAGING_RENDER_API_KEY", workflow)
        self.assertIn("STAGING_RENDER_SERVICE_ID", workflow)
        self.assertIn("render_deploy_ready_gate.py", workflow)
        self.assertIn("render_one_off_job_gate.py", workflow)
        self.assertIn("Wait for Render deploy readiness", workflow)
        self.assertIn("Run Render one-off staging integration smoke", workflow)
        self.assertLess(
            workflow.index("Wait for Render deploy readiness"),
            workflow.index("Run Render one-off staging integration smoke"),
        )
        self.assertIn("RENDER_START_COMMAND: >-", workflow)
        self.assertIn("env\n        OPENAPI_EXPORT_ONLY=1", workflow)
        self.assertIn("python backend/scripts/staging_integration_smoke.py", workflow)
        self.assertIn("scan_artifact_secrets.py artifacts/phase6/staging-integration-smoke", workflow)
        self.assertIn("steps.artifact_secret_scan.outcome == 'success'", workflow)
        self.assertLess(
            workflow.index("Scan staging smoke artifacts for secret leaks"),
            workflow.index("Upload staging smoke artifacts"),
        )

    def test_render_deploy_ready_gate_reports_missing_env_without_values(self) -> None:
        gate = _load_render_deploy_gate_module()
        self.assertEqual(gate.REQUIRED_ENV_NAMES, EXPECTED_RENDER_DEPLOY_ENV_NAMES)

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
            }

            status = gate.run_gate(
                env,
                lambda method, url, api_key: (_ for _ in ()).throw(AssertionError("request should not run")),
                lambda seconds: None,
                lambda: 0.0,
            )
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 2)
        self.assertEqual(summary["missing_env"], ["RENDER_SERVICE_ID", "RENDER_DEPLOY_MIN_CREATED_AT"])
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_deploy_ready_gate_waits_until_live_candidate(self) -> None:
        gate = _load_render_deploy_gate_module()
        responses = iter(
            (
                {"deploys": []},
                {
                    "deploys": [
                        {
                            "id": "dep-test",
                            "createdAt": "2026-05-01T00:01:00Z",
                            "updatedAt": "2026-05-01T00:01:30Z",
                            "status": "build_in_progress",
                        }
                    ]
                },
                {
                    "deploys": [
                        {
                            "id": "dep-test",
                            "createdAt": "2026-05-01T00:01:00Z",
                            "finishedAt": "2026-05-01T00:02:00Z",
                            "status": "live",
                        }
                    ]
                },
            )
        )
        calls: list[tuple[str, str]] = []

        def request_json(method: str, url: str, api_key: str) -> dict[str, object]:
            calls.append((method, url))
            return next(responses)

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_MIN_CREATED_AT": "2026-05-01T00:00:00Z",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_DEPLOY_POLL_SECONDS": "1",
                "RENDER_DEPLOY_TIMEOUT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 0)
        self.assertEqual(len(calls), 3)
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["render_deploy"]["id"], "dep-test")
        self.assertEqual(summary["render_deploy"]["status"], "live")

    def test_render_one_off_job_gate_reports_missing_env_without_values(self) -> None:
        gate = _load_render_job_gate_module()
        self.assertEqual(gate.REQUIRED_ENV_NAMES, EXPECTED_RENDER_JOB_ENV_NAMES)

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
            }

            status = gate.run_gate(
                env,
                lambda method, url, api_key, payload: (_ for _ in ()).throw(AssertionError("request should not run")),
                lambda seconds: None,
                lambda: 0.0,
            )
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 2)
        self.assertEqual(summary["missing_env"], ["RENDER_SERVICE_ID", "RENDER_START_COMMAND"])
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_one_off_job_gate_polls_until_success(self) -> None:
        gate = _load_render_job_gate_module()
        calls: list[tuple[str, str, dict[str, object] | None]] = []
        statuses = iter(("running", "succeeded"))

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            calls.append((method, url, payload))
            if method == "POST":
                return {"id": "job-test", "status": "created", "createdAt": "2026-05-01T00:00:00Z"}
            return {"id": "job-test", "status": next(statuses), "finishedAt": "2026-05-01T00:01:00Z"}

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
                "RENDER_JOB_POLL_SECONDS": "1",
                "RENDER_JOB_TIMEOUT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 0)
        self.assertEqual(calls[0][0], "POST")
        self.assertEqual(calls[0][2], {"startCommand": "python backend/scripts/staging_integration_smoke.py"})
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["render_job"]["status"], "succeeded")


if __name__ == "__main__":
    unittest.main()
