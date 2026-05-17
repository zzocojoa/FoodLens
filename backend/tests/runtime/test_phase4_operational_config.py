import contextlib
import importlib.util
import io
import sys
import unittest
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[3]
RENDER_BLUEPRINT_PATH = PROJECT_ROOT / "render.yaml"
API_CONTRACT_PATH = PROJECT_ROOT / "docs" / "contracts" / "api-contracts.md"
RENDER_LIVE_ENV_SCRIPT_PATH = PROJECT_ROOT / ".github" / "scripts" / "validate_render_live_env.py"
RENDER_BLUEPRINT_WORKFLOW_PATH = PROJECT_ROOT / ".github" / "workflows" / "phase2-render-blueprint.yml"


class Phase4OperationalConfigTests(unittest.TestCase):
    def test_render_blueprint_declares_phase4_backend_policy_envs(self):
        render_blueprint = RENDER_BLUEPRINT_PATH.read_text(encoding="utf-8")

        required_keys = (
            "UPSTREAM_429_RETRY_AFTER_SECONDS",
            "GEMINI_RETRY_TIMEOUT_SECONDS",
            "GEMINI_RETRY_MAX_ATTEMPTS",
            "GEMINI_MODEL_NAME",
            "GEMINI_FOOD_MAX_OUTPUT_TOKENS",
            "GEMINI_FOOD_RETRY_MAX_OUTPUT_TOKENS",
            "GEMINI_FOOD_MAX_OUTPUT_TOKENS_RETRY",
            "GEMINI_FOOD_FLASH_THINKING_BUDGET",
            "GEMINI_FOOD_FLASH_LITE_THINKING_BUDGET",
            "GEMINI_FOOD_MAX_PROVIDER_CALLS_PER_REQUEST",
            "GEMINI_BARCODE_ALLERGEN_THINKING_BUDGET",
            "AI_COST_GUARDRAIL_ENABLED",
            "AI_COST_GUARDRAIL_STORAGE_BACKEND",
            "AI_COST_GUARDRAIL_USAGE_TABLE",
            "AI_COST_GUARDRAIL_RESERVATION_TABLE",
            "AI_MONTHLY_BUDGET_USD",
            "FOOD_ESTIMATED_COST_USD_PER_REQUEST",
            "FOOD_ESTIMATED_TOKENS_PER_REQUEST",
            "SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST",
            "SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST",
            "GEMINI_LABEL_FALLBACK_ON_PARSE_ERROR",
            "GEMINI_LABEL_FALLBACK_ON_MAX_TOKENS",
            "GEMINI_LABEL_PRO_FALLBACK_ENABLED",
            "LABEL_COST_GUARDRAIL_ENABLED",
            "LABEL_COST_GUARDRAIL_STORAGE_BACKEND",
            "LABEL_COST_GUARDRAIL_USAGE_TABLE",
            "LABEL_COST_GUARDRAIL_RESERVATION_TABLE",
            "LABEL_MONTHLY_BUDGET_USD",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_FALLBACK",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK",
            "LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER",
            "LABEL_ESTIMATED_TOKENS_PER_REQUEST",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE",
            "LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE",
            "BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST",
            "BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST",
            "LABEL_ROLLOUT_PERCENTAGE",
            "BARCODE_UPSTREAM_TIMEOUT_SECONDS",
            "BARCODE_UPSTREAM_RETRY_COUNT",
            "BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS",
        )

        for required_key in required_keys:
            self.assertIn(f"- key: {required_key}", render_blueprint)
            self.assertEqual(render_blueprint.count(f"- key: {required_key}\n"), 3)

        self.assertIn("- key: AI_COST_GUARDRAIL_USAGE_TABLE\n        value: ai_monthly_usage", render_blueprint)
        self.assertIn(
            "- key: AI_COST_GUARDRAIL_RESERVATION_TABLE\n        value: ai_monthly_usage_reservations",
            render_blueprint,
        )
        fixed_values = (
            ("GEMINI_FOOD_MAX_OUTPUT_TOKENS", "4096"),
            ("GEMINI_FOOD_RETRY_MAX_OUTPUT_TOKENS", "6144"),
            ("GEMINI_FOOD_MAX_OUTPUT_TOKENS_RETRY", "6144"),
            ("GEMINI_FOOD_FLASH_THINKING_BUDGET", "0"),
            ("GEMINI_FOOD_FLASH_LITE_THINKING_BUDGET", "0"),
            ("GEMINI_FOOD_MAX_PROVIDER_CALLS_PER_REQUEST", "3"),
            ("GEMINI_BARCODE_ALLERGEN_THINKING_BUDGET", "0"),
            ("GEMINI_LABEL_PRO_FALLBACK_ENABLED", "0"),
            ("AI_COST_GUARDRAIL_ENABLED", "1"),
            ("AI_MONTHLY_BUDGET_USD", "10"),
            ("FOOD_ESTIMATED_COST_USD_PER_REQUEST", "0.006"),
            ("FOOD_ESTIMATED_TOKENS_PER_REQUEST", "2500"),
            ("SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST", "0.001"),
            ("SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST", "300"),
            ("LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK", "0.12"),
            ("LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER", "6"),
            ("BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST", "0.001"),
            ("BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST", "500"),
            ("AUTH_GOOGLE_OAUTH_PROMPT", "select_account"),
        )
        for key, value in fixed_values:
            self.assertEqual(render_blueprint.count(f'- key: {key}\n        value: "{value}"'), 3)

        self.assertEqual(
            render_blueprint.count("- key: AI_COST_GUARDRAIL_STORAGE_BACKEND\n        value: postgres"),
            3,
        )
        self.assertEqual(
            render_blueprint.count("- key: AI_COST_GUARDRAIL_USAGE_TABLE\n        value: ai_monthly_usage"),
            3,
        )
        self.assertEqual(
            render_blueprint.count(
                "- key: AI_COST_GUARDRAIL_RESERVATION_TABLE\n        value: ai_monthly_usage_reservations"
            ),
            3,
        )

    def test_render_blueprint_aligns_barcode_upstream_policy_with_phase4_defaults(self):
        render_blueprint = RENDER_BLUEPRINT_PATH.read_text(encoding="utf-8")

        self.assertIn('- key: BARCODE_UPSTREAM_TIMEOUT_SECONDS\n        value: "15"', render_blueprint)
        self.assertIn('- key: BARCODE_UPSTREAM_RETRY_COUNT\n        value: "3"', render_blueprint)
        self.assertIn('- key: BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS\n        value: "1.0"', render_blueprint)

    def test_render_blueprint_declares_auth_rate_limit_policy_envs(self):
        render_blueprint = RENDER_BLUEPRINT_PATH.read_text(encoding="utf-8")

        required_values = (
            ("AUTH_RATE_LIMIT_ENABLED", "1"),
            ("AUTH_RATE_LIMIT_BACKEND", "postgres"),
            ("AUTH_RATE_LIMIT_TABLE", "auth_rate_limit_events"),
            ("AUTH_RATE_LIMIT_WINDOW_SECONDS", "60"),
            ("AUTH_RATE_LIMIT_LOGIN_PER_MIN", "5"),
            ("AUTH_RATE_LIMIT_SIGNUP_PER_MIN", "3"),
            ("AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN", "3"),
            ("AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN", "3"),
            ("AUTH_RATE_LIMIT_OAUTH_LOGIN_PER_MIN", "10"),
            ("AUTH_RATE_LIMIT_OAUTH_START_PER_MIN", "30"),
            ("AUTH_RATE_LIMIT_OAUTH_CALLBACK_PER_MIN", "30"),
        )
        for key, value in required_values:
            self.assertEqual(render_blueprint.count(f'- key: {key}\n        value: "{value}"'), 3)

    def test_render_blueprint_keeps_sensitive_envs_dashboard_managed(self) -> None:
        render_blueprint = RENDER_BLUEPRINT_PATH.read_text(encoding="utf-8")

        sensitive_keys = (
            "DATABASE_URL",
            "GCP_SERVICE_ACCOUNT_JSON",
            "MEDIA_RENDER_SIGNING_SECRET",
            "AUTH_GOOGLE_CLIENT_SECRET",
            "AUTH_KAKAO_CLIENT_SECRET",
            "AUTH_EMAIL_SMTP_PASSWORD",
            "DATAGO_API_KEY",
            "DATAGO_I2790_API_KEY",
            "KOREAN_FDA_API_KEY",
            "SENTRY_DSN",
        )
        for sensitive_key in sensitive_keys:
            self.assertEqual(render_blueprint.count(f"- key: {sensitive_key}\n        sync: false"), 3)

    def test_api_contract_documents_auth_rate_limit_policy_envs_and_response(self) -> None:
        api_contract = API_CONTRACT_PATH.read_text(encoding="utf-8")

        required_terms = (
            "POST /auth/email/signup",
            "POST /auth/email/login",
            "POST /auth/email/verification/request",
            "POST /auth/email/password/reset/request",
            "AUTH_RATE_LIMIT_ENABLED",
            "AUTH_RATE_LIMIT_BACKEND",
            "AUTH_RATE_LIMIT_TABLE",
            "AUTH_RATE_LIMIT_WINDOW_SECONDS",
            "AUTH_RATE_LIMIT_LOGIN_PER_MIN",
            "AUTH_RATE_LIMIT_SIGNUP_PER_MIN",
            "AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN",
            "AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN",
            "AUTH_RATE_LIMIT_OAUTH_LOGIN_PER_MIN",
            "AUTH_RATE_LIMIT_OAUTH_START_PER_MIN",
            "AUTH_RATE_LIMIT_OAUTH_CALLBACK_PER_MIN",
            "AUTH_RATE_LIMITED",
            "AUTH_RATE_LIMIT_STORAGE_UNAVAILABLE",
            "Retry-After: <seconds>",
            "Too many authentication attempts. Please retry shortly.",
            "Authentication rate limiting is temporarily unavailable. Please retry shortly.",
            "detail.retry_scope",
            "detail.retryable_by_client",
            "auth_rate_limit_events",
            "DELETE FROM auth_rate_limit_events",
            "AuthRateLimit] slow evaluation",
        )
        for required_term in required_terms:
            self.assertIn(required_term, api_contract)

    def test_render_live_env_gate_runs_for_same_repo_pull_requests(self) -> None:
        workflow = RENDER_BLUEPRINT_WORKFLOW_PATH.read_text(encoding="utf-8")

        self.assertIn("github.event.pull_request.head.repo.full_name == github.repository", workflow)
        self.assertIn("github.event_name != 'pull_request'", workflow)


