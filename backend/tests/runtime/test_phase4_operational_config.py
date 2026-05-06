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
            "GEMINI_LABEL_FALLBACK_ON_PARSE_ERROR",
            "GEMINI_LABEL_FALLBACK_ON_MAX_TOKENS",
            "LABEL_COST_GUARDRAIL_ENABLED",
            "LABEL_COST_GUARDRAIL_STORAGE_BACKEND",
            "LABEL_COST_GUARDRAIL_USAGE_TABLE",
            "LABEL_COST_GUARDRAIL_RESERVATION_TABLE",
            "LABEL_MONTHLY_BUDGET_USD",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_FALLBACK",
            "LABEL_ESTIMATED_TOKENS_PER_REQUEST",
            "LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE",
            "LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE",
            "LABEL_ROLLOUT_PERCENTAGE",
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


if __name__ == "__main__":
    unittest.main()
