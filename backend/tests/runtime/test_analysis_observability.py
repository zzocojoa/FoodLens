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
        self.label_model_name = "gemini-2.5-pro"

    def analyze_food_json(self, *_args, **_kwargs):
        if self.fail:
            raise RuntimeError("forced analyze failure")
        return {
            "foodName": "Toast",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "used_model": "gemini-2.5-pro",
            "prompt_version": "food-v3.2-context-engineered",
        }


class _ObservabilityBarcodeService:
    async def get_product_info(self, barcode: str):
        return {
            "food_name": f"Product-{barcode}",
            "ingredients": [],
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
        self.assertEqual(payload["prompt_version"], "food-v3.2-context-engineered")

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


if __name__ == "__main__":
    unittest.main()
