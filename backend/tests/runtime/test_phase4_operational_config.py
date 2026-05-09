import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
RENDER_BLUEPRINT_PATH = PROJECT_ROOT / "render.yaml"


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


if __name__ == "__main__":
    unittest.main()
