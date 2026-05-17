import ast
import importlib.util
import io
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch


ROOT_DIR: Path = Path(__file__).resolve().parents[3]
SMOKE_SCRIPT_PATH: Path = ROOT_DIR / "backend" / "scripts" / "staging_integration_smoke.py"
RENDER_DEPLOY_GATE_PATH: Path = ROOT_DIR / ".github" / "scripts" / "render_deploy_ready_gate.py"
RENDER_DEPLOY_TRIGGER_PATH: Path = ROOT_DIR / ".github" / "scripts" / "render_staging_deploy_trigger.py"
RENDER_JOB_GATE_PATH: Path = ROOT_DIR / ".github" / "scripts" / "render_one_off_job_gate.py"
WORKFLOW_PATH: Path = ROOT_DIR / ".github" / "workflows" / "staging-integration-smoke.yml"
BRANCH_PROTECTION_SCRIPT_PATH: Path = ROOT_DIR / "docs" / "scripts" / "apply_branch_protection.sh"
RELEASE_RULESET_SCRIPT_PATH: Path = ROOT_DIR / "docs" / "scripts" / "apply_release_branch_ruleset.py"
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
EXPECTED_RENDER_DEPLOY_TRIGGER_ENV_NAMES: tuple[str, ...] = (
    "RENDER_API_KEY",
    "RENDER_SERVICE_ID",
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


def _load_render_deploy_trigger_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("render_staging_deploy_trigger", RENDER_DEPLOY_TRIGGER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("render staging deploy trigger module is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _load_release_ruleset_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("apply_release_branch_ruleset", RELEASE_RULESET_SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("release branch ruleset module is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _smoke_script_ast() -> ast.Module:
    return ast.parse(SMOKE_SCRIPT_PATH.read_text(encoding="utf-8"))


def _workflow_job_body(job_name: str) -> str:
    workflow = WORKFLOW_PATH.read_text(encoding="utf-8")
    marker = f"  {job_name}:\n"
    start = workflow.index(marker) + len(marker)
    next_job = re.search(r"\n  [A-Za-z0-9_-]+:\n", workflow[start:])
    if next_job is None:
        return workflow[start:]
    return workflow[start : start + next_job.start()]


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
        deploy_job = _workflow_job_body("staging-integration-smoke")
        pr_check_job = _workflow_job_body("staging-integration-smoke-pr-check")

        self.assertIn("environment: staging", workflow)
        self.assertIn("STAGING_RENDER_API_KEY", workflow)
        self.assertIn("STAGING_RENDER_SERVICE_ID", workflow)
        self.assertIn("RENDER_FORBIDDEN_SERVICE_NAMES: foodlens-api", workflow)
        self.assertIn("RENDER_ALLOWED_SERVICE_NAMES: foodlens-api-staging", workflow)
        self.assertIn("RENDER_ALLOWED_SERVICE_PLANS: free", workflow)
        self.assertIn("RENDER_DEPLOY_EXPECTED_COMMIT: ${{ github.sha }}", workflow)
        self.assertIn("render_staging_deploy_trigger.py", pr_check_job)
        self.assertIn("Trigger Render staging deploy", pr_check_job)
        self.assertIn("def job_body", pr_check_job)
        self.assertIn('deploy_job = job_body("staging-integration-smoke")', pr_check_job)
        self.assertIn('deploy_job.index("Trigger Render staging deploy")', pr_check_job)
        self.assertIn('deploy_job.index("Scan staging smoke artifacts for secret leaks")', pr_check_job)
        self.assertIn("- name: Trigger Render staging deploy", deploy_job)
        self.assertIn("run: python .github/scripts/render_staging_deploy_trigger.py", deploy_job)
        self.assertIn("render_deploy_ready_gate.py", workflow)
        self.assertIn("Wait for Render deploy readiness", workflow)
        self.assertIn("scan_artifact_secrets.py artifacts/phase6/staging-integration-smoke", workflow)
        self.assertIn("steps.artifact_secret_scan.outcome == 'success'", workflow)
        self.assertNotIn("render_one_off_job_gate.py", workflow)
        self.assertNotIn("RENDER_START_COMMAND", workflow)
        self.assertNotIn("RENDER_JOB_LOG_PATH", workflow)
        self.assertLess(
            deploy_job.index("Trigger Render staging deploy"),
            deploy_job.index("Wait for Render deploy readiness"),
        )
        self.assertLess(
            deploy_job.index("Scan staging smoke artifacts for secret leaks"),
            deploy_job.index("Upload staging smoke artifacts"),
        )

    def test_smoke_runtime_defaults_to_staging_media_prefix(self) -> None:
        smoke = _load_smoke_module()
        env = {name: f"{name.lower()}-present" for name in EXPECTED_REQUIRED_ENV_NAMES}

        with patch.dict(os.environ, env, clear=True):
            smoke._configure_runtime_env()

            self.assertEqual(os.environ["MEDIA_GCS_PREFIX"], "staging-media")

    def test_smoke_runtime_rejects_production_media_prefix(self) -> None:
        smoke = _load_smoke_module()
        env = {name: f"{name.lower()}-present" for name in EXPECTED_REQUIRED_ENV_NAMES}
        env["MEDIA_GCS_PREFIX"] = "media"

        with (
            patch.dict(os.environ, env, clear=True),
            patch.object(smoke, "_load_backend_env", return_value=None),
            patch.object(smoke, "_run_smokes", side_effect=AssertionError("live smoke should not run")),
            patch("sys.stderr", new_callable=io.StringIO) as stderr,
        ):
            status = smoke.main(["--check-env-only"])

        self.assertEqual(status, 2)
        self.assertIn("MEDIA_GCS_PREFIX must be staging-media", stderr.getvalue())

    def test_safe_error_details_redacts_signed_media_render_url(self) -> None:
        smoke = _load_smoke_module()
        error = RuntimeError("failed https://example.com/media/render/asset_1?exp=1&sig=secret")

        details = smoke._safe_error_details(error)

        serialized = json.dumps(details, sort_keys=True)
        self.assertIn("[REDACTED_SIGNED_MEDIA_RENDER_URL]", serialized)
        self.assertNotIn("sig=secret", serialized)

    def test_branch_protection_requires_staging_smoke_pr_check(self) -> None:
        script = BRANCH_PROTECTION_SCRIPT_PATH.read_text(encoding="utf-8")

        self.assertIn("STAGING_SMOKE_PR_CONTEXT", script)
        self.assertIn(".github/workflows/staging-integration-smoke.yml", script)
        self.assertIn('"staging-integration-smoke-pr-check"', script)
        self.assertLess(
            script.index("Checking default-branch workflow exists for required context: ${STAGING_SMOKE_PR_CONTEXT}"),
            script.rindex('"staging-integration-smoke-pr-check"'),
        )

    def test_release_branch_ruleset_requires_same_quality_gates(self) -> None:
        ruleset = _load_release_ruleset_module()
        payload = ruleset._release_ruleset_payload()
        required_checks = [
            check["context"]
            for rule in payload["rules"]
            if rule["type"] == "required_status_checks"
            for check in rule["parameters"]["required_status_checks"]
        ]

        self.assertEqual(payload["target"], "branch")
        self.assertEqual(payload["enforcement"], "active")
        self.assertEqual(payload["conditions"]["ref_name"]["include"], ["refs/heads/release/**"])
        self.assertIn("staging-integration-smoke-pr-check", required_checks)
        self.assertIn("mobile-e2e", required_checks)
        self.assertIn("bundle-size", required_checks)
        self.assertIn("backend-media-performance-regression", required_checks)
        self.assertTrue(
            next(rule for rule in payload["rules"] if rule["type"] == "required_status_checks")["parameters"][
                "do_not_enforce_on_create"
            ]
        )
        self.assertIn("pull_request", {rule["type"] for rule in payload["rules"]})
        self.assertIn("non_fast_forward", {rule["type"] for rule in payload["rules"]})

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

    def test_render_deploy_ready_gate_selects_latest_candidate_by_created_at(self) -> None:
        gate = _load_render_deploy_gate_module()

        def request_json(method: str, url: str, api_key: str) -> dict[str, object]:
            return {
                "deploys": [
                    {
                        "id": "dep-older",
                        "createdAt": "2026-05-01T00:01:00Z",
                        "finishedAt": "2026-05-01T00:02:00Z",
                        "status": "live",
                    },
                    {
                        "id": "dep-newer",
                        "createdAt": "2026-05-01T00:03:00Z",
                        "finishedAt": "2026-05-01T00:04:00Z",
                        "status": "live",
                    },
                ]
            }

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
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["render_deploy"]["id"], "dep-newer")
        self.assertEqual(summary["render_deploy"]["status"], "live")
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_deploy_ready_gate_filters_candidates_by_expected_commit(self) -> None:
        gate = _load_render_deploy_gate_module()
        responses = iter(
            (
                {
                    "deploys": [
                        {
                            "id": "dep-main",
                            "createdAt": "2026-05-01T00:02:00Z",
                            "finishedAt": "2026-05-01T00:03:00Z",
                            "status": "live",
                            "commit": {"id": "main000000000000000000000000000000000000000"},
                        }
                    ]
                },
                {
                    "deploys": [
                        {
                            "id": "dep-branch",
                            "createdAt": "2026-05-01T00:04:00Z",
                            "finishedAt": "2026-05-01T00:05:00Z",
                            "status": "live",
                            "commit": {"id": "54dc45d4a4364bb234e2d26cfb44de492c413e02"},
                        },
                        {
                            "id": "dep-main",
                            "createdAt": "2026-05-01T00:02:00Z",
                            "finishedAt": "2026-05-01T00:03:00Z",
                            "status": "live",
                            "commit": {"id": "main000000000000000000000000000000000000000"},
                        },
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
                "RENDER_DEPLOY_EXPECTED_COMMIT": "54dc45d",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_DEPLOY_POLL_SECONDS": "1",
                "RENDER_DEPLOY_TIMEOUT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["render_deploy"]["id"], "dep-branch")
        self.assertEqual(summary["render_deploy"]["commit"], "54dc45d4a4364bb234e2d26cfb44de492c413e02")
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_deploy_ready_gate_uses_github_sha_as_expected_commit(self) -> None:
        gate = _load_render_deploy_gate_module()
        expected_commit = "54dc45d4a4364bb234e2d26cfb44de492c413e02"
        responses = iter(
            (
                {
                    "deploys": [
                        {
                            "id": "dep-main",
                            "createdAt": "2026-05-01T00:02:00Z",
                            "finishedAt": "2026-05-01T00:03:00Z",
                            "status": "live",
                            "commit": {"id": "main000000000000000000000000000000000000000"},
                        }
                    ]
                },
                {
                    "deploys": [
                        {
                            "id": "dep-branch",
                            "createdAt": "2026-05-01T00:04:00Z",
                            "finishedAt": "2026-05-01T00:05:00Z",
                            "status": "live",
                            "commit": {"id": expected_commit},
                        },
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
                "GITHUB_SHA": expected_commit,
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_DEPLOY_POLL_SECONDS": "1",
                "RENDER_DEPLOY_TIMEOUT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["expected_commit"], expected_commit)
        self.assertEqual(summary["render_deploy"]["id"], "dep-branch")
        self.assertEqual(summary["render_deploy"]["commit"], expected_commit)
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_deploy_ready_gate_waits_for_expected_deploy_id(self) -> None:
        gate = _load_render_deploy_gate_module()
        expected_commit = "54dc45d4a4364bb234e2d26cfb44de492c413e02"
        responses = iter(
            (
                {
                    "deploys": [
                        {
                            "id": "dep-target",
                            "createdAt": "2026-05-01T00:04:00Z",
                            "status": "build_in_progress",
                            "commit": {"id": expected_commit},
                        },
                        {
                            "id": "dep-old",
                            "createdAt": "2026-05-01T00:03:00Z",
                            "finishedAt": "2026-05-01T00:03:30Z",
                            "status": "live",
                            "commit": {"id": expected_commit},
                        },
                    ]
                },
                {
                    "deploys": [
                        {
                            "id": "dep-target",
                            "createdAt": "2026-05-01T00:04:00Z",
                            "finishedAt": "2026-05-01T00:05:00Z",
                            "status": "live",
                            "commit": {"id": expected_commit},
                        },
                        {
                            "id": "dep-old",
                            "createdAt": "2026-05-01T00:03:00Z",
                            "finishedAt": "2026-05-01T00:03:30Z",
                            "status": "live",
                            "commit": {"id": expected_commit},
                        },
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
                "RENDER_DEPLOY_EXPECTED_COMMIT": expected_commit,
                "RENDER_DEPLOY_EXPECTED_DEPLOY_ID": "dep-target",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_DEPLOY_POLL_SECONDS": "1",
                "RENDER_DEPLOY_TIMEOUT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["expected_deploy_id"], "dep-target")
        self.assertEqual(summary["render_deploy"]["id"], "dep-target")
        self.assertEqual(summary["render_deploy"]["status"], "live")
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_deploy_ready_gate_timeout_reports_latest_observed_commit_mismatch(self) -> None:
        gate = _load_render_deploy_gate_module()
        clock_values = iter((0.0, 1.0))

        def request_json(method: str, url: str, api_key: str) -> dict[str, object]:
            return {
                "deploys": [
                    {
                        "id": "dep-main",
                        "createdAt": "2026-05-01T00:02:00Z",
                        "finishedAt": "2026-05-01T00:03:00Z",
                        "status": "live",
                        "commit": {"id": "main000000000000000000000000000000000000000"},
                    }
                ]
            }

        def clock() -> float:
            return next(clock_values)

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_MIN_CREATED_AT": "2026-05-01T00:00:00Z",
                "RENDER_DEPLOY_EXPECTED_COMMIT": "54dc45d",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_DEPLOY_POLL_SECONDS": "1",
                "RENDER_DEPLOY_TIMEOUT_SECONDS": "1",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, clock)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "expected_commit_deploy_not_found")
        self.assertEqual(summary["expected_commit"], "54dc45d")
        self.assertIsNone(summary["render_deploy"]["commit"])
        self.assertEqual(summary["latest_observed_deploy"]["id"], "dep-main")
        self.assertEqual(summary["latest_observed_deploy"]["status"], "live")
        self.assertEqual(
            summary["latest_observed_deploy"]["commit"],
            "main000000000000000000000000000000000000000",
        )
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_deploy_ready_gate_rejects_forbidden_service_before_waiting(self) -> None:
        gate = _load_render_deploy_gate_module()
        calls: list[tuple[str, str]] = []

        def request_json(method: str, url: str, api_key: str) -> dict[str, object]:
            calls.append((method, url))
            if "/services/srv-test" in url and "/deploys" not in url:
                return {
                    "name": "foodlens-api",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_MIN_CREATED_AT": "2026-05-01T00:00:00Z",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_FORBIDDEN_SERVICE_NAMES": "foodlens-api",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "forbidden_render_service")
        self.assertEqual(summary["render_service"]["name"], "foodlens-api")
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_deploy_ready_gate_allows_free_staging_service(self) -> None:
        gate = _load_render_deploy_gate_module()
        calls: list[tuple[str, str]] = []

        def request_json(method: str, url: str, api_key: str) -> dict[str, object]:
            calls.append((method, url))
            if "/services/srv-test" in url and "/deploys" not in url:
                return {
                    "name": "foodlens-api-staging",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                    "serviceDetails": {"plan": "free"},
                }
            if "/deploys" in url:
                return {
                    "deploys": [
                        {
                            "id": "dep-test",
                            "createdAt": "2026-05-01T00:01:00Z",
                            "finishedAt": "2026-05-01T00:02:00Z",
                            "status": "live",
                        }
                    ]
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_MIN_CREATED_AT": "2026-05-01T00:00:00Z",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_ALLOWED_SERVICE_PLANS": "free",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 0)
        self.assertEqual(calls[0][0], "GET")
        self.assertEqual(summary["passed"], True)

    def test_render_deploy_ready_gate_rejects_paid_staging_service(self) -> None:
        gate = _load_render_deploy_gate_module()
        calls: list[tuple[str, str]] = []

        def request_json(method: str, url: str, api_key: str) -> dict[str, object]:
            calls.append((method, url))
            if "/services/srv-test" in url and "/deploys" not in url:
                return {
                    "name": "foodlens-api-staging",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                    "serviceDetails": {"plan": "starter"},
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_MIN_CREATED_AT": "2026-05-01T00:00:00Z",
                "RENDER_DEPLOY_SUMMARY_PATH": str(summary_path),
                "RENDER_ALLOWED_SERVICE_PLANS": "free",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "disallowed_render_service_plan")
        self.assertEqual(summary["render_service"]["plan"], "starter")
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_staging_deploy_trigger_reports_missing_env_without_values(self) -> None:
        trigger = _load_render_deploy_trigger_module()
        self.assertEqual(trigger.REQUIRED_ENV_NAMES, EXPECTED_RENDER_DEPLOY_TRIGGER_ENV_NAMES)

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_DEPLOY_TRIGGER_SUMMARY_PATH": str(summary_path),
            }

            with (
                patch("sys.stdout", new_callable=io.StringIO) as stdout,
                patch("sys.stderr", new_callable=io.StringIO) as stderr,
            ):
                status = trigger.run_trigger(
                    env,
                    lambda method, url, api_key, payload: (_ for _ in ()).throw(
                        AssertionError("request should not run")
                    ),
                )
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 2)
        self.assertEqual(summary["missing_env"], ["RENDER_SERVICE_ID"])
        self.assertNotIn("render-secret-key", json.dumps(summary))
        self.assertNotIn("render-secret-key", stdout.getvalue())
        self.assertNotIn("render-secret-key", stderr.getvalue())

    def test_render_staging_deploy_trigger_request_errors_do_not_expose_secret_inputs(self) -> None:
        trigger = _load_render_deploy_trigger_module()
        service_id = "srv-secret"
        api_key = "render-secret-key"
        url = f"https://api.render.com/v1/services/{service_id}/deploys"

        with patch.object(
            trigger,
            "urlopen",
            side_effect=trigger.URLError(f"service {service_id} failed with {api_key}"),
        ):
            with self.assertRaises(RuntimeError) as raised:
                trigger._request_json("GET", url, api_key, None)

        message = str(raised.exception)
        self.assertIn("Render API GET request failed", message)
        self.assertIn("[redacted-service]", message)
        self.assertNotIn(service_id, message)
        self.assertNotIn(api_key, message)
        self.assertNotIn("/services/", message)

    def test_render_staging_deploy_trigger_posts_expected_commit_after_free_plan_guard(self) -> None:
        trigger = _load_render_deploy_trigger_module()
        expected_commit = "c89681b530d7dbcd28d23ae44025f6faaeae27fe"
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            calls.append((method, url, payload))
            if method == "GET" and "/services/srv-test" in url:
                return {
                    "name": "foodlens-api-staging",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                    "serviceDetails": {"plan": "free"},
                }
            if method == "POST" and url.endswith("/services/srv-test/deploys"):
                return {
                    "id": "dep-test",
                    "createdAt": "2026-05-01T00:01:00Z",
                    "status": "build_in_progress",
                    "commit": {"id": expected_commit},
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "GITHUB_SHA": expected_commit,
                "RENDER_DEPLOY_TRIGGER_SUMMARY_PATH": str(summary_path),
                "RENDER_FORBIDDEN_SERVICE_NAMES": "foodlens-api",
                "RENDER_ALLOWED_SERVICE_NAMES": "foodlens-api-staging",
                "RENDER_ALLOWED_SERVICE_PLANS": "free",
                "GITHUB_ENV": str(Path(temp_dir) / "github.env"),
            }

            with (
                patch("sys.stdout", new_callable=io.StringIO) as stdout,
                patch("sys.stderr", new_callable=io.StringIO) as stderr,
            ):
                status = trigger.run_trigger(env, request_json)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            github_env_content = (Path(temp_dir) / "github.env").read_text(encoding="utf-8")

        self.assertEqual(status, 0)
        self.assertEqual(calls[0][0], "GET")
        self.assertEqual(
            calls[1],
            ("POST", "https://api.render.com/v1/services/srv-test/deploys", {"commitId": expected_commit}),
        )
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["expected_commit"], expected_commit)
        self.assertEqual(summary["render_deploy"]["commit"], expected_commit)
        self.assertEqual(summary["render_service"]["name"], "foodlens-api-staging")
        self.assertEqual(summary["render_service"]["plan"], "free")
        self.assertEqual(github_env_content, "RENDER_DEPLOY_EXPECTED_DEPLOY_ID=dep-test\n")
        self.assertNotIn("render-secret-key", json.dumps(summary))
        self.assertNotIn("render-secret-key", stdout.getvalue())
        self.assertNotIn("render-secret-key", stderr.getvalue())

    def test_render_staging_deploy_trigger_rejects_production_service_before_post(self) -> None:
        trigger = _load_render_deploy_trigger_module()
        calls: list[tuple[str, str]] = []

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            calls.append((method, url))
            if method == "GET" and "/services/srv-test" in url:
                return {
                    "name": "foodlens-api",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                    "serviceDetails": {"plan": "starter"},
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_TRIGGER_SUMMARY_PATH": str(summary_path),
                "RENDER_FORBIDDEN_SERVICE_NAMES": "foodlens-api",
            }

            with (
                patch("sys.stdout", new_callable=io.StringIO) as stdout,
                patch("sys.stderr", new_callable=io.StringIO) as stderr,
            ):
                status = trigger.run_trigger(env, request_json)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "forbidden_render_service")
        self.assertEqual(summary["render_service"]["name"], "foodlens-api")
        self.assertNotIn("render-secret-key", json.dumps(summary))
        self.assertNotIn("render-secret-key", stdout.getvalue())
        self.assertNotIn("render-secret-key", stderr.getvalue())

    def test_render_staging_deploy_trigger_rejects_unexpected_free_service_before_post(self) -> None:
        trigger = _load_render_deploy_trigger_module()
        calls: list[tuple[str, str]] = []

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            calls.append((method, url))
            if method == "GET" and "/services/srv-test" in url:
                return {
                    "name": "FoodLens",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                    "serviceDetails": {"plan": "free"},
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_TRIGGER_SUMMARY_PATH": str(summary_path),
                "RENDER_ALLOWED_SERVICE_NAMES": "foodlens-api-staging",
                "RENDER_ALLOWED_SERVICE_PLANS": "free",
            }

            with (
                patch("sys.stdout", new_callable=io.StringIO) as stdout,
                patch("sys.stderr", new_callable=io.StringIO) as stderr,
            ):
                status = trigger.run_trigger(env, request_json)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "disallowed_render_service")
        self.assertEqual(summary["render_service"]["name"], "FoodLens")
        self.assertNotIn("render-secret-key", json.dumps(summary))
        self.assertNotIn("render-secret-key", stdout.getvalue())
        self.assertNotIn("render-secret-key", stderr.getvalue())

    def test_render_staging_deploy_trigger_rejects_paid_staging_service_before_post(self) -> None:
        trigger = _load_render_deploy_trigger_module()
        calls: list[tuple[str, str]] = []

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            calls.append((method, url))
            if method == "GET" and "/services/srv-test" in url:
                return {
                    "name": "foodlens-api-staging",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                    "serviceDetails": {"plan": "starter"},
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_DEPLOY_TRIGGER_SUMMARY_PATH": str(summary_path),
                "RENDER_ALLOWED_SERVICE_PLANS": "free",
            }

            with (
                patch("sys.stdout", new_callable=io.StringIO) as stdout,
                patch("sys.stderr", new_callable=io.StringIO) as stderr,
            ):
                status = trigger.run_trigger(env, request_json)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "disallowed_render_service_plan")
        self.assertEqual(summary["render_service"]["plan"], "starter")
        self.assertNotIn("render-secret-key", json.dumps(summary))
        self.assertNotIn("render-secret-key", stdout.getvalue())
        self.assertNotIn("render-secret-key", stderr.getvalue())

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
            if "/jobs/job-test" in url:
                return {"id": "job-test", "status": next(statuses), "finishedAt": "2026-05-01T00:01:00Z"}
            if "/services/srv-test" in url:
                return {"ownerId": "owner-test", "name": "foodlens-api-staging"}
            if "/logs?" in url:
                return {
                    "logs": [
                        {"message": "[StagingSmoke] media_delete: PASS"},
                        {"message": "[StagingSmoke] retention_retry: PASS"},
                        {"message": "[StagingSmoke] postgres_queue_crash_rehearsal: PASS"},
                    ]
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            log_path = Path(temp_dir) / "render.log"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
                "RENDER_JOB_LOG_PATH": str(log_path),
                "RENDER_JOB_POLL_SECONDS": "1",
                "RENDER_JOB_TIMEOUT_SECONDS": "30",
                "RENDER_JOB_LOG_WAIT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            log_content = log_path.read_text(encoding="utf-8")

        self.assertEqual(status, 0)
        self.assertEqual(calls[0][0], "GET")
        self.assertEqual(calls[1][0], "POST")
        self.assertEqual(calls[1][2], {"startCommand": "python backend/scripts/staging_integration_smoke.py"})
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["render_job"]["status"], "succeeded")
        self.assertEqual(summary["smoke_checks"]["media_delete"], "pass")
        self.assertEqual(summary["smoke_checks"]["retention_retry"], "pass")
        self.assertEqual(summary["smoke_checks"]["postgres_queue_crash_rehearsal"], "pass")
        self.assertIn("[StagingSmoke] media_delete: PASS", log_content)
        self.assertIn("[StagingSmoke] retention_retry: PASS", log_content)
        self.assertIn("[StagingSmoke] postgres_queue_crash_rehearsal: PASS", log_content)
        log_urls = [url for method, url, payload in calls if method == "GET" and payload is None and "/logs?" in url]
        self.assertEqual(len(log_urls), 1)
        log_query = parse_qs(urlparse(log_urls[0]).query)
        self.assertEqual(log_query["resource"], ["job-test"])
        self.assertEqual(log_query["startTime"], ["2026-04-30T23:55:00Z"])
        self.assertEqual(log_query["endTime"], ["2026-05-01T00:06:00Z"])

    def test_render_one_off_job_gate_collects_paginated_job_logs(self) -> None:
        gate = _load_render_job_gate_module()
        log_urls: list[str] = []

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            if method == "POST":
                return {"id": "job-test", "status": "created", "createdAt": "2026-05-01T00:00:00Z"}
            if "/jobs/job-test" in url:
                return {
                    "id": "job-test",
                    "status": "succeeded",
                    "startedAt": "2026-05-01T00:00:10Z",
                    "finishedAt": "2026-05-01T00:01:00Z",
                }
            if "/services/srv-test" in url:
                return {"ownerId": "owner-test", "name": "foodlens-api-staging"}
            if "/logs?" in url:
                log_urls.append(url)
                if len(log_urls) == 1:
                    return {
                        "hasMore": True,
                        "nextStartTime": "2026-05-01T00:00:30Z",
                        "nextEndTime": "2026-05-01T00:06:00Z",
                        "logs": [{"message": "[StagingSmoke] startup: PASS"}],
                    }
                return {
                    "hasMore": False,
                    "logs": [
                        {"message": "[StagingSmoke] media_delete: PASS"},
                        {"message": "[StagingSmoke] retention_retry: PASS"},
                        {"message": "[StagingSmoke] postgres_queue_crash_rehearsal: PASS"},
                    ],
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            log_path = Path(temp_dir) / "render.log"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
                "RENDER_JOB_LOG_PATH": str(log_path),
                "RENDER_JOB_POLL_SECONDS": "1",
                "RENDER_JOB_TIMEOUT_SECONDS": "30",
                "RENDER_JOB_LOG_WAIT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))
            log_content = log_path.read_text(encoding="utf-8")

        self.assertEqual(status, 0)
        self.assertEqual(summary["passed"], True)
        self.assertEqual(len(log_urls), 2)
        first_query = parse_qs(urlparse(log_urls[0]).query)
        second_query = parse_qs(urlparse(log_urls[1]).query)
        self.assertEqual(first_query["startTime"], ["2026-04-30T23:55:00Z"])
        self.assertEqual(first_query["endTime"], ["2026-05-01T00:06:00Z"])
        self.assertEqual(second_query["startTime"], ["2026-05-01T00:00:30Z"])
        self.assertEqual(second_query["endTime"], ["2026-05-01T00:06:00Z"])
        self.assertIn("[StagingSmoke] startup: PASS", log_content)
        self.assertIn("[StagingSmoke] postgres_queue_crash_rehearsal: PASS", log_content)

    def test_render_one_off_job_gate_rejects_forbidden_service_before_job_creation(self) -> None:
        gate = _load_render_job_gate_module()
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            calls.append((method, url, payload))
            if method == "GET" and "/services/srv-test" in url:
                return {
                    "name": "foodlens-api",
                    "type": "web_service",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
                "RENDER_FORBIDDEN_SERVICE_NAMES": "foodlens-api",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "forbidden_render_service")
        self.assertEqual(summary["render_service"]["name"], "foodlens-api")
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_one_off_job_gate_rejects_default_production_service_before_job_creation(self) -> None:
        gate = _load_render_job_gate_module()
        calls: list[tuple[str, str, dict[str, object] | None]] = []

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            calls.append((method, url, payload))
            if method == "GET" and "/services/srv-test" in url:
                return {
                    "name": "foodlens-worker",
                    "type": "background_worker",
                    "branch": "main",
                    "repo": "https://github.com/zzocojoa/FoodLens",
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["error"], "forbidden_render_service")
        self.assertEqual(summary["render_service"]["name"], "foodlens-worker")
        self.assertNotIn("render-secret-key", json.dumps(summary))

    def test_render_one_off_job_gate_retries_transient_log_timeout(self) -> None:
        gate = _load_render_job_gate_module()
        now = 0.0
        log_attempts = 0

        def sleeper(seconds: float) -> None:
            nonlocal now
            now += seconds

        def clock() -> float:
            return now

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            nonlocal log_attempts
            if method == "POST":
                return {"id": "job-test", "status": "succeeded", "createdAt": "2026-05-01T00:00:00Z"}
            if "/services/srv-test" in url:
                return {"ownerId": "owner-test", "name": "foodlens-api-staging"}
            if "/logs?" in url:
                log_attempts += 1
                if log_attempts == 1:
                    raise RuntimeError("Render API GET timed out.")
                return {
                    "logs": [
                        {"message": "[StagingSmoke] media_delete: PASS"},
                        {"message": "[StagingSmoke] retention_retry: PASS"},
                        {"message": "[StagingSmoke] postgres_queue_crash_rehearsal: PASS"},
                    ]
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            log_path = Path(temp_dir) / "render.log"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
                "RENDER_JOB_LOG_PATH": str(log_path),
                "RENDER_JOB_POLL_SECONDS": "1",
                "RENDER_JOB_TIMEOUT_SECONDS": "30",
                "RENDER_JOB_LOG_WAIT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, sleeper, clock)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 0)
        self.assertEqual(log_attempts, 2)
        self.assertEqual(summary["passed"], True)
        self.assertEqual(summary["smoke_checks"]["media_delete"], "pass")
        self.assertEqual(summary["smoke_checks"]["retention_retry"], "pass")
        self.assertEqual(summary["smoke_checks"]["postgres_queue_crash_rehearsal"], "pass")

    def test_render_one_off_job_gate_fails_when_success_logs_omit_checks(self) -> None:
        gate = _load_render_job_gate_module()
        now = 0.0

        def clock() -> float:
            nonlocal now
            now += 10.0
            return now

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            if method == "POST":
                return {"id": "job-test", "status": "succeeded", "createdAt": "2026-05-01T00:00:00Z"}
            if "/services/srv-test" in url:
                return {"ownerId": "owner-test", "name": "foodlens-api-staging"}
            if "/logs?" in url:
                return {"logs": [{"message": "[Startup] ready"}]}
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            log_path = Path(temp_dir) / "render.log"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
                "RENDER_JOB_LOG_PATH": str(log_path),
                "RENDER_JOB_LOG_WAIT_SECONDS": "1",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, clock)
            summary = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(status, 1)
        self.assertEqual(summary["passed"], False)
        self.assertEqual(summary["render_job"]["status"], "succeeded")
        self.assertEqual(summary["smoke_checks"]["media_delete"], "missing")
        self.assertEqual(summary["smoke_checks"]["retention_retry"], "missing")
        self.assertEqual(summary["smoke_checks"]["postgres_queue_crash_rehearsal"], "missing")

    def test_render_one_off_job_gate_redacts_log_artifact_secrets(self) -> None:
        gate = _load_render_job_gate_module()

        def request_json(method: str, url: str, api_key: str, payload: dict[str, object] | None) -> dict[str, object]:
            if method == "POST":
                return {"id": "job-test", "status": "succeeded", "createdAt": "2026-05-01T00:00:00Z"}
            if "/services/srv-test" in url:
                return {"ownerId": "owner-test", "name": "foodlens-api-staging"}
            if "/logs?" in url:
                return {
                    "logs": [
                        {"message": "Authorization: Bearer secret-token"},
                        {"message": "postgresql://user:password@example.com/db"},
                        {"message": 'payload {"private_key":"secret-private-key"}'},
                        {"message": "https://example.com/media/render/asset-test?expires=1&sig=secret-signature"},
                        {"message": "[StagingSmoke] media_delete: PASS"},
                        {"message": "[StagingSmoke] retention_retry: PASS"},
                        {"message": "[StagingSmoke] postgres_queue_crash_rehearsal: PASS"},
                    ]
                }
            raise AssertionError(f"unexpected request: {method} {url}")

        with tempfile.TemporaryDirectory() as temp_dir:
            summary_path = Path(temp_dir) / "summary.json"
            log_path = Path(temp_dir) / "render.log"
            env = {
                "RENDER_API_KEY": "render-secret-key",
                "RENDER_SERVICE_ID": "srv-test",
                "RENDER_START_COMMAND": "python backend/scripts/staging_integration_smoke.py",
                "RENDER_JOB_SUMMARY_PATH": str(summary_path),
                "RENDER_JOB_LOG_PATH": str(log_path),
                "RENDER_JOB_LOG_WAIT_SECONDS": "30",
            }

            status = gate.run_gate(env, request_json, lambda seconds: None, lambda: 0.0)
            log_content = log_path.read_text(encoding="utf-8")

        self.assertEqual(status, 0)
        self.assertNotIn("secret-token", log_content)
        self.assertNotIn("postgresql://", log_content)
        self.assertNotIn("secret-private-key", log_content)
        self.assertNotIn("sig=secret-signature", log_content)
        self.assertIn("[StagingSmoke] media_delete: PASS", log_content)


if __name__ == "__main__":
    unittest.main()
