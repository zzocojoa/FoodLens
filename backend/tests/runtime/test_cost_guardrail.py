import io
import os
import unittest
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.modules.analyst_runtime.router import SmartRouter
from backend.modules.contracts.barcode_response import BarcodeLookupResponseContract
from backend.modules.ops.cost_guardrail import CostGuardrailAction, CostGuardrailService, InMemoryMonthlyUsageStorage
from backend.modules.ops.rollout_control import KpiThresholds


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend.server import app  # noqa: E402


_TEST_RUNTIME_ENV: dict[str, str] = {
    "AUTH_STATE_BACKEND": "memory",
    "MEDIA_STORAGE_BACKEND": "local",
}


def _build_high_quality_bytes() -> bytes:
    img = Image.new("RGB", (600, 900), (230, 230, 230))
    draw = ImageDraw.Draw(img)
    for idx in range(20):
        y = 30 + idx * 40
        draw.text((30, y), f"INGREDIENTS LINE {idx:02d}", fill=(20, 20, 20))
    for x in range(0, 600, 24):
        draw.line((x, 0, x, 899), fill=(40, 40, 40), width=1)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


class _SpyAnalyst:
    def __init__(self):
        self.label_model_name = "gemini-2.5-pro"
        self.called = False
        self.last_assess_enabled = None

    def analyze_label_json(self, *_args, **_kwargs):
        self.called = True
        self.last_assess_enabled = _args[4] if len(_args) >= 5 else None
        return {
            "foodName": "Cereal",
            "safetyStatus": "SAFE",
            "ingredients": [{"name": "설탕", "isAllergen": False}],
            "nutrition": {"calories": 100},
            "raw_result": "ok",
            "prompt_version": "label-v1.2-2pass-locale-country",
            "used_model": self.label_model_name,
            "_label_timings": {"extract_ms": 1, "assess_ms": 1},
        }


class _BarcodeAllergenEmptyAnalyst:
    def __init__(self) -> None:
        self.label_model_name = "gemini-2.5-pro"
        self.called_with_ingredients: list[str] | None = None

    def analyze_barcode_ingredients(
        self,
        ingredients: list[str],
        allergy_info: str,
        locale: str | None,
    ) -> dict[str, Any]:
        self.called_with_ingredients = list(ingredients)
        return {
            "safetyStatus": "CAUTION",
            "coachMessage": f"contains {allergy_info}",
            "ingredients": [],
            "used_model": "gemini-2.0-flash",
            "prompt_version": "barcode-v1.0-allergen-analysis",
            "locale": locale,
        }


class _BarcodeIngredientService:
    def __init__(self, ingredients: list[str]) -> None:
        self.ingredients = list(ingredients)

    async def get_product_info(self, barcode: str) -> dict[str, Any]:
        return {
            "food_name": f"Product-{barcode}",
            "ingredients": list(self.ingredients),
        }

    def get_last_upstream_failure(self) -> None:
        return None


class _SmartLabelRouter:
    async def route_analysis(
        self,
        *,
        image: Any,
        allergy_info: str,
        iso_country_code: str,
        locale: str | None,
        request_id: str,
        total_started_at: float,
        preprocess_elapsed_ms: int,
        label_analysis_runner: Any,
    ) -> dict[str, Any]:
        result = await label_analysis_runner(
            image,
            allergy_info,
            iso_country_code,
            locale,
            request_id,
            total_started_at,
            preprocess_elapsed_ms,
        )
        result["router_category"] = "NUTRITION_LABEL"
        return result


class CostGuardrailTests(unittest.TestCase):
    def test_threshold_actions_70_85_100(self):
        service = CostGuardrailService(InMemoryMonthlyUsageStorage(), monthly_budget_usd=1.0)

        service.record(cost_usd=0.69, tokens=100)
        decision_warn = service.evaluate(projected_cost_usd=0.02)
        self.assertEqual(decision_warn.action, CostGuardrailAction.WARN)

        service.record(cost_usd=0.14, tokens=100)
        decision_degrade = service.evaluate(projected_cost_usd=0.02)
        self.assertEqual(decision_degrade.action, CostGuardrailAction.DEGRADE)

        service.record(cost_usd=0.15, tokens=100)
        decision_fallback = service.evaluate(projected_cost_usd=0.02)
        self.assertEqual(decision_fallback.action, CostGuardrailAction.FALLBACK)

    def test_label_endpoint_degrades_on_85_percent(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=0.85, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(spy.called)
        self.assertFalse(spy.last_assess_enabled)

    def test_label_endpoint_fallback_on_100_percent_without_gemini(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(spy.called)
        self.assertEqual(payload.get("safetyStatus"), "CAUTION")
        self.assertIn("예산 한도", payload.get("raw_result", ""))
        self.assertEqual(payload.get("prompt_version"), "label-v1.2-2pass-locale-country")

    def test_barcode_allergen_empty_ingredients_preserves_source_ingredients_without_label_cost(self):
        analyst = _BarcodeAllergenEmptyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = _BarcodeIngredientService(["milk", "sugar"])
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/lookup/barcode",
                data={"barcode": "12345", "allergy_info": "milk", "locale": "en-US"},
                headers={"X-Request-Id": "req-barcode-empty-ingredients"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        BarcodeLookupResponseContract.model_validate(payload)
        self.assertTrue(payload["found"])
        self.assertEqual(payload["request_id"], "req-barcode-empty-ingredients")
        self.assertEqual(payload["used_model"], "gemini-2.0-flash")
        self.assertEqual(payload["prompt_version"], "barcode-v1.0-allergen-analysis")
        self.assertEqual(payload["data"]["safetyStatus"], "CAUTION")
        self.assertEqual(payload["data"]["coachMessage"], "contains milk")
        self.assertEqual(payload["data"]["ingredients"], ["milk", "sugar"])
        self.assertEqual(analyst.called_with_ingredients, ["milk", "sugar"])

        usage = storage.get(service._period_key())
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)

    def test_smart_label_route_records_chargeable_usage_once(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = _SmartLabelRouter()
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            response = client.post(
                "/analyze/smart",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        usage = storage.get(service._period_key())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(spy.called)
        self.assertAlmostEqual(usage.total_cost_usd, 0.02)
        self.assertEqual(usage.total_tokens, 1500)

    def test_smart_label_route_budget_fallback_skips_model_call(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = _SmartLabelRouter()
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            response = client.post(
                "/analyze/smart",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        usage = storage.get(service._period_key())
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(spy.called)
        self.assertEqual(payload.get("safetyStatus"), "CAUTION")
        self.assertIn("예산 한도", payload.get("raw_result", ""))
        self.assertEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)

    def test_real_smart_router_label_branch_uses_cost_gate(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)
        smart_router = SmartRouter.__new__(SmartRouter)
        smart_router.analyst = spy
        smart_router.router_model = SimpleNamespace(
            generate_content=lambda *_args, **_kwargs: SimpleNamespace(
                text='{"category":"NUTRITION_LABEL","confidence":0.99}'
            )
        )

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = smart_router
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            response = client.post(
                "/analyze/smart",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        usage = storage.get(service._period_key())
        self.assertEqual(response.status_code, 200)
        self.assertFalse(spy.called)
        self.assertEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)


if __name__ == "__main__":
    unittest.main()
