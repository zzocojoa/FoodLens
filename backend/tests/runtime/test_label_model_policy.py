import os
import unittest
from unittest.mock import patch

from google.api_core.exceptions import ResourceExhausted
from PIL import Image

from backend.modules.analyst_runtime.food_analyst import FoodAnalyst


class _MockResponse:
    def __init__(self, text: str, finish_reason: int) -> None:
        self.text = text
        self.candidates = [_MockCandidate(finish_reason)]


class _MockCandidate:
    def __init__(self, finish_reason: int) -> None:
        self.finish_reason = finish_reason


class LabelModelPolicyTests(unittest.TestCase):
    def test_label_model_uses_env_and_reports_used_model(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash-lite"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}', 1)

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
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "",
                    "GEMINI_LABEL_FALLBACK_MODEL_NAME": "",
                    "GEMINI_LABEL_FALLBACK_ENABLED": "",
                },
                clear=False,
            ),
        ):
            mock_model_cls.return_value = object()
            analyst = FoodAnalyst()
            self.assertEqual(analyst.label_model_name, "gemini-2.5-flash")
            self.assertEqual(analyst.label_fallback_model_name, "gemini-2.5-pro")
            self.assertFalse(analyst.label_fallback_enabled)

    def test_label_model_rejects_pro_primary(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-pro"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            with self.assertRaisesRegex(ValueError, "GEMINI_LABEL_MODEL_NAME"):
                FoodAnalyst()

    def test_label_model_rejects_invalid_fallback_enabled_env(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch.dict(os.environ, {"GEMINI_LABEL_FALLBACK_ENABLED": "maybe"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            with self.assertRaisesRegex(ValueError, "GEMINI_LABEL_FALLBACK_ENABLED"):
                FoodAnalyst()

    def test_label_extract_uses_pro_only_after_enabled_primary_failure(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash",
                    "GEMINI_LABEL_FALLBACK_MODEL_NAME": "gemini-2.5-pro",
                    "GEMINI_LABEL_FALLBACK_ENABLED": "1",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                RuntimeError("primary unavailable"),
                _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", return_value={"safetyStatus": "SAFE", "ingredients": []}),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_model_cls.call_args_list[1].args[0], "gemini-2.5-flash")
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")

    def test_label_quota_429_does_not_fall_back_to_pro(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash",
                    "GEMINI_LABEL_FALLBACK_MODEL_NAME": "gemini-2.5-pro",
                    "GEMINI_LABEL_FALLBACK_ENABLED": "1",
                },
                clear=False,
            ),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = ResourceExhausted("quota exhausted")

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_model_cls.call_count, 2)
            self.assertEqual(mock_model_cls.call_args_list[1].args[0], "gemini-2.5-flash")
            self.assertEqual(result["used_model"], "gemini-2.5-flash")
            self.assertEqual(result["_label_error_type"], "quota_exhausted_429")

    def test_label_assess_failure_returns_partial_caution(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash",
                    "GEMINI_LABEL_FALLBACK_ENABLED": "0",
                },
                clear=False,
            ),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse('{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}', 1),
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
            self.assertTrue(result.get("_label_chargeable"))
            self.assertTrue(result.get("_label_partial"))
            self.assertIn("불완전", result.get("raw_result", ""))

    def test_label_generation_configs_apply_max_output_token_caps(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash",
                    "GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS": "1234",
                    "GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS": "456",
                },
                clear=False,
            ),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                    1,
                ),
                _MockResponse(
                    '{"safetyStatus":"DANGER","ingredients":[{"name":"밀","isAllergen":true,"riskReason":"contains wheat"}]}',
                    1,
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
                analyst.analyze_label_json(Image.new("RGB", (4, 4)), "Wheat/Gluten", "KR", "ko-KR")

            extract_config = mock_generate.call_args_list[0].kwargs["generation_config"]
            assess_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(extract_config["max_output_tokens"], 1234)
            self.assertEqual(assess_config["max_output_tokens"], 456)

    def test_label_assess_uses_pro_only_after_enabled_primary_failure(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash",
                    "GEMINI_LABEL_FALLBACK_MODEL_NAME": "gemini-2.5-pro",
                    "GEMINI_LABEL_FALLBACK_ENABLED": "true",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                    1,
                ),
                RuntimeError("primary assess unavailable"),
                _MockResponse(
                    '{"safetyStatus":"DANGER","ingredients":[{"name":"밀","isAllergen":true,"riskReason":"contains wheat"}]}',
                    1,
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

            self.assertEqual(mock_model_cls.call_args_list[1].args[0], "gemini-2.5-flash")
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["safetyStatus"], "DANGER")

    def test_label_extract_fallback_usage_is_preserved_after_primary_assess_success(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(
                os.environ,
                {
                    "GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash",
                    "GEMINI_LABEL_FALLBACK_MODEL_NAME": "gemini-2.5-pro",
                    "GEMINI_LABEL_FALLBACK_ENABLED": "1",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                RuntimeError("primary extract unavailable"),
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                    1,
                ),
                _MockResponse(
                    '{"safetyStatus":"DANGER","ingredients":[{"name":"밀","isAllergen":true,"riskReason":"contains wheat"}]}',
                    1,
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

            self.assertEqual(mock_model_cls.call_args_list[1].args[0], "gemini-2.5-flash")
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(mock_generate.call_args_list[2].kwargs["model"], "primary-model")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["safetyStatus"], "DANGER")

    def test_label_extract_max_token_finish_marks_partial_caution(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse(
                '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                2,
            )

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

            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertTrue(result.get("_label_partial"))
            self.assertTrue(result.get("_label_truncated"))

    def test_label_extract_truncated_malformed_json_marks_truncated_fallback(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse(
                '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[',
                2,
            )

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "Wheat/Gluten", "KR", "ko-KR")

            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertEqual(result["used_model"], "gemini-2.5-flash")
            self.assertTrue(result.get("_label_chargeable"))
            self.assertTrue(result.get("_label_partial"))
            self.assertTrue(result.get("_label_truncated"))

    def test_label_extract_truncated_without_ingredients_counts_provider_usage(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse(
                '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[],"nutrition":{"calories":100},"raw_result":"ok"}',
                2,
            )

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={
                        "foodName": "Cereal",
                        "safetyStatus": "SAFE",
                        "ingredients": [],
                        "nutrition": {"calories": 100},
                        "raw_result": "ok",
                    },
                ),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "Wheat/Gluten", "KR", "ko-KR")

            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertTrue(result.get("_label_chargeable"))
            self.assertTrue(result.get("_label_partial"))
            self.assertTrue(result.get("_label_truncated"))

    def test_label_assess_max_token_finish_preserves_extract_and_marks_partial(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                    1,
                ),
                _MockResponse('{"safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}]}', 2),
            ]

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "Wheat/Gluten", "KR", "ko-KR")

            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertEqual(result["ingredients"], [{"name": "밀", "isAllergen": False, "riskReason": None}])
            self.assertTrue(result.get("_label_partial"))
            self.assertTrue(result.get("_label_truncated"))

    def test_label_extract_truncated_does_not_downgrade_assess_danger(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                    2,
                ),
                _MockResponse(
                    '{"safetyStatus":"DANGER","ingredients":[{"name":"밀","isAllergen":true,"riskReason":"contains wheat"}]}',
                    1,
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

            self.assertEqual(result["safetyStatus"], "DANGER")
            self.assertTrue(result.get("_label_partial"))
            self.assertTrue(result.get("_label_truncated"))

    def test_invalid_max_output_token_env_fails_closed(self):
        invalid_env_cases = (
            ("GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS", "0"),
            ("GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS", "-1"),
            ("GEMINI_BARCODE_ALLERGEN_MAX_OUTPUT_TOKENS", "many"),
        )
        for env_name, env_value in invalid_env_cases:
            with self.subTest(env_name=env_name):
                with (
                    patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
                    patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
                    patch.dict(os.environ, {env_name: env_value}, clear=False),
                ):
                    mock_model_cls.return_value = object()
                    with self.assertRaisesRegex(ValueError, env_name):
                        FoodAnalyst()

    def test_barcode_allergen_generation_config_applies_max_output_token_cap(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_semaphore") as mock_generate,
            patch.dict(os.environ, {"GEMINI_BARCODE_ALLERGEN_MAX_OUTPUT_TOKENS": "321"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse(
                '{"safetyStatus":"DANGER","ingredients":[{"name":"milk","isAllergen":true,"riskReason":"contains milk"}]}',
                1,
            )

            analyst = FoodAnalyst()
            with patch.object(
                analyst,
                "_parse_ai_response",
                return_value={
                    "safetyStatus": "DANGER",
                    "ingredients": [{"name": "milk", "isAllergen": True, "riskReason": "contains milk"}],
                },
            ):
                analyst.analyze_barcode_ingredients(["milk"], "Milk", "en-US")

            generation_config = mock_generate.call_args.kwargs["generation_config"]
            self.assertEqual(generation_config["max_output_tokens"], 321)

    def test_barcode_allergen_max_token_finish_preserves_input_ingredients(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_semaphore") as mock_generate,
            patch.dict(os.environ, {"GEMINI_BARCODE_ALLERGEN_MAX_OUTPUT_TOKENS": "64"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"safetyStatus":"SAFE","ingredients":[', 2)

            analyst = FoodAnalyst()
            result = analyst.analyze_barcode_ingredients(["milk", "milk", "sugar"], "Milk", "en-US")

            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertEqual(
                result["ingredients"],
                [
                    {"name": "milk", "isAllergen": False, "riskReason": ""},
                    {"name": "sugar", "isAllergen": False, "riskReason": ""},
                ],
            )
            generation_config = mock_generate.call_args.kwargs["generation_config"]
            self.assertEqual(generation_config["max_output_tokens"], 64)


if __name__ == "__main__":
    unittest.main()