def _load_render_live_env_module() -> Any:
    spec = importlib.util.spec_from_file_location("validate_render_live_env", RENDER_LIVE_ENV_SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Failed to load script: {RENDER_LIVE_ENV_SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class _FakeRenderApi:
    def __init__(self, live_env_by_service: dict[str, dict[str, str]], page_size: int) -> None:
        self.service_ids_by_name: dict[str, str] = {
            service_name: f"service-{index}"
            for index, service_name in enumerate(live_env_by_service, start=1)
        }
        self.live_env_by_service = live_env_by_service
        self.page_size = page_size

    def _page(self, url: str, items: list[dict[str, object]]) -> list[dict[str, object]]:
        query = parse_qs(urlparse(url).query)
        raw_cursor = query.get("cursor", ["0"])[0]
        start_index = int(raw_cursor)
        end_index = start_index + self.page_size
        page_items = [dict(item) for item in items[start_index:end_index]]
        if end_index < len(items) and page_items:
            page_items[-1]["cursor"] = str(end_index)
        return page_items

    def request_json(self, method: str, url: str, api_key: str) -> object:
        if method != "GET":
            raise RuntimeError(f"Unexpected method: {method}")
        if "/services?" in url:
            service_items: list[dict[str, object]] = [
                {"service": {"id": service_id, "name": service_name}}
                for service_name, service_id in self.service_ids_by_name.items()
            ]
            return self._page(url, service_items)
        for service_name, service_id in self.service_ids_by_name.items():
            if f"/services/{service_id}/env-vars?" not in url:
                continue
            env_items: list[dict[str, object]] = [
                {"envVar": {"key": key, "value": value}}
                for key, value in self.live_env_by_service[service_name].items()
            ]
            return self._page(url, env_items)
        raise RuntimeError(f"Unexpected URL: {url}")


class RenderLiveEnvValidationTests(unittest.TestCase):
    def _live_env_from_blueprint(self, module: Any, all_blueprint_env: bool) -> dict[str, dict[str, str]]:
        contract = module._required_env_contract(module.parse_blueprint_services(RENDER_BLUEPRINT_PATH), all_blueprint_env)
        live_env_by_service: dict[str, dict[str, str]] = {}
        for service_name, service_contract in contract.items():
            live_env_by_service[service_name] = {
                key: env_var.value if env_var.value is not None else "present-without-value"
                for key, env_var in service_contract.items()
            }
        return live_env_by_service

    def _run_gate(
        self,
        module: Any,
        live_env_by_service: dict[str, dict[str, str]],
        check_values: bool,
        all_blueprint_env: bool,
        page_size: int,
    ) -> tuple[int, str]:
        buffer = io.StringIO()
        fake_api = _FakeRenderApi(live_env_by_service, page_size)
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            exit_code = module.run_gate(
                {"RENDER_API_KEY": "test-render-api-key"},
                RENDER_BLUEPRINT_PATH,
                check_values,
                all_blueprint_env,
                fake_api.request_json,
            )
        return exit_code, buffer.getvalue()

    def test_render_live_env_check_reports_missing_required_default_keys_without_values(self) -> None:
        module = _load_render_live_env_module()
        live_env_by_service = self._live_env_from_blueprint(module, False)
        missing_keys = (
            "GEMINI_LABEL_PRO_FALLBACK_ENABLED",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK",
            "LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER",
            "AUTH_RATE_LIMIT_ENABLED",
            "AUTH_RATE_LIMIT_BACKEND",
            "AUTH_RATE_LIMIT_TABLE",
            "AUTH_RATE_LIMIT_WINDOW_SECONDS",
            "AUTH_RATE_LIMIT_LOGIN_PER_MIN",
            "AUTH_RATE_LIMIT_SIGNUP_PER_MIN",
            "AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN",
            "AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN",
            "AUTH_RATE_LIMIT_OAUTH_LOGIN_PER_MIN",
            "AUTH_RATE_LIMIT_OAUTH_START_PER_MIN",
            "AUTH_RATE_LIMIT_OAUTH_CALLBACK_PER_MIN",
            "AUTH_GOOGLE_OAUTH_PROMPT",
            "ANALYSIS_JOBS_TTL_SCRUB_ENABLED",
            "ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN",
            "ANALYSIS_JOBS_TTL_SCRUB_DAYS",
            "ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE",
            "DELETION_QUEUE_RETRY_MAX_ATTEMPTS",
            "DELETION_QUEUE_RETRY_BASE_DELAY_SECONDS",
            "DELETION_QUEUE_RETRY_MAX_DELAY_SECONDS",
        )
        for service_env in live_env_by_service.values():
            for missing_key in missing_keys:
                del service_env[missing_key]

        exit_code, output = self._run_gate(module, live_env_by_service, False, False, 100)

        self.assertEqual(exit_code, 1)
        self.assertIn("GEMINI_LABEL_PRO_FALLBACK_ENABLED", output)
        self.assertIn("LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK", output)
        self.assertIn("LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER", output)
        self.assertIn("AUTH_RATE_LIMIT_ENABLED", output)
        self.assertIn("AUTH_RATE_LIMIT_BACKEND", output)
        self.assertIn("AUTH_RATE_LIMIT_TABLE", output)
        self.assertIn("AUTH_RATE_LIMIT_WINDOW_SECONDS", output)
        self.assertIn("AUTH_RATE_LIMIT_LOGIN_PER_MIN", output)
        self.assertIn("AUTH_RATE_LIMIT_SIGNUP_PER_MIN", output)
        self.assertIn("AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN", output)
        self.assertIn("AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN", output)
        self.assertIn("AUTH_RATE_LIMIT_OAUTH_LOGIN_PER_MIN", output)
        self.assertIn("AUTH_RATE_LIMIT_OAUTH_START_PER_MIN", output)
        self.assertIn("AUTH_RATE_LIMIT_OAUTH_CALLBACK_PER_MIN", output)
        self.assertIn("AUTH_GOOGLE_OAUTH_PROMPT", output)
        self.assertIn("ANALYSIS_JOBS_TTL_SCRUB_ENABLED", output)
        self.assertIn("ANALYSIS_JOBS_TTL_SCRUB_DRY_RUN", output)
        self.assertIn("ANALYSIS_JOBS_TTL_SCRUB_DAYS", output)
        self.assertIn("ANALYSIS_JOBS_TTL_SCRUB_BATCH_SIZE", output)
        self.assertIn("DELETION_QUEUE_RETRY_MAX_ATTEMPTS", output)
        self.assertIn("DELETION_QUEUE_RETRY_BASE_DELAY_SECONDS", output)
        self.assertIn("DELETION_QUEUE_RETRY_MAX_DELAY_SECONDS", output)
        self.assertIn("present=false", output)
        self.assertIn("action=update Render Dashboard env keys or render.yaml", output)
        self.assertNotIn("0.12", output)
        self.assertNotIn("gemini-2.5-flash", output)
        self.assertNotIn("gemini-2.5-flash-lite", output)
        self.assertNotIn("select_account", output)

    def test_render_live_env_check_passes_when_required_keys_exist(self) -> None:
        module = _load_render_live_env_module()
        exit_code, output = self._run_gate(module, self._live_env_from_blueprint(module, False), False, False, 100)

        self.assertEqual(exit_code, 0)
        self.assertIn("live env contract checks passed", output)
        self.assertNotIn("PORT", output)

    def test_render_live_env_all_blueprint_env_checks_non_guardrail_keys(self) -> None:
        module = _load_render_live_env_module()
        exit_code, output = self._run_gate(module, self._live_env_from_blueprint(module, False), False, True, 100)

        self.assertEqual(exit_code, 1)
        self.assertIn("key=PORT", output)
        self.assertIn("present=false", output)

    def test_render_live_env_check_handles_paginated_services_and_env_vars(self) -> None:
        module = _load_render_live_env_module()
        exit_code, output = self._run_gate(module, self._live_env_from_blueprint(module, False), False, False, 1)

        self.assertEqual(exit_code, 0)
        self.assertIn("services_checked=3", output)

    def test_render_live_env_value_check_does_not_print_actual_values(self) -> None:
        module = _load_render_live_env_module()
        live_env_by_service = self._live_env_from_blueprint(module, False)
        service_env = live_env_by_service["foodlens-api"]
        service_env["GEMINI_LABEL_PRO_FALLBACK_ENABLED"] = "sensitive-looking-wrong-value"

        exit_code, output = self._run_gate(module, live_env_by_service, True, False, 100)

        self.assertEqual(exit_code, 1)
        self.assertIn("matches_blueprint=false", output)
        self.assertNotIn("sensitive-looking-wrong-value", output)


if __name__ == "__main__":
    unittest.main()
