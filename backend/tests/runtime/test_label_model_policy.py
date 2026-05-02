import asyncio
import os
import unittest
from unittest.mock import patch

from PIL import Image

from backend.modules.analyst_runtime.food_analyst import FoodAnalyst
from backend.modules.analyst_runtime.router import SmartRouter


class _UsageMetadata:
    def __init__(
        self,
        prompt_token_count: int,
        candidates_token_count: int,
        total_token_count: int,
        cached_content_token_count: int,
        thoughts_token_count: int,
    ) -> None:
        self.prompt_token_count = prompt_token_count
        self.candidates_token_count = candidates_token_count
        self.total_token_count = total_token_count
        self.cached_content_token_count = cached_content_token_count
        self.thoughts_token_count = thoughts_token_count


class _MockResponse:
    def __init__(self, text: str, usage_metadata: object | None = None) -> None:
        self.text = text
        self.usage_metadata = usage_metadata


class LabelModelPolicyTests(unittest.TestCase):
    def test_label_model_uses_env_and_reports_used_model(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_PRIMARY_MODEL_NAME": "gemini-2.5-flash-lite"}, clear=True),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}')

            analyst = FoodAnalyst()
            self.assertEqual(analyst.label_model_name, "gemini-2.5-flash-lite")

            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", return_value={"safetyStatus": "SAFE", "ingredients": []}),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            mock_model_cls.assert_any_call("gemini-2.5-flash-lite")
            self.assertEqual(result["used_model"], "gemini-2.5-flash-lite")

    def test_label_model_has_safe_default(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": ""}, clear=True),
        ):
            mock_model_cls.return_value = object()
            analyst = FoodAnalyst()
            self.assertEqual(analyst.label_model_name, "gemini-2.5-flash")

    def test_legacy_pro_primary_is_blocked_without_override(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-pro"}, clear=True),
        ):
            mock_model_cls.return_value = object()
            analyst = FoodAnalyst()
            self.assertEqual(analyst.label_model_name, "gemini-2.5-flash")

    def test_pro_primary_requires_explicit_override(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "gemini-2.5-pro",
                    "GEMINI_LABEL_ALLOW_PRO_PRIMARY": "1",
                },
                clear=True,
            ),
        ):
            mock_model_cls.return_value = object()
            analyst = FoodAnalyst()
            self.assertEqual(analyst.label_model_name, "gemini-2.5-pro")

    def test_invalid_bool_env_fails_closed(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch.dict(os.environ, {"GEMINI_LABEL_PRO_FALLBACK_ENABLED": "maybe"}, clear=True),
        ):
            mock_model_cls.return_value = object()
            with self.assertRaisesRegex(ValueError, "GEMINI_LABEL_PRO_FALLBACK_ENABLED"):
                FoodAnalyst()

    def test_pro_fallback_is_disabled_by_default(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_PRIMARY_MODEL_NAME": "gemini-2.5-flash"}, clear=True),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"broken":')

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", side_effect=ValueError("bad json")),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            mock_model_cls.assert_any_call("gemini-2.5-flash")
            created_model_names = [call_item.args[0] for call_item in mock_model_cls.call_args_list]
            self.assertNotIn("gemini-2.5-pro", created_model_names)
            self.assertEqual(result["used_model"], "gemini-2.5-flash")
            self.assertFalse(result.get("_label_chargeable"))

    def test_pro_fallback_runs_only_when_enabled_after_primary_failure(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_PRIMARY_MODEL_NAME": "gemini-2.5-flash",
                    "GEMINI_LABEL_FALLBACK_MODEL_NAME": "gemini-2.5-pro",
                    "GEMINI_LABEL_PRO_FALLBACK_ENABLED": "1",
                },
                clear=True,
            ),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}')

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    side_effect=[
                        ValueError("bad json"),
                        {"safetyStatus": "SAFE", "ingredients": []},
                    ],
                ),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            mock_model_cls.assert_any_call("gemini-2.5-flash")
            mock_model_cls.assert_any_call("gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertTrue(result.get("_label_pro_fallback_used"))

    def test_degraded_label_analysis_forces_caution_when_assess_is_disabled(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_PRIMARY_MODEL_NAME": "gemini-2.5-flash"}, clear=True),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}]}')

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={
                        "safetyStatus": "SAFE",
                        "ingredients": [{"name": "밀", "isAllergen": False}],
                        "raw_result": "ok",
                    },
                ),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "Wheat/Gluten", "KR", "ko-KR", False)

            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertTrue(result.get("_label_degraded"))
            self.assertIn("알러지 위험 판정", result.get("raw_result", ""))

    def test_label_assess_failure_returns_partial_caution(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_PRIMARY_MODEL_NAME": "gemini-2.5-flash"}, clear=True),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse('{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}'),
                Exception("assess failed"),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={
                        "foodName": "Cereal",
                        "safetyStatus": "SAFE",
                        "ingredients": [{"name": "밀", "isAllergen": False}],
                        "nutrition": {"calories": 100},
                        "raw_result": "ok",
                    },
                ),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "Wheat/Gluten", "KR", "ko-KR")

            self.assertEqual(result["used_model"], "gemini-2.5-flash")
            self.assertEqual(result["prompt_version"], "label-v1.2-2pass-locale-country")
            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertTrue(result.get("_label_partial"))
            self.assertIn("불완전", result.get("raw_result", ""))

    def test_label_analysis_captures_provider_usage_metadata(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_PRIMARY_MODEL_NAME": "gemini-2.5-flash"}, clear=True),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                    _UsageMetadata(120, 30, 150, 12, 0),
                ),
                _MockResponse(
                    '{"safetyStatus":"DANGER","ingredients":[{"name":"밀","isAllergen":true,"riskReason":"contains wheat"}]}',
                    {
                        "prompt_token_count": 60,
                        "candidates_token_count": 15,
                        "total_token_count": 75,
                    },
                ),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    side_effect=[
                        {
                            "foodName": "Cereal",
                            "safetyStatus": "SAFE",
                            "ingredients": [{"name": "밀", "isAllergen": False}],
                            "nutrition": {"calories": 100},
                            "raw_result": "ok",
                        },
                        {
                            "safetyStatus": "DANGER",
                            "ingredients": [
                                {"name": "밀", "isAllergen": True, "riskReason": "contains wheat"}
                            ],
                        },
                    ],
                ),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "Wheat/Gluten", "KR", "ko-KR")

            usage_records = result.get("_label_usage")
            self.assertIsInstance(usage_records, list)
            self.assertEqual([record["route"] for record in usage_records], ["label_extract", "label_assess"])
            self.assertEqual([record["total_tokens"] for record in usage_records], [150, 75])
            self.assertEqual(usage_records[0]["cached_tokens"], 12)
            self.assertNotIn("text", usage_records[0])

    def test_smart_router_attaches_provider_usage_metadata(self):
        with patch("backend.modules.analyst_runtime.router.GenerativeModel") as mock_model_cls:
            mock_model = mock_model_cls.return_value
            mock_model.generate_content.return_value = _MockResponse(
                '{"category":"NOT_FOOD","confidence":0.95}',
                _UsageMetadata(20, 8, 28, 0, 0),
            )

            router = SmartRouter(analyst=object())
            result = asyncio.run(router.route_analysis(Image.new("RGB", (4, 4))))

        usage_records = result.get("_router_usage")
        self.assertIsInstance(usage_records, list)
        self.assertEqual(usage_records[0]["route"], "smart_router_classify")
        self.assertEqual(usage_records[0]["model"], "gemini-2.0-flash")
        self.assertEqual(usage_records[0]["total_tokens"], 28)
        self.assertNotIn("text", usage_records[0])


if __name__ == "__main__":
    unittest.main()
