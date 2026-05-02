import io
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import ModuleType
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

import backend.modules.ops.cost_guardrail as cost_guardrail_module
from backend.modules.ops.cost_guardrail import (
    CostGuardrailAction,
    CostGuardrailService,
    CostGuardrailStoreError,
    InMemoryMonthlyUsageStorage,
    MonthlyUsage,
    PostgresMonthlyUsageStorage,
)
from backend.modules.ops.price_catalog import (
    PriceCatalogError,
    estimate_usage_cost_from_catalog,
    load_price_catalog,
)


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
from backend.server import (  # noqa: E402
    app,
    _build_label_cost_guardrail_storage,
    _build_smart_router_cost_guardrail_storage,
)

COST_GUARDRAIL_POSTGRES_SMOKE_SCRIPT_PATH: Path = (
    Path(__file__).resolve().parents[3] / "backend" / "scripts" / "cost_guardrail_postgres_smoke.py"
)
AI_PRICE_CATALOG_PATH: Path = (
    Path(__file__).resolve().parents[3] / "backend" / "config" / "ai-price-catalog.json"
)


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


def _load_cost_guardrail_postgres_smoke_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "cost_guardrail_postgres_smoke",
        COST_GUARDRAIL_POSTGRES_SMOKE_SCRIPT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cost guardrail postgres smoke module is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


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


class _ProFallbackSpyAnalyst(_SpyAnalyst):
    def __init__(self):
        super().__init__()
        self.label_pro_fallback_enabled = True
        self.label_fallback_model_name = "gemini-2.5-pro"

    def analyze_label_json(self, *_args, **_kwargs):
        result = super().analyze_label_json(*_args, **_kwargs)
        result["used_model"] = "gemini-2.5-pro"
        result["_label_pro_fallback_used"] = True
        return result


class _UsageMetadataSpyAnalyst(_SpyAnalyst):
    def analyze_label_json(self, *_args, **_kwargs):
        result = super().analyze_label_json(*_args, **_kwargs)
        result["_label_usage"] = [
            {
                "provider": "google_vertex_ai",
                "route": "label_extract",
                "model": self.label_model_name,
                "prompt_tokens": 400,
                "completion_tokens": 200,
                "total_tokens": 600,
                "source": "provider_usage_metadata",
            }
        ]
        return result


class _FailingAnalyst(_SpyAnalyst):
    def analyze_label_json(self, *_args, **_kwargs):
        self.called = True
        raise RuntimeError("gemini failed for reservation release test")


class _LabelSmartRouter:
    def __init__(self):
        self.called = False

    async def route_analysis(
        self,
        image,
        allergy_info,
        iso_country_code,
        locale,
        label_analysis_handler,
        food_analysis_handler=None,
        classification_usage_recorder=None,
    ):
        del food_analysis_handler
        self.called = True
        if classification_usage_recorder is not None:
            classification_usage_recorder()
        result = await label_analysis_handler(image, allergy_info, iso_country_code, locale)
        result["router_category"] = "NUTRITION_LABEL"
        return result


class _FoodSmartRouter:
    def __init__(self):
        self.called = False

    async def route_analysis(
        self,
        *,
        image,
        allergy_info,
        iso_country_code,
        locale,
        label_analysis_handler,
        food_analysis_handler=None,
        classification_usage_recorder=None,
    ):
        del image, allergy_info, iso_country_code, locale, label_analysis_handler, food_analysis_handler
        self.called = True
        if classification_usage_recorder is not None:
            classification_usage_recorder()
        return {
            "foodName": "Rice Bowl",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "raw_result": "ok",
            "used_model": "gemini-2.0-flash",
            "prompt_version": "food-v3.2-context-engineered",
            "router_category": "REAL_FOOD",
        }


class _DelegatingFoodSmartRouter:
    def __init__(self):
        self.called = False

    async def route_analysis(
        self,
        *,
        image,
        allergy_info,
        iso_country_code,
        locale,
        label_analysis_handler,
        food_analysis_handler=None,
        classification_usage_recorder=None,
    ):
        del label_analysis_handler
        self.called = True
        if classification_usage_recorder is not None:
            classification_usage_recorder()
        if food_analysis_handler is None:
            raise AssertionError("smart food route must receive food_analysis_handler")
        result = await food_analysis_handler(image, allergy_info, iso_country_code, locale)
        result["router_category"] = "REAL_FOOD"
        return result


class _UsageMetadataFoodSmartRouter(_FoodSmartRouter):
    async def route_analysis(
        self,
        *,
        image,
        allergy_info,
        iso_country_code,
        locale,
        label_analysis_handler,
        food_analysis_handler=None,
        classification_usage_recorder=None,
    ):
        result = await super().route_analysis(
            image=image,
            allergy_info=allergy_info,
            iso_country_code=iso_country_code,
            locale=locale,
            label_analysis_handler=label_analysis_handler,
            food_analysis_handler=food_analysis_handler,
            classification_usage_recorder=classification_usage_recorder,
        )
        result["_router_usage"] = [
            {
                "provider": "google_vertex_ai",
                "route": "smart_router_classify",
                "model": "gemini-2.0-flash",
                "prompt_tokens": 40,
                "completion_tokens": 24,
                "total_tokens": 64,
                "source": "provider_usage_metadata",
            }
        ]
        return result


class _FailingAfterClassificationSmartRouter:
    def __init__(self) -> None:
        self.called = False

    async def route_analysis(
        self,
        *,
        image,
        allergy_info,
        iso_country_code,
        locale,
        label_analysis_handler,
        food_analysis_handler=None,
        classification_usage_recorder=None,
    ):
        del image, allergy_info, iso_country_code, locale, label_analysis_handler, food_analysis_handler
        self.called = True
        if classification_usage_recorder is not None:
            classification_usage_recorder()
        raise RuntimeError("smart router failed after classification")


