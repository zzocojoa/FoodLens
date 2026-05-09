import io
import os
import unittest

from fastapi.testclient import TestClient
from PIL import Image


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend.server import app  # noqa: E402


def _build_image_bytes() -> bytes:
    img = Image.new("RGB", (64, 64), (200, 200, 200))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


class _ObservabilityAnalyst:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.label_model_name = "gemini-2.5-flash"

    def analyze_food_json(self, *_args, **_kwargs):
        if self.fail:
            raise RuntimeError("forced analyze failure")
        return {
            "foodName": "Toast",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "used_model": "gemini-2.5-pro",
            "prompt_version": "food-v3.3.1-schema-compact",
            "_food_usage_metadata": {
                "prompt_token_count": 31,
                "candidates_token_count": 17,
                "thoughts_token_count": 5,
                "total_token_count": 53,
            },
        }

    def analyze_barcode_ingredients(self, *_args, **_kwargs):
        return {
            "safetyStatus": "CAUTION",
            "coachMessage": "contains milk",
            "ingredients": [{"name": "milk", "isAllergen": True, "riskReason": "Contains milk"}],
            "used_model": "gemini-2.0-flash",
            "prompt_version": "barcode-v1.1-allergen-compact",
        }


class _ObservabilityBarcodeService:
    async def get_product_info(self, barcode: str):
        return {
            "food_name": f"Product-{barcode}",
            "ingredients": ["milk"],
        }

    def get_last_upstream_failure(self):
        return None


class _RateLimitedBarcodeService:
    async def get_product_info(self, _barcode: str):
        return None

    def get_last_upstream_failure(self):
        return {
            "source": "datago",
            "kind": "http_429",
            "message": "status=429",
        }


class AnalysisObservabilityTests(unittest.TestCase):
    def test_analyze_response_contains_request_id(self):
        with TestClient(app) as client:
            app.state.analyst = _ObservabilityAnalyst()
            app.state.barcode_service = _ObservabilityBarcodeService()
            app.state.smart_router = object()
            response = client.post(
                "/analyze",
                files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
                headers={"X-Request-Id": "req-observe-analyze"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["request_id"], "req-observe-analyze")
        self.assertEqual(payload["prompt_version"], "food-v3.3.1-schema-compact")
        self.assertGreaterEqual(payload["latency_ms"]["total"], 0)

    def test_analyze_logs_provider_token_breakdown(self):
        with self.assertLogs("foodlens.api", level="INFO") as captured:
            with TestClient(app) as client:
                app.state.analyst = _ObservabilityAnalyst()
                app.state.barcode_service = _ObservabilityBarcodeService()
                app.state.smart_router = object()
                response = client.post(
                    "/analyze",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={"allergy_info": "None", "locale": "ko-KR"},
                    headers={"X-Request-Id": "req-observe-token-breakdown"},
                )

        self.assertEqual(response.status_code, 200)
        summary_messages = [
            record.getMessage()
            for record in captured.records
            if record.getMessage().startswith("[Server] Food observability summary")
        ]
        self.assertTrue(summary_messages)
        self.assertIn("usage_prompt_tokens=31", summary_messages[-1])
        self.assertIn("usage_candidate_tokens=17", summary_messages[-1])
        self.assertIn("usage_total_tokens=53", summary_messages[-1])
        self.assertIn("usage_thought_tokens=5", summary_messages[-1])

    def test_analyze_error_uses_supplied_request_id(self):
        with TestClient(app) as client:
            app.state.analyst = _ObservabilityAnalyst(fail=True)
            app.state.barcode_service = _ObservabilityBarcodeService()
            app.state.smart_router = object()
            response = client.post(
                "/analyze",
                files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
                headers={"X-Request-Id": "req-observe-fail"},
            )

        self.assertEqual(response.status_code, 500)
        self.assertIn("request_id=req-observe-fail", response.json()["detail"])

    def test_lookup_barcode_response_contains_request_id(self):
        with TestClient(app) as client:
            app.state.analyst = _ObservabilityAnalyst()
            app.state.barcode_service = _ObservabilityBarcodeService()
            app.state.smart_router = object()
            response = client.post(
                "/lookup/barcode",
                data={"barcode": "12345", "allergy_info": "None", "locale": "en-US"},
                headers={"X-Request-Id": "req-observe-barcode"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["request_id"], "req-observe-barcode")
        self.assertTrue(payload["found"])
        self.assertGreaterEqual(payload["latency_ms"]["total"], 0)
        self.assertGreaterEqual(payload["latency_ms"]["source_lookup"], 0)

    def test_lookup_barcode_response_contains_analysis_metadata_when_allergy_analysis_runs(self):
        with TestClient(app) as client:
            app.state.analyst = _ObservabilityAnalyst()
            app.state.barcode_service = _ObservabilityBarcodeService()
            app.state.smart_router = object()
            response = client.post(
                "/lookup/barcode",
                data={"barcode": "12345", "allergy_info": "milk", "locale": "en-US"},
                headers={"X-Request-Id": "req-observe-barcode-metadata"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["request_id"], "req-observe-barcode-metadata")
        self.assertEqual(payload["used_model"], "gemini-2.0-flash")
        self.assertEqual(payload["prompt_version"], "barcode-v1.1-allergen-compact")
        self.assertGreaterEqual(payload["latency_ms"]["allergen_analysis"], 0)

    def test_lookup_barcode_returns_standard_429_when_upstream_is_rate_limited(self):
        with TestClient(app) as client:
            app.state.analyst = _ObservabilityAnalyst()
            app.state.barcode_service = _RateLimitedBarcodeService()
            app.state.smart_router = object()
            response = client.post(
                "/lookup/barcode",
                data={"barcode": "12345", "allergy_info": "None", "locale": "en-US"},
                headers={"X-Request-Id": "req-observe-barcode-429"},
            )

        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers.get("Retry-After"), "15")
        payload = response.json()
        self.assertEqual(payload["detail"]["code"], "UPSTREAM_RATE_LIMITED")
        self.assertEqual(payload["detail"]["request_id"], "req-observe-barcode-429")


if __name__ == "__main__":
    unittest.main()
