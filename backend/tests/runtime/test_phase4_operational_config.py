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
            "GEMINI_LABEL_PRIMARY_MODEL_NAME",
            "GEMINI_LABEL_FALLBACK_MODEL_NAME",
            "GEMINI_LABEL_PRO_FALLBACK_ENABLED",
            "GEMINI_LABEL_ALLOW_PRO_PRIMARY",
            "LABEL_COST_GUARDRAIL_ENABLED",
            "LABEL_COST_GUARDRAIL_STORAGE_BACKEND",
            "LABEL_COST_GUARDRAIL_TABLE",
            "LABEL_MONTHLY_BUDGET_USD",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST",
            "LABEL_ESTIMATED_TOKENS_PER_REQUEST",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE",
            "LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK",
            "LABEL_ESTIMATED_TOKENS_PER_REQUEST_PRO_FALLBACK",
            "LABEL_PER_REQUEST_BUDGET_USD",
            "COST_GUARDRAIL_RESERVATION_TTL_SECONDS",
            "FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST",
            "FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST",
            "BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST",
            "BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST",
            "AI_COST_PRICE_CATALOG_PATH",
            "SMART_ROUTER_COST_GUARDRAIL_ENABLED",
            "SMART_ROUTER_COST_GUARDRAIL_STORAGE_BACKEND",
            "SMART_ROUTER_COST_GUARDRAIL_TABLE",
            "SMART_ROUTER_MONTHLY_BUDGET_USD",
            "SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST",
            "SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST",
            "BARCODE_UPSTREAM_TIMEOUT_SECONDS",
            "BARCODE_UPSTREAM_RETRY_COUNT",
            "BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS",
        )

        for required_key in required_keys:
            self.assertIn(f"- key: {required_key}", render_blueprint)

    def test_render_blueprint_aligns_barcode_upstream_policy_with_phase4_defaults(self):
        render_blueprint = RENDER_BLUEPRINT_PATH.read_text(encoding="utf-8")

        self.assertIn('- key: BARCODE_UPSTREAM_TIMEOUT_SECONDS\n        value: "15"', render_blueprint)
        self.assertIn('- key: BARCODE_UPSTREAM_RETRY_COUNT\n        value: "3"', render_blueprint)
        self.assertIn('- key: BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS\n        value: "1.0"', render_blueprint)

    def test_render_blueprint_aligns_label_cost_policy_defaults(self):
        render_blueprint = RENDER_BLUEPRINT_PATH.read_text(encoding="utf-8")

        self.assertIn("- key: GEMINI_MODEL_NAME\n        value: gemini-2.0-flash", render_blueprint)
        self.assertIn("- key: GEMINI_LABEL_PRIMARY_MODEL_NAME\n        value: gemini-2.5-flash", render_blueprint)
        self.assertIn("- key: GEMINI_LABEL_FALLBACK_MODEL_NAME\n        value: gemini-2.5-pro", render_blueprint)
        self.assertIn('- key: GEMINI_LABEL_PRO_FALLBACK_ENABLED\n        value: "0"', render_blueprint)
        self.assertIn('- key: GEMINI_LABEL_ALLOW_PRO_PRIMARY\n        value: "0"', render_blueprint)
        self.assertIn("- key: LABEL_COST_GUARDRAIL_STORAGE_BACKEND\n        value: postgres", render_blueprint)
        self.assertIn("- key: LABEL_COST_GUARDRAIL_TABLE\n        value: label_monthly_usage", render_blueprint)
        self.assertIn('- key: LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK\n        value: "0.05"', render_blueprint)
        self.assertIn('- key: LABEL_ESTIMATED_TOKENS_PER_REQUEST_PRO_FALLBACK\n        value: "2500"', render_blueprint)
        self.assertIn('- key: LABEL_PER_REQUEST_BUDGET_USD\n        value: "0.07"', render_blueprint)
        self.assertIn('- key: COST_GUARDRAIL_RESERVATION_TTL_SECONDS\n        value: "900"', render_blueprint)
        self.assertIn('- key: FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST\n        value: "0.02"', render_blueprint)
        self.assertIn('- key: FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST\n        value: "1500"', render_blueprint)
        self.assertIn('- key: BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST\n        value: "0.003"', render_blueprint)
        self.assertIn('- key: BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST\n        value: "256"', render_blueprint)
        self.assertIn("- key: AI_COST_PRICE_CATALOG_PATH\n        sync: false", render_blueprint)
        self.assertIn('- key: SMART_ROUTER_COST_GUARDRAIL_ENABLED\n        value: "1"', render_blueprint)
        self.assertIn("- key: SMART_ROUTER_COST_GUARDRAIL_STORAGE_BACKEND\n        value: postgres", render_blueprint)
        self.assertIn("- key: SMART_ROUTER_COST_GUARDRAIL_TABLE\n        value: smart_router_monthly_usage", render_blueprint)
        self.assertIn('- key: SMART_ROUTER_MONTHLY_BUDGET_USD\n        value: "2"', render_blueprint)
        self.assertIn('- key: SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST\n        value: "0.003"', render_blueprint)
        self.assertIn('- key: SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST\n        value: "128"', render_blueprint)


if __name__ == "__main__":
    unittest.main()