class _FoodAnalysisSpy:
    def __init__(self) -> None:
        self.model_name = "gemini-2.0-flash"
        self.called = False

    def analyze_food_json(self, *_args: object, **_kwargs: object) -> dict[str, object]:
        self.called = True
        return {
            "foodName": "Rice Bowl",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "raw_result": "ok",
            "used_model": self.model_name,
            "prompt_version": "food-v3.2-context-engineered",
        }


class _FailingFoodAnalysisSpy(_FoodAnalysisSpy):
    def analyze_food_json(self, *_args: object, **_kwargs: object) -> dict[str, object]:
        self.called = True
        raise RuntimeError("gemini failed for food reservation release test")


class _BarcodeAllergenSpy:
    def __init__(self) -> None:
        self.model_name = "gemini-2.0-flash"
        self.called = False

    def analyze_barcode_ingredients(
        self,
        ingredients: list[object],
        allergy_info: str,
        locale: str | None,
    ) -> dict[str, object]:
        del allergy_info, locale
        self.called = True
        return {
            "safetyStatus": "SAFE",
            "coachMessage": "ok",
            "used_model": self.model_name,
            "prompt_version": "barcode-v1.0-allergen-analysis",
            "ingredients": [
                {"name": str(ingredient), "isAllergen": False, "riskReason": ""}
                for ingredient in ingredients
            ],
        }


class _BarcodeServiceSpy:
    def __init__(self) -> None:
        self.called = False

    async def get_product_info(self, barcode: str) -> dict[str, object]:
        self.called = True
        return {
            "food_name": "Snack",
            "ingredients": ["wheat", "sugar"],
            "source": "fixture",
            "raw_data": {"barcode": barcode},
        }


class _RecordingPostgresCursor:
    def __init__(self) -> None:
        self.executed: list[str] = []
        self.params: list[tuple[object, ...] | None] = []
        self.row: tuple[object, ...] | None = ("2026-05", 0.07, 4000)
        self.rows: list[tuple[object, ...] | None] = []

    def execute(self, query: str, params: tuple[object, ...] | None = None) -> None:
        self.executed.append(query)
        self.params.append(params)

    def fetchone(self) -> tuple[object, ...] | None:
        if self.rows:
            return self.rows.pop(0)
        return self.row

    def __enter__(self) -> "_RecordingPostgresCursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class _RecordingPostgresConnection:
    def __init__(self, cursor: _RecordingPostgresCursor) -> None:
        self.cursor_instance = cursor

    def cursor(self) -> _RecordingPostgresCursor:
        return self.cursor_instance

    def __enter__(self) -> "_RecordingPostgresConnection":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class _RecordingPostgresConnect:
    def __init__(self) -> None:
        self.cursor = _RecordingPostgresCursor()
        self.calls: list[tuple[str, dict[str, object]]] = []

    def __call__(self, database_url: str, **kwargs: object) -> _RecordingPostgresConnection:
        self.calls.append((database_url, dict(kwargs)))
        return _RecordingPostgresConnection(self.cursor)


class _FailingMonthlyUsageStorage:
    def get(self, period_key: str) -> MonthlyUsage:
        raise CostGuardrailStoreError(f"storage unavailable for period_key={period_key}")

    def put(self, usage: MonthlyUsage) -> None:
        raise CostGuardrailStoreError(f"storage unavailable for period_key={usage.period_key}")

    def increment(self, *, period_key: str, cost_usd: float, tokens: int) -> MonthlyUsage:
        raise CostGuardrailStoreError(f"storage unavailable for period_key={period_key}")

    def adjust(self, *, period_key: str, cost_delta_usd: float, token_delta: int) -> MonthlyUsage:
        raise CostGuardrailStoreError(f"storage unavailable for period_key={period_key}")

    def reserve(
        self,
        *,
        period_key: str,
        reservation_id: str,
        cost_usd: float,
        tokens: int,
        limit_cost_usd: float,
    ):
        del reservation_id, cost_usd, tokens, limit_cost_usd
        raise CostGuardrailStoreError(f"storage unavailable for period_key={period_key}")

    def release(self, *, reservation_id: str) -> MonthlyUsage:
        raise CostGuardrailStoreError(f"storage unavailable for reservation_id={reservation_id}")

    def release_expired(self, *, period_key: str, older_than: datetime) -> MonthlyUsage:
        del older_than
        raise CostGuardrailStoreError(f"storage unavailable for period_key={period_key}")

    def commit(self, *, reservation_id: str, cost_usd: float, tokens: int) -> MonthlyUsage:
        del cost_usd, tokens
        raise CostGuardrailStoreError(f"storage unavailable for reservation_id={reservation_id}")


class _TrackingCostGuardrailService(CostGuardrailService):
    def __init__(self, storage: InMemoryMonthlyUsageStorage, *, monthly_budget_usd: float) -> None:
        super().__init__(storage, monthly_budget_usd=monthly_budget_usd)
        self.reserve_calls = 0
        self.commit_calls = 0
        self.release_calls = 0

    def reserve(self, *, cost_usd: float, tokens: int, now=None):
        self.reserve_calls += 1
        return super().reserve(cost_usd=cost_usd, tokens=tokens, now=now)

    def commit(self, reservation, *, cost_usd: float, tokens: int):
        self.commit_calls += 1
        return super().commit(reservation, cost_usd=cost_usd, tokens=tokens)

    def release(self, reservation):
        self.release_calls += 1
        return super().release(reservation)


