import asyncio
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
from backend.modules.ops.cost_guardrail import (
    CostGuardrailAction,
    CostGuardrailService,
    InMemoryMonthlyUsageStorage,
    PostgresMonthlyUsageStorage,
)
from backend.modules.ops.rollout_control import KpiThresholds


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend import server as server_module  # noqa: E402
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


def _collect_internal_label_keys(value: Any) -> list[str]:
    if isinstance(value, dict):
        keys = [str(key) for key in value.keys() if str(key).startswith("_label_")]
        for item in value.values():
            keys.extend(_collect_internal_label_keys(item))
        return keys
    if isinstance(value, list):
        keys: list[str] = []
        for item in value:
            keys.extend(_collect_internal_label_keys(item))
        return keys
    return []


def _collect_internal_food_keys(value: Any) -> list[str]:
    if isinstance(value, dict):
        keys = [str(key) for key in value.keys() if str(key).startswith("_food_")]
        for item in value.values():
            keys.extend(_collect_internal_food_keys(item))
        return keys
    if isinstance(value, list):
        keys: list[str] = []
        for item in value:
            keys.extend(_collect_internal_food_keys(item))
        return keys
    return []


class _FoodUsageSpyAnalyst:
    def __init__(self) -> None:
        self.model_name = "gemini-2.5-flash"
        self.called = False

    def analyze_food_json(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self.called = True
        return {
            "foodName": "Toast",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "prompt_version": "food-v3.2-context-engineered",
            "used_model": self.model_name,
            "_food_primary_model": self.model_name,
            "_food_used_model": self.model_name,
            "_food_fallback_used": False,
            "_food_fallback_reason": None,
            "_food_finish_reason": 1,
            "_food_thinking_budget": 0,
            "_food_truncated": False,
            "_food_chargeable": True,
            "_food_usage_metadata": {
                "prompt_token_count": 120,
                "candidates_token_count": 80,
                "thoughts_token_count": 0,
                "total_token_count": 200,
            },
        }

class _SpyAnalyst:
    def __init__(self):
        self.label_model_name = "gemini-2.5-flash"
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


class _RaisingLabelAnalyst:
    def __init__(self) -> None:
        self.label_model_name = "gemini-2.5-flash"
        self.label_fallback_enabled = False
        self.label_fallback_model_name = "gemini-2.5-flash-lite"

    def analyze_label_json(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        raise RuntimeError("label provider failed")


class _UsageSpyAnalyst:
    def __init__(self) -> None:
        self.label_model_name = "gemini-2.5-flash"
        self.called = False

    def analyze_label_json(self, *_args: Any, **_kwargs: Any) -> dict[str, Any]:
        self.called = True
        return {
            "foodName": "Cereal",
            "safetyStatus": "CAUTION",
            "ingredients": [{"name": "설탕", "isAllergen": False}],
            "nutrition": {"calories": 100},
            "raw_result": "ok",
            "prompt_version": "label-v1.2-2pass-locale-country",
            "used_model": "gemini-2.5-pro",
            "_label_timings": {"extract_ms": 2, "assess_ms": 3},
            "_label_primary_model": "gemini-2.5-flash",
            "_label_used_model": "gemini-2.5-pro",
            "_label_fallback_used": True,
            "_label_fallback_reason": "extract_max_tokens",
            "_label_extract_finish_reason": 2,
            "_label_assess_finish_reason": 1,
            "_label_truncated": True,
            "_label_partial": True,
            "_label_usage": {
                "extract": {
                    "prompt_token_count": 70,
                    "candidates_token_count": 30,
                    "thoughts_token_count": 11,
                    "total_token_count": 111,
                },
                "assess": {
                    "prompt_token_count": 10,
                    "candidates_token_count": 12,
                    "total_token_count": 22,
                },
            },
        }


class _BarcodeAllergenEmptyAnalyst:
    def __init__(self) -> None:
        self.label_model_name = "gemini-2.5-flash"
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
        food_analysis_runner: Any | None = None,
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

    def test_reserve_is_idempotent_and_counts_active_reservations(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        first = service.reserve(reservation_key="req-1", projected_cost_usd=0.60)
        duplicate = service.reserve(reservation_key="req-1", projected_cost_usd=0.60)
        blocked = service.reserve(reservation_key="req-2", projected_cost_usd=0.50)

        self.assertTrue(first.accepted)
        self.assertTrue(duplicate.accepted)
        self.assertFalse(blocked.accepted)
        usage = storage.get(first.decision.period_key)
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.active_reserved_cost_usd, 0.60)

    def test_reconcile_confirms_provider_usage_and_releases_reservation(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        reservation = service.reserve(reservation_key="req-1", projected_cost_usd=0.60)
        usage = service.reconcile(
            reservation_key="req-1",
            cost_usd=0.42,
            tokens=123,
            provider_total_tokens=140,
            provider_thought_tokens=17,
            fallback_used=True,
            truncated=True,
        )

        self.assertTrue(reservation.accepted)
        self.assertEqual(usage.total_cost_usd, 0.42)
        self.assertEqual(usage.active_reserved_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 123)
        self.assertEqual(usage.provider_reported_tokens, 140)
        self.assertEqual(usage.provider_reported_thought_tokens, 17)
        self.assertEqual(usage.fallback_count, 1)
        self.assertEqual(usage.truncated_count, 1)

    def test_reconcile_non_chargeable_releases_without_confirmed_cost(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        service.reserve(reservation_key="req-1", projected_cost_usd=0.60)
        usage = service.reconcile(
            reservation_key="req-1",
            cost_usd=0.60,
            tokens=123,
            chargeable=False,
        )

        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.active_reserved_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)
        self.assertEqual(usage.request_count, 0)

    def test_duplicate_released_reservation_returns_fallback_decision(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        service.reserve(reservation_key="req-1", projected_cost_usd=0.60)
        service.reconcile(
            reservation_key="req-1",
            cost_usd=0.0,
            tokens=0,
            chargeable=False,
        )
        duplicate = service.reserve(reservation_key="req-1", projected_cost_usd=0.60)

        usage = storage.get(duplicate.decision.period_key)
        self.assertFalse(duplicate.accepted)
        self.assertEqual(duplicate.decision.action, CostGuardrailAction.FALLBACK)
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.active_reserved_cost_usd, 0.0)
        self.assertEqual(usage.request_count, 0)

    def test_postgres_table_name_sanitizer_falls_back_for_invalid_identifiers(self):
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://example",
            usage_table_name="123monthly_usage",
            reservation_table_name="monthly-usage-reservations",
        )

        self.assertEqual(storage.usage_table_name, "monthly_usage")
        self.assertEqual(storage.reservation_table_name, "monthly_usage_reservations")

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

    def test_analyze_food_records_provider_usage_without_internal_food_fields(self):
        analyst = _FoodUsageSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "AI_COST_GUARDRAIL_ENABLED": "1",
                    "FOOD_ESTIMATED_COST_USD_PER_REQUEST": "0.006",
                    "FOOD_ESTIMATED_TOKENS_PER_REQUEST": "2500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.analysis_cost_guardrail = service
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        usage = storage.get(service._period_key())
        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(analyst.called)
        self.assertEqual(_collect_internal_food_keys(payload), [])
        self.assertEqual(payload["analysis_diagnostics"]["usage_source"], "provider_usage_metadata")
        self.assertAlmostEqual(usage.total_cost_usd, 0.006)
        self.assertEqual(usage.total_tokens, 200)
        self.assertEqual(usage.provider_reported_tokens, 200)

    def test_analyze_food_budget_fallback_skips_model_call(self):
        analyst = _FoodUsageSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "AI_COST_GUARDRAIL_ENABLED": "1",
                    "FOOD_ESTIMATED_COST_USD_PER_REQUEST": "0.006",
                    "FOOD_ESTIMATED_TOKENS_PER_REQUEST": "2500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.analysis_cost_guardrail = service
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        payload = response.json()
        usage = storage.get(service._period_key())
        self.assertEqual(response.status_code, 200)
        self.assertFalse(analyst.called)
        self.assertEqual(payload.get("safetyStatus"), "CAUTION")
        self.assertEqual(payload["analysis_diagnostics"]["fallback_reason"], "budget_fallback")
        self.assertEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)

    def test_label_endpoint_releases_reservation_when_provider_raises(self):
        analyst = _RaisingLabelAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

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
            TestClient(app, raise_server_exceptions=False) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
                headers={"X-Request-Id": "req-label-provider-raises"},
            )

        usage = storage.get(service._period_key())
        self.assertEqual(response.status_code, 500)
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.active_reserved_cost_usd, 0.0)
        self.assertEqual(usage.request_count, 0)

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
        self.assertAlmostEqual(usage.total_cost_usd, 0.021)
        self.assertEqual(usage.total_tokens, 1800)

    def test_smart_label_route_records_provider_usage_without_public_label_fields(self):
        spy = _UsageSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        with (
            patch.dict(
                os.environ,
                {
                    **_TEST_RUNTIME_ENV,
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_FALLBACK": "0.12",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                },
                clear=False,
            ),
            patch.object(server_module.logger, "info") as mock_logger_info,
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
        payload = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(spy.called)
        self.assertEqual(_collect_internal_label_keys(payload), [])
        self.assertEqual(payload["label_diagnostics"]["fallback_reason"], "extract_max_tokens")
        self.assertTrue(payload["label_diagnostics"]["fallback_used"])
        self.assertTrue(payload["label_diagnostics"]["truncated"])
        self.assertEqual(payload["label_diagnostics"]["usage_source"], "provider_usage_metadata")
        self.assertAlmostEqual(usage.total_cost_usd, 0.121)
        self.assertEqual(usage.total_tokens, 433)
        self.assertEqual(usage.provider_reported_tokens, 133)
        self.assertEqual(usage.provider_reported_thought_tokens, 11)
        self.assertEqual(usage.request_count, 2)
        self.assertEqual(usage.fallback_count, 1)
        self.assertEqual(usage.truncated_count, 1)

        observability_calls = [
            call
            for call in mock_logger_info.call_args_list
            if call.args and call.args[0] == "[Server] Label observability"
        ]
        self.assertEqual(len(observability_calls), 1)
        observability_extra = observability_calls[0].kwargs["extra"]
        self.assertEqual(observability_extra["label_usage_source"], "provider_usage_metadata")
        self.assertEqual(observability_extra["label_usage_total_tokens"], 133)
        self.assertEqual(observability_extra["label_usage_thought_tokens"], 11)
        self.assertEqual(observability_extra["label_fallback_reason"], "extract_max_tokens")

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

    def test_smart_router_requires_label_runner_for_label_route(self):
        spy = _SpyAnalyst()
        smart_router = SmartRouter.__new__(SmartRouter)
        smart_router.analyst = spy
        smart_router.router_model = SimpleNamespace(
            generate_content=lambda *_args, **_kwargs: SimpleNamespace(
                text='{"category":"NUTRITION_LABEL","confidence":0.99}'
            )
        )

        result = asyncio.run(
            smart_router.route_analysis(
                Image.new("RGB", (4, 4)),
                allergy_info="None",
                iso_country_code="US",
                locale="en-US",
            )
        )

        self.assertFalse(spy.called)
        self.assertEqual(result["safetyStatus"], "CAUTION")
        self.assertIn("label_analysis_runner", result["error"])


if __name__ == "__main__":
    unittest.main()
