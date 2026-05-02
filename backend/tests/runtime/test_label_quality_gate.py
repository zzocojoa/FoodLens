import asyncio
import io
import os
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient

from backend.modules.analyst_runtime.router import SmartRouter
from backend.modules.ops.cost_guardrail import CostGuardrailService, InMemoryMonthlyUsageStorage
from backend.modules.quality.label_quality_gate import evaluate_label_image_quality


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend.server import app  # noqa: E402


class _SpyAnalyst:
    def __init__(self):
        self.label_model_name = "gemini-2.5-pro"
        self.called = False

    def analyze_label_json(self, *_args, **_kwargs):
        self.called = True
        raise AssertionError("analyze_label_json should not be called when quality gate fails")


class _SmartLabelRouter:
    async def route_analysis(
        self,
        *,
        image,
        allergy_info,
        iso_country_code,
        locale,
        label_analysis_handler=None,
        food_analysis_handler=None,
        classification_usage_recorder=None,
    ):
        del food_analysis_handler, classification_usage_recorder
        if label_analysis_handler is None:
            raise AssertionError("smart label route must receive label_analysis_handler")
        result = await label_analysis_handler(image, allergy_info, iso_country_code, locale)
        result["router_category"] = "NUTRITION_LABEL"
        return result


class _TrackingCostGuardrailService(CostGuardrailService):
    def __init__(self, storage: InMemoryMonthlyUsageStorage, *, monthly_budget_usd: float) -> None:
        super().__init__(storage, monthly_budget_usd=monthly_budget_usd)
        self.reserve_calls = 0

    def reserve(self, *, cost_usd: float, tokens: int, now=None):
        self.reserve_calls += 1
        return super().reserve(cost_usd=cost_usd, tokens=tokens, now=now)


def _build_low_quality_bytes() -> bytes:
    img = Image.new("RGB", (256, 256), (255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _build_high_quality_image() -> Image.Image:
    img = Image.new("RGB", (600, 900), (230, 230, 230))
    draw = ImageDraw.Draw(img)
    for idx in range(20):
        y = 30 + idx * 40
        draw.text((30, y), f"INGREDIENTS LINE {idx:02d}", fill=(20, 20, 20))
    for x in range(0, 600, 24):
        draw.line((x, 0, x, 899), fill=(40, 40, 40), width=1)
    return img


class LabelQualityGateTests(unittest.TestCase):
    def test_quality_gate_rejects_blank_image(self):
        blank = Image.new("RGB", (300, 300), (255, 255, 255))
        result = evaluate_label_image_quality(blank)
        self.assertFalse(result.passed)
        self.assertGreaterEqual(len(result.failed_checks), 1)

    def test_quality_gate_accepts_label_like_image(self):
        label_like = _build_high_quality_image()
        result = evaluate_label_image_quality(label_like)
        self.assertTrue(result.passed)
        self.assertEqual(result.failed_checks, [])

    def test_endpoint_skips_gemini_when_quality_fails(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)
        with (
            patch.dict(os.environ, {"LABEL_COST_GUARDRAIL_ENABLED": "1"}, clear=False),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_low_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(spy.called)
        self.assertEqual(service.reserve_calls, 0)
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)
        self.assertIsNotNone(payload.get("request_id"))
        self.assertEqual(payload.get("prompt_version"), "label-v1.2-2pass-locale-country")
        self.assertEqual(payload.get("used_model"), "gemini-2.5-pro")
        self.assertEqual(payload.get("safetyStatus"), "CAUTION")

    def test_smart_label_route_uses_quality_gate_before_gemini(self):
        spy = _SpyAnalyst()
        with TestClient(app) as client:
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = _SmartLabelRouter()
            response = client.post(
                "/analyze/smart",
                files={"file": ("label.jpg", _build_low_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(spy.called)
        self.assertEqual(payload.get("router_category"), "NUTRITION_LABEL")
        self.assertEqual(payload.get("prompt_version"), "label-v1.2-2pass-locale-country")
        self.assertEqual(payload.get("safetyStatus"), "CAUTION")

    def test_direct_smart_label_route_without_handler_does_not_call_gemini(self):
        spy = _SpyAnalyst()
        router = object.__new__(SmartRouter)
        router.analyst = spy

        async def _classify_image(_image):
            return "NUTRITION_LABEL", 0.99

        router.classify_image = _classify_image
        result = asyncio.run(
            router.route_analysis(
                image=Image.new("RGB", (32, 32), (255, 255, 255)),
                allergy_info="None",
                iso_country_code="US",
                locale="en-US",
            )
        )

        self.assertFalse(spy.called)
        self.assertEqual(result.get("router_category"), "NUTRITION_LABEL")
        self.assertEqual(result.get("safetyStatus"), "CAUTION")
        self.assertEqual(result.get("foodName"), "Analysis error")


if __name__ == "__main__":
    unittest.main()