class CostGuardrailTests(unittest.TestCase):
    def test_checked_in_ai_price_catalog_covers_active_vertex_models(self):
        catalog = load_price_catalog(str(AI_PRICE_CATALOG_PATH))
        catalog_keys = {
            (entry.provider, entry.model)
            for entry in catalog.entries
        }

        self.assertEqual(catalog.version, "vertex-ai-gemini-2026-05-03")
        self.assertIn(("google_vertex_ai", "gemini-2.0-flash"), catalog_keys)
        self.assertIn(("google_vertex_ai", "gemini-2.5-flash"), catalog_keys)
        self.assertIn(("google_vertex_ai", "gemini-2.5-pro"), catalog_keys)

    def test_checked_in_ai_price_catalog_estimates_label_flash_usage(self):
        catalog = load_price_catalog(str(AI_PRICE_CATALOG_PATH))
        estimate = estimate_usage_cost_from_catalog(
            usage_records=[
                {
                    "provider": "google_vertex_ai",
                    "model": "gemini-2.5-flash",
                    "prompt_tokens": 1000,
                    "cached_tokens": 200,
                    "completion_tokens": 300,
                    "thoughts_tokens": 50,
                    "total_tokens": 1350,
                }
            ],
            catalog=catalog,
        )

        self.assertIsNotNone(estimate)
        assert estimate is not None
        self.assertAlmostEqual(estimate.cost_usd, 0.001121)
        self.assertEqual(estimate.tokens, 1350)
        self.assertEqual(estimate.source, "price_catalog:vertex-ai-gemini-2026-05-03")

    def test_price_catalog_converts_provider_usage_metadata_to_dollars(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-flash",
                                "input": {
                                    "usd_per_1m_tokens": 2.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "cached_input": {
                                    "usd_per_1m_tokens": 0.5,
                                    "sku": "synthetic-cached-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 8.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "thoughts": {
                                    "usd_per_1m_tokens": 10.0,
                                    "sku": "synthetic-thoughts-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )

            catalog = load_price_catalog(catalog_path)
            estimate = estimate_usage_cost_from_catalog(
                usage_records=[
                    {
                        "provider": "google_vertex_ai",
                        "model": "gemini-2.5-flash",
                        "prompt_tokens": 1000,
                        "cached_tokens": 200,
                        "completion_tokens": 300,
                        "thoughts_tokens": 50,
                        "total_tokens": 1350,
                    }
                ],
                catalog=catalog,
            )

        self.assertIsNotNone(estimate)
        assert estimate is not None
        self.assertAlmostEqual(estimate.cost_usd, 0.0046)
        self.assertEqual(estimate.tokens, 1350)
        self.assertEqual(estimate.source, "price_catalog:unit-test-2026-05-02")

    def test_price_catalog_counts_cached_usage_without_total_tokens(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-flash",
                                "input": {
                                    "usd_per_1m_tokens": 2.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "cached_input": {
                                    "usd_per_1m_tokens": 0.5,
                                    "sku": "synthetic-cached-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 8.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )

            catalog = load_price_catalog(catalog_path)
            estimate = estimate_usage_cost_from_catalog(
                usage_records=[
                    {
                        "provider": "google_vertex_ai",
                        "model": "gemini-2.5-flash",
                        "cached_tokens": 200,
                        "completion_tokens": 300,
                    }
                ],
                catalog=catalog,
            )

        self.assertIsNotNone(estimate)
        assert estimate is not None
        self.assertAlmostEqual(estimate.cost_usd, 0.0025)
        self.assertEqual(estimate.tokens, 500)

    def test_price_catalog_requires_verified_source_metadata(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-flash",
                                "input": {
                                    "usd_per_1m_tokens": 2.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 8.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )

            with self.assertRaises(PriceCatalogError):
                load_price_catalog(catalog_path)

    def test_price_catalog_rejects_zero_rates(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-flash",
                                "input": {
                                    "usd_per_1m_tokens": 0.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 8.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )

            with self.assertRaises(PriceCatalogError):
                load_price_catalog(catalog_path)

    def test_price_catalog_rejects_unofficial_source_url(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-flash",
                                "input": {
                                    "usd_per_1m_tokens": 2.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://pricing.example.test/google-vertex-ai",
                                    "verified_at": "2026-05-02",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 8.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )

            with self.assertRaises(PriceCatalogError):
                load_price_catalog(catalog_path)

    def test_price_catalog_requires_model_entry_for_observed_usage(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-flash",
                                "input": {
                                    "usd_per_1m_tokens": 2.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 8.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )
            catalog = load_price_catalog(catalog_path)

        with self.assertRaises(PriceCatalogError):
            estimate_usage_cost_from_catalog(
                usage_records=[
                    {
                        "provider": "google_vertex_ai",
                        "model": "gemini-2.0-flash",
                        "prompt_tokens": 20,
                        "completion_tokens": 10,
                        "total_tokens": 30,
                    }
                ],
                catalog=catalog,
            )

    def test_price_catalog_requires_provider_model_identity_for_observed_usage(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-flash",
                                "input": {
                                    "usd_per_1m_tokens": 2.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 8.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )
            catalog = load_price_catalog(catalog_path)

        with self.assertRaises(PriceCatalogError):
            estimate_usage_cost_from_catalog(
                usage_records=[
                    {
                        "provider": "google_vertex_ai",
                        "model": "",
                        "prompt_tokens": 20,
                        "completion_tokens": 10,
                    }
                ],
                catalog=catalog,
            )

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

    def test_in_memory_storage_returns_copies(self):
        storage = InMemoryMonthlyUsageStorage()

        stored = storage.increment(period_key="2026-05", cost_usd=0.02, tokens=1500)
        stored.total_cost_usd = 99.0
        stored.total_tokens = 99
        loaded = storage.get("2026-05")

        self.assertAlmostEqual(loaded.total_cost_usd, 0.02)
        self.assertEqual(loaded.total_tokens, 1500)

    def test_cost_guardrail_reserve_commit_adjusts_reserved_estimate(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        reservation = service.reserve(cost_usd=0.07, tokens=4000)
        reserved_usage = storage.get(reservation.period_key)
        committed_usage = service.commit(reservation, cost_usd=0.02, tokens=1500)

        self.assertTrue(reservation.reserved)
        self.assertAlmostEqual(reserved_usage.total_cost_usd, 0.0)
        self.assertEqual(reserved_usage.total_tokens, 0)
        self.assertAlmostEqual(reserved_usage.reserved_cost_usd, 0.07)
        self.assertEqual(reserved_usage.reserved_tokens, 4000)
        self.assertAlmostEqual(committed_usage.total_cost_usd, 0.02)
        self.assertEqual(committed_usage.total_tokens, 1500)
        self.assertAlmostEqual(committed_usage.reserved_cost_usd, 0.0)
        self.assertEqual(committed_usage.reserved_tokens, 0)

    def test_cost_guardrail_release_removes_reserved_estimate(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        reservation = service.reserve(cost_usd=0.02, tokens=1500)
        released_usage = service.release(reservation)

        self.assertTrue(reservation.reserved)
        self.assertAlmostEqual(released_usage.total_cost_usd, 0.0)
        self.assertEqual(released_usage.total_tokens, 0)
        self.assertAlmostEqual(released_usage.reserved_cost_usd, 0.0)
        self.assertEqual(released_usage.reserved_tokens, 0)

    def test_cost_guardrail_releases_expired_reservation_before_new_reserve(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0, reservation_ttl_seconds=1)

        reservation = service.reserve(cost_usd=0.7, tokens=1000)
        blocked_reservation = service.reserve(
            cost_usd=0.4,
            tokens=1000,
            now=datetime.now(timezone.utc) + timedelta(seconds=2),
        )
        usage = storage.get(reservation.period_key)

        self.assertTrue(reservation.reserved)
        self.assertTrue(blocked_reservation.reserved)
        self.assertAlmostEqual(usage.reserved_cost_usd, 0.4)
        self.assertEqual(usage.reserved_tokens, 1000)

    def test_cost_guardrail_reserve_is_atomic_under_concurrency(self):
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)

        with ThreadPoolExecutor(max_workers=2) as executor:
            reservations = list(executor.map(lambda _idx: service.reserve(cost_usd=0.6, tokens=1000), range(2)))
        usage = storage.get(service._period_key())

        reserved_count = sum(1 for reservation in reservations if reservation.reserved)
        fallback_count = sum(1 for reservation in reservations if reservation.decision.action == CostGuardrailAction.FALLBACK)
        self.assertEqual(reserved_count, 1)
        self.assertEqual(fallback_count, 1)
        self.assertAlmostEqual(usage.total_cost_usd, 0.0)
        self.assertAlmostEqual(usage.reserved_cost_usd, 0.6)
        self.assertEqual(usage.reserved_tokens, 1000)

    def test_postgres_monthly_usage_increment_is_atomic_upsert(self):
        connect = _RecordingPostgresConnect()
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://unit-test",
            table_name="label_monthly_usage",
        )

        with patch.object(cost_guardrail_module, "_load_connect", return_value=connect):
            usage = storage.increment(period_key="2026-05", cost_usd=0.07, tokens=4000)

        self.assertEqual(usage.period_key, "2026-05")
        self.assertAlmostEqual(usage.total_cost_usd, 0.07)
        self.assertEqual(usage.total_tokens, 4000)
        executed_sql = "\n".join(connect.cursor.executed)
        self.assertIn("CREATE TABLE IF NOT EXISTS label_monthly_usage", executed_sql)
        self.assertIn("ON CONFLICT (period_key) DO UPDATE SET", executed_sql)
        self.assertIn("label_monthly_usage.total_cost_usd + EXCLUDED.total_cost_usd", executed_sql)
        self.assertIn("RETURNING period_key,total_cost_usd,total_tokens", executed_sql)
        self.assertEqual(connect.cursor.params[-1], ("2026-05", 0.07, 4000))

    def test_postgres_monthly_usage_adjust_clamps_missing_period_negative_delta(self):
        connect = _RecordingPostgresConnect()
        connect.cursor.row = ("2026-05", 0.0, 0, 0.0, 0)
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://unit-test",
            table_name="label_monthly_usage",
        )

        with patch.object(cost_guardrail_module, "_load_connect", return_value=connect):
            usage = storage.adjust(period_key="2026-05", cost_delta_usd=-0.03, token_delta=-100)

        self.assertEqual(usage.period_key, "2026-05")
        self.assertAlmostEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)
        executed_sql = "\n".join(connect.cursor.executed)
        self.assertIn("VALUES (%s,GREATEST(0.0,%s),GREATEST(0,%s),NOW())", executed_sql)
        self.assertIn("label_monthly_usage.total_cost_usd + %s", executed_sql)
        self.assertEqual(connect.cursor.params[-1], ("2026-05", -0.03, -100, -0.03, -100))

    def test_postgres_reservation_uses_atomic_budget_guard(self):
        connect = _RecordingPostgresConnect()
        connect.cursor.row = ("2026-05", 0.0, 0, 0.07, 4000)
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://unit-test",
            table_name="label_monthly_usage",
        )

        with patch.object(cost_guardrail_module, "_load_connect", return_value=connect):
            result = storage.reserve(
                period_key="2026-05",
                reservation_id="reservation-1",
                cost_usd=0.07,
                tokens=4000,
                limit_cost_usd=1.0,
            )

        self.assertTrue(result.reserved)
        self.assertAlmostEqual(result.usage.total_cost_usd, 0.0)
        self.assertAlmostEqual(result.usage.reserved_cost_usd, 0.07)
        self.assertEqual(result.usage.reserved_tokens, 4000)
        executed_sql = "\n".join(connect.cursor.executed)
        self.assertIn("CREATE TABLE IF NOT EXISTS label_monthly_usage_reservations", executed_sql)
        self.assertIn("reserved_cost_usd=label_monthly_usage.reserved_cost_usd + %s", executed_sql)
        self.assertIn("label_monthly_usage.total_cost_usd + label_monthly_usage.reserved_cost_usd + %s < %s", executed_sql)
        self.assertIn("INSERT INTO label_monthly_usage_reservations", executed_sql)
        self.assertEqual(connect.cursor.params[-2], (0.07, 4000, "2026-05", 0.07, 1.0))
        self.assertEqual(connect.cursor.params[-1], ("reservation-1", "2026-05", 0.07, 4000))

    def test_postgres_reservation_returns_unreserved_when_budget_guard_blocks(self):
        connect = _RecordingPostgresConnect()
        connect.cursor.rows = [None, ("2026-05", 0.95, 1000, 0.02, 1500)]
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://unit-test",
            table_name="label_monthly_usage",
        )

        with patch.object(cost_guardrail_module, "_load_connect", return_value=connect):
            result = storage.reserve(
                period_key="2026-05",
                reservation_id="reservation-2",
                cost_usd=0.07,
                tokens=4000,
                limit_cost_usd=1.0,
            )

        self.assertFalse(result.reserved)
        self.assertAlmostEqual(result.usage.total_cost_usd, 0.95)
        self.assertAlmostEqual(result.usage.reserved_cost_usd, 0.02)
        executed_sql = "\n".join(connect.cursor.executed)
        self.assertIn("SELECT period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens", executed_sql)
        self.assertNotIn("INSERT INTO label_monthly_usage_reservations", executed_sql)

    def test_postgres_commit_settles_reservation(self):
        connect = _RecordingPostgresConnect()
        connect.cursor.rows = [("2026-05", 0.07, 4000), ("2026-05", 0.02, 1500, 0.0, 0)]
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://unit-test",
            table_name="label_monthly_usage",
        )

        with patch.object(cost_guardrail_module, "_load_connect", return_value=connect):
            usage = storage.commit(reservation_id="reservation-1", cost_usd=0.02, tokens=1500)

        self.assertAlmostEqual(usage.total_cost_usd, 0.02)
        self.assertEqual(usage.total_tokens, 1500)
        self.assertAlmostEqual(usage.reserved_cost_usd, 0.0)
        executed_sql = "\n".join(connect.cursor.executed)
        self.assertIn("WHERE reservation_id=%s AND status='reserved'", executed_sql)
        self.assertIn("total_cost_usd=label_monthly_usage.total_cost_usd + %s", executed_sql)
        self.assertEqual(connect.cursor.params[-2], ("committed", "reservation-1"))
        self.assertEqual(connect.cursor.params[-1], (0.07, 4000, 0.02, 1500, "2026-05"))

    def test_postgres_release_expired_reservations_subtracts_reserved_usage(self):
        connect = _RecordingPostgresConnect()
        connect.cursor.row = ("2026-05", 0.0, 0, 0.02, 1500)
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://unit-test",
            table_name="label_monthly_usage",
        )
        older_than = datetime(2026, 5, 1, tzinfo=timezone.utc)

        with patch.object(cost_guardrail_module, "_load_connect", return_value=connect):
            usage = storage.release_expired(period_key="2026-05", older_than=older_than)

        self.assertAlmostEqual(usage.reserved_cost_usd, 0.02)
        self.assertEqual(usage.reserved_tokens, 1500)
        executed_sql = "\n".join(connect.cursor.executed)
        self.assertIn("WHERE period_key=%s AND status='reserved' AND created_at < %s", executed_sql)
        self.assertIn("status='released',updated_at=NOW()", executed_sql)
        self.assertIn("GREATEST(0,label_monthly_usage.reserved_cost_usd - totals.reserved_cost_usd)", executed_sql)
        self.assertIn("RETURNING label_monthly_usage.period_key", executed_sql)
        self.assertIn("label_monthly_usage.reserved_cost_usd", executed_sql)
        self.assertEqual(connect.cursor.params[-1], ("2026-05", older_than, "2026-05"))

    def test_postgres_monthly_usage_initializes_schema_once(self):
        connect = _RecordingPostgresConnect()
        storage = PostgresMonthlyUsageStorage(
            database_url="postgresql://unit-test",
            table_name="label_monthly_usage",
        )

        with patch.object(cost_guardrail_module, "_load_connect", return_value=connect):
            storage.increment(period_key="2026-05", cost_usd=0.02, tokens=1500)
            storage.increment(period_key="2026-05", cost_usd=0.03, tokens=2000)

        create_queries = [
            query for query in connect.cursor.executed if "CREATE TABLE IF NOT EXISTS label_monthly_usage (" in query
        ]
        self.assertEqual(len(create_queries), 1)

    def test_postgres_monthly_usage_rejects_invalid_table_name(self):
        with self.assertRaises(CostGuardrailStoreError):
            PostgresMonthlyUsageStorage(
                database_url="postgresql://unit-test",
                table_name="label-cost-usage",
            )

    def test_postgres_monthly_usage_rejects_truncated_table_names(self):
        with self.assertRaises(CostGuardrailStoreError):
            PostgresMonthlyUsageStorage(
                database_url="postgresql://unit-test",
                table_name="a" * 64,
            )

    def test_postgres_monthly_usage_rejects_truncated_default_reservation_table_name(self):
        with self.assertRaises(CostGuardrailStoreError):
            PostgresMonthlyUsageStorage(
                database_url="postgresql://unit-test",
                table_name="a" * 52,
            )

    def test_postgres_monthly_usage_redacts_database_url_details_from_errors(self):
        database_url = "postgresql://unit-user:unit-secret@private-db.example.com/foodlens"
        storage = PostgresMonthlyUsageStorage(database_url=database_url, table_name="label_monthly_usage")

        def _raise_connection_error(*_args, **_kwargs):
            raise RuntimeError(
                "connection failed for "
                "postgresql://unit-user:unit-secret@private-db.example.com/foodlens "
                "host private-db.example.com password unit-secret"
            )

        with (
            patch.object(cost_guardrail_module, "_load_connect", return_value=_raise_connection_error),
            self.assertRaises(CostGuardrailStoreError) as context,
        ):
            storage.get("2026-05")

        message = str(context.exception)
        self.assertNotIn(database_url, message)
        self.assertNotIn("unit-secret", message)
        self.assertNotIn("private-db.example.com", message)

    def test_postgres_monthly_usage_requires_database_url(self):
        with self.assertRaises(CostGuardrailStoreError):
            PostgresMonthlyUsageStorage(database_url="", table_name="label_monthly_usage")

    def test_postgres_smoke_script_skips_without_explicit_enable(self):
        smoke = _load_cost_guardrail_postgres_smoke_module()
        database_url = "postgresql://user:secret@example.com/foodlens"

        outcome = smoke.run_from_env({"DATABASE_URL": database_url})
        rendered = smoke.render_outcome(outcome)

        self.assertEqual(outcome.status, "skipped")
        self.assertEqual(outcome.exit_code, 0)
        self.assertIn("FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE", rendered)
        self.assertNotIn(database_url, rendered)
        self.assertNotIn("secret", rendered)

    def test_postgres_smoke_script_requires_database_url_when_enabled(self):
        smoke = _load_cost_guardrail_postgres_smoke_module()

        outcome = smoke.run_from_env({"FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE": "1"})
        rendered = smoke.render_outcome(outcome)

        self.assertEqual(outcome.status, "failed")
        self.assertEqual(outcome.exit_code, 2)
        self.assertIn("DATABASE_URL is required", rendered)

    def test_postgres_smoke_script_redacts_database_url_from_failure_details(self):
        smoke = _load_cost_guardrail_postgres_smoke_module()
        database_url = "postgresql://user:secret@example.com/foodlens"
        env = {
            "FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE": "1",
            "DATABASE_URL": database_url,
        }

        with (
            patch.object(smoke, "_run_live_smoke", side_effect=RuntimeError(f"failed for {database_url}")),
            patch.object(smoke, "_cleanup_tables", return_value=None),
        ):
            outcome = smoke.run_from_env(env)
        rendered = smoke.render_outcome(outcome)
        parsed = json.loads(rendered)

        self.assertEqual(outcome.status, "failed")
        self.assertEqual(parsed["checks"][0]["details"]["error_message"], "failed for [REDACTED_DATABASE_URL]")
        self.assertNotIn(database_url, rendered)
        self.assertNotIn("secret", rendered)

    def test_postgres_smoke_script_redacts_database_host_from_failure_details(self):
        smoke = _load_cost_guardrail_postgres_smoke_module()
        database_url = "postgresql://unit-user:unit-secret@private-db.example.com/foodlens"
        env = {
            "FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE": "1",
            "DATABASE_URL": database_url,
        }

        with (
            patch.object(
                smoke,
                "_run_live_smoke",
                side_effect=RuntimeError("could not translate host name private-db.example.com"),
            ),
            patch.object(smoke, "_cleanup_tables", return_value=None),
        ):
            outcome = smoke.run_from_env(env)
        rendered = smoke.render_outcome(outcome)

        self.assertEqual(outcome.status, "failed")
        self.assertNotIn("private-db.example.com", rendered)
        self.assertNotIn("unit-secret", rendered)

    def test_postgres_smoke_script_normalizes_table_prefix_for_cleanup(self):
        smoke = _load_cost_guardrail_postgres_smoke_module()

        table_names = smoke._table_names(
            smoke._safe_table_prefix({"COST_GUARDRAIL_POSTGRES_SMOKE_TABLE_PREFIX": "SmokeCost"}),
            "ABC123",
        )

        self.assertEqual(table_names.usage_table, "smokecost_abc123")
        self.assertEqual(table_names.reservation_table, "smokecost_abc123_reservations")

    def test_postgres_smoke_script_rejects_prefixes_that_postgres_would_truncate(self):
        smoke = _load_cost_guardrail_postgres_smoke_module()

        outcome = smoke.run_from_env(
            {
                "FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE": "1",
                "DATABASE_URL": "postgresql://unit-test",
                "COST_GUARDRAIL_POSTGRES_SMOKE_TABLE_PREFIX": "a" * 38,
            }
        )

        self.assertEqual(outcome.status, "failed")
        self.assertEqual(outcome.exit_code, 2)

    @unittest.skipUnless(
        os.environ.get("FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE") == "1"
        and bool((os.environ.get("DATABASE_URL") or "").strip()),
        "set FOODLENS_COST_GUARDRAIL_POSTGRES_SMOKE=1 and DATABASE_URL to run live postgres smoke",
    )
    def test_live_postgres_reservation_commit_release_smoke(self):
        smoke = _load_cost_guardrail_postgres_smoke_module()

        outcome = smoke.run_from_env(os.environ)

        self.assertEqual(outcome.status, "passed", smoke.render_outcome(outcome))

    def test_cost_guardrail_evaluate_fails_closed_on_storage_error(self):
        service = CostGuardrailService(_FailingMonthlyUsageStorage(), monthly_budget_usd=1.0)

        with self.assertRaises(CostGuardrailStoreError):
            service.evaluate(projected_cost_usd=0.02)

    def test_cost_guardrail_record_fails_closed_on_storage_error(self):
        service = CostGuardrailService(_FailingMonthlyUsageStorage(), monthly_budget_usd=1.0)

        with self.assertRaises(CostGuardrailStoreError):
            service.record(cost_usd=0.02, tokens=1500)

    def test_server_builds_postgres_cost_guardrail_storage_when_configured(self):
        with patch.dict(
            os.environ,
            {
                "LABEL_COST_GUARDRAIL_STORAGE_BACKEND": "postgres",
                "LABEL_COST_GUARDRAIL_TABLE": "label_monthly_usage",
                "DATABASE_URL": "postgresql://unit-test",
            },
            clear=False,
        ):
            storage = _build_label_cost_guardrail_storage()

        self.assertIsInstance(storage, PostgresMonthlyUsageStorage)
        self.assertEqual(storage.table_name, "label_monthly_usage")

    def test_server_builds_postgres_smart_router_cost_guardrail_storage_when_configured(self):
        with patch.dict(
            os.environ,
            {
                "SMART_ROUTER_COST_GUARDRAIL_STORAGE_BACKEND": "postgres",
                "SMART_ROUTER_COST_GUARDRAIL_TABLE": "smart_router_monthly_usage",
                "DATABASE_URL": "postgresql://unit-test",
            },
            clear=False,
        ):
            storage = _build_smart_router_cost_guardrail_storage()

        self.assertIsInstance(storage, PostgresMonthlyUsageStorage)
        self.assertEqual(storage.table_name, "smart_router_monthly_usage")

    def test_server_rejects_invalid_cost_guardrail_storage_backend(self):
        with (
            patch.dict(
                os.environ,
                {"LABEL_COST_GUARDRAIL_STORAGE_BACKEND": "redis"},
                clear=False,
            ),
            self.assertRaises(RuntimeError),
        ):
            _build_label_cost_guardrail_storage()

    def test_label_endpoint_fails_closed_when_guardrail_enabled_but_missing(self):
        spy = _SpyAnalyst()

        with (
            patch.dict(
                os.environ,
                {"LABEL_COST_GUARDRAIL_ENABLED": "1"},
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = None
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        self.assertEqual(response.status_code, 500)
        self.assertFalse(spy.called)

    def test_food_endpoint_records_monthly_usage(self):
        spy = _FoodAnalysisSpy()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(spy.called)
        self.assertAlmostEqual(usage.total_cost_usd, 0.02)
        self.assertEqual(usage.total_tokens, 1500)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 1)
        self.assertEqual(service.release_calls, 0)

    def test_food_endpoint_fallbacks_on_monthly_budget_without_gemini(self):
        spy = _FoodAnalysisSpy()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertFalse(spy.called)
        self.assertAlmostEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)
        self.assertIn("예산 한도", response.json().get("raw_result", ""))

    def test_food_endpoint_releases_reservation_when_gemini_raises(self):
        spy = _FailingFoodAnalysisSpy()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 500)
        self.assertTrue(spy.called)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 0)
        self.assertEqual(service.release_calls, 1)
        self.assertAlmostEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)

    def test_barcode_endpoint_records_allergen_monthly_usage(self):
        analyst = _BarcodeAllergenSpy()
        barcode_service = _BarcodeServiceSpy()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
                    "BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST": "256",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = barcode_service
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/lookup/barcode",
                data={"barcode": "8801234567890", "allergy_info": "wheat", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(barcode_service.called)
        self.assertTrue(analyst.called)
        self.assertAlmostEqual(usage.total_cost_usd, 0.003)
        self.assertEqual(usage.total_tokens, 256)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 1)
        self.assertEqual(service.release_calls, 0)
        self.assertEqual(response.json().get("used_model"), "gemini-2.0-flash")

    def test_barcode_endpoint_budget_fallback_skips_allergen_gemini(self):
        analyst = _BarcodeAllergenSpy()
        barcode_service = _BarcodeServiceSpy()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
                    "BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST": "256",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = barcode_service
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/lookup/barcode",
                data={"barcode": "8801234567890", "allergy_info": "wheat", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(barcode_service.called)
        self.assertFalse(analyst.called)
        self.assertAlmostEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)
        self.assertEqual(payload.get("data", {}).get("safetyStatus"), "CAUTION")
        self.assertIn("예산 한도", payload.get("data", {}).get("coachMessage", ""))

    def test_label_endpoint_degrades_on_85_percent(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=0.85, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
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

    def test_label_endpoint_records_primary_plus_pro_fallback_estimate(self):
        spy = _ProFallbackSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK": "0.05",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST_PRO_FALLBACK": "2500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(usage.total_cost_usd, 0.07)
        self.assertEqual(usage.total_tokens, 4000)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 1)
        self.assertEqual(service.release_calls, 0)

    def test_label_endpoint_records_provider_usage_metadata_when_available(self):
        spy = _UsageMetadataSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST": "1000",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(usage.total_cost_usd, 0.012)
        self.assertEqual(usage.total_tokens, 600)
        self.assertNotIn("_label_usage", response.json())
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 1)
        self.assertEqual(service.release_calls, 0)

    def test_label_endpoint_records_price_catalog_usage_when_configured(self):
        spy = _UsageMetadataSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with tempfile.TemporaryDirectory() as tmp_dir:
            catalog_path = os.path.join(tmp_dir, "ai-price-catalog.json")
            with open(catalog_path, "w", encoding="utf-8") as catalog_file:
                json.dump(
                    {
                        "version": "unit-test-2026-05-02",
                        "entries": [
                            {
                                "provider": "google_vertex_ai",
                                "model": "gemini-2.5-pro",
                                "input": {
                                    "usd_per_1m_tokens": 1.0,
                                    "sku": "synthetic-input-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                                "output": {
                                    "usd_per_1m_tokens": 10.0,
                                    "sku": "synthetic-output-sku",
                                    "source_url": "https://cloud.google.com/vertex-ai/generative-ai/pricing",
                                    "verified_at": "2026-05-02",
                                },
                            }
                        ],
                    },
                    catalog_file,
                )

            with (
                patch.dict(
                    os.environ,
                    {
                        "LABEL_COST_GUARDRAIL_ENABLED": "1",
                        "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                        "LABEL_ESTIMATED_TOKENS_PER_REQUEST": "1000",
                        "AI_COST_PRICE_CATALOG_PATH": catalog_path,
                    },
                    clear=False,
                ),
                TestClient(app) as client,
            ):
                app.state.analyst = spy
                app.state.barcode_service = object()
                app.state.smart_router = object()
                app.state.label_cost_guardrail = service
                response = client.post(
                    "/analyze/label",
                    files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                    data={"allergy_info": "None", "locale": "ko-KR"},
                )
                usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertAlmostEqual(usage.total_cost_usd, 0.0024)
        self.assertEqual(usage.total_tokens, 600)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 1)
        self.assertEqual(service.release_calls, 0)

    def test_label_endpoint_releases_reservation_when_gemini_raises(self):
        spy = _FailingAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
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
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 500)
        self.assertTrue(spy.called)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.release_calls, 1)
        self.assertEqual(service.commit_calls, 0)
        self.assertAlmostEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)

    def test_label_endpoint_preflights_pro_fallback_budget_when_enabled(self):
        spy = _ProFallbackSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=0.95, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK": "0.05",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(spy.called)
        self.assertIn("예산 한도", response.json().get("raw_result", ""))

    def test_label_endpoint_blocks_request_above_per_request_budget(self):
        spy = _ProFallbackSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK": "0.05",
                    "LABEL_PER_REQUEST_BUDGET_USD": "0.06",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = object()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/label",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertFalse(spy.called)
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertIn("예산 한도", response.json().get("raw_result", ""))

    def test_smart_label_route_records_monthly_usage(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
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
            app.state.smart_router = _LabelSmartRouter()
            app.state.label_cost_guardrail = service
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
        self.assertIsNotNone(response.json().get("request_id"))

    def test_smart_label_route_records_primary_plus_pro_fallback_estimate(self):
        spy = _ProFallbackSpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK": "0.05",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST_PRO_FALLBACK": "2500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = _LabelSmartRouter()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(spy.called)
        self.assertAlmostEqual(usage.total_cost_usd, 0.07)
        self.assertEqual(usage.total_tokens, 4000)
        self.assertNotIn("_label_pro_fallback_used", response.json())

    def test_smart_label_route_fallbacks_on_monthly_budget_without_gemini(self):
        spy = _SpyAnalyst()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = spy
            app.state.barcode_service = object()
            app.state.smart_router = _LabelSmartRouter()
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("label.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertFalse(spy.called)
        self.assertAlmostEqual(usage.total_cost_usd, 1.0)
        self.assertIn("예산 한도", response.json().get("raw_result", ""))

    def test_smart_food_route_records_food_monthly_usage(self):
        analyst = _FoodAnalysisSpy()
        router = _DelegatingFoodSmartRouter()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = object()
            app.state.smart_router = router
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(router.called)
        self.assertTrue(analyst.called)
        self.assertAlmostEqual(usage.total_cost_usd, 0.02)
        self.assertEqual(usage.total_tokens, 1500)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 1)
        self.assertEqual(response.json().get("router_category"), "REAL_FOOD")

    def test_smart_food_route_fallbacks_on_monthly_budget_without_food_gemini(self):
        analyst = _FoodAnalysisSpy()
        router = _DelegatingFoodSmartRouter()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "FOOD_ANALYSIS_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "FOOD_ANALYSIS_ESTIMATED_TOKENS_PER_REQUEST": "1500",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.barcode_service = object()
            app.state.smart_router = router
            app.state.label_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(router.called)
        self.assertFalse(analyst.called)
        self.assertAlmostEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)
        self.assertEqual(response.json().get("router_category"), "REAL_FOOD")
        self.assertIn("예산 한도", response.json().get("raw_result", ""))

    def test_smart_endpoint_records_router_classification_usage(self):
        router = _FoodSmartRouter()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "SMART_ROUTER_COST_GUARDRAIL_ENABLED": "1",
                    "SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
                    "SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST": "128",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = _SpyAnalyst()
            app.state.barcode_service = object()
            app.state.smart_router = router
            app.state.smart_router_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(router.called)
        self.assertAlmostEqual(usage.total_cost_usd, 0.003)
        self.assertEqual(usage.total_tokens, 128)
        self.assertEqual(response.json().get("router_category"), "REAL_FOOD")

    def test_smart_endpoint_records_router_provider_usage_metadata_when_available(self):
        router = _UsageMetadataFoodSmartRouter()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "SMART_ROUTER_COST_GUARDRAIL_ENABLED": "1",
                    "SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
                    "SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST": "128",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = _SpyAnalyst()
            app.state.barcode_service = object()
            app.state.smart_router = router
            app.state.smart_router_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertTrue(router.called)
        self.assertAlmostEqual(usage.total_cost_usd, 0.0015)
        self.assertEqual(usage.total_tokens, 64)
        self.assertNotIn("_router_usage", response.json())

    def test_smart_endpoint_fallbacks_on_router_monthly_budget_without_router_gemini(self):
        router = _FoodSmartRouter()
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)

        with (
            patch.dict(
                os.environ,
                {
                    "SMART_ROUTER_COST_GUARDRAIL_ENABLED": "1",
                    "SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
                    "SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST": "128",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = _SpyAnalyst()
            app.state.barcode_service = object()
            app.state.smart_router = router
            app.state.smart_router_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 200)
        self.assertFalse(router.called)
        self.assertAlmostEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)
        self.assertEqual(response.json().get("router_category"), "BUDGET_FALLBACK")
        self.assertIn("스마트 라우터 예산 한도", response.json().get("raw_result", ""))

    def test_smart_endpoint_commits_router_reservation_when_classification_then_failure(self):
        router = _FailingAfterClassificationSmartRouter()
        storage = InMemoryMonthlyUsageStorage()
        service = _TrackingCostGuardrailService(storage, monthly_budget_usd=100.0)

        with (
            patch.dict(
                os.environ,
                {
                    "SMART_ROUTER_COST_GUARDRAIL_ENABLED": "1",
                    "SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST": "0.003",
                    "SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST": "128",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = _SpyAnalyst()
            app.state.barcode_service = object()
            app.state.smart_router = router
            app.state.smart_router_cost_guardrail = service
            response = client.post(
                "/analyze/smart",
                files={"file": ("food.jpg", _build_high_quality_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR"},
            )
            usage = storage.get(service._period_key())

        self.assertEqual(response.status_code, 500)
        self.assertTrue(router.called)
        self.assertEqual(service.reserve_calls, 1)
        self.assertEqual(service.commit_calls, 1)
        self.assertEqual(service.release_calls, 0)
        self.assertAlmostEqual(usage.total_cost_usd, 0.003)
        self.assertEqual(usage.total_tokens, 128)


if __name__ == "__main__":
    unittest.main()
