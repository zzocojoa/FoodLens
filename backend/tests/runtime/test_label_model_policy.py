import os
import unittest
from typing import Any
from unittest.mock import patch

from google.api_core.exceptions import InvalidArgument, ResourceExhausted, ServiceUnavailable
from PIL import Image

from backend.modules.analyst_runtime.food_analyst import FoodAnalyst


class _MockResponse:
    def __init__(self, text: str, finish_reason: int) -> None:
        self.text = text
        self.candidates = [_MockCandidate(finish_reason)]


class _MockCandidate:
    def __init__(self, finish_reason: int) -> None:
        self.finish_reason = finish_reason


def _mock_response_with_usage(text: str, finish_reason: int, usage_metadata: dict[str, int]) -> _MockResponse:
    response = _MockResponse(text, finish_reason)
    response.usage_metadata = dict(usage_metadata)
    return response


def _extract_thinking_budget(generation_config: dict[str, Any]) -> int:
    thinking_config = generation_config.get("thinking_config") or generation_config.get("thinkingConfig")
    if thinking_config is None:
        raise AssertionError("generation_config must include thinking_config")

    raw_budget: Any
    if isinstance(thinking_config, dict):
        raw_budget = thinking_config.get("thinking_budget")
        if raw_budget is None:
            raw_budget = thinking_config.get("thinkingBudget")
    else:
        raw_budget = getattr(thinking_config, "thinking_budget", None)
        if raw_budget is None:
            raw_budget = getattr(thinking_config, "thinkingBudget", None)

    if not isinstance(raw_budget, int):
        raise AssertionError("thinking budget must be an integer")
    return raw_budget


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
                ServiceUnavailable("primary unavailable"),
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
                    "GEMINI_LABEL_PRO_THINKING_BUDGET": "64",
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
            self.assertEqual(mock_generate.call_count, 1)
            generation_config = mock_generate.call_args.kwargs["generation_config"]
            self.assertEqual(_extract_thinking_budget(generation_config), 0)
            self.assertEqual(result["used_model"], "gemini-2.5-flash")
            self.assertEqual(result["_label_error_type"], "quota_exhausted_429")
            self.assertEqual(result["_label_primary_model"], "gemini-2.5-flash")
            self.assertEqual(result["_label_used_model"], "gemini-2.5-flash")
            self.assertFalse(result["_label_fallback_used"])
            self.assertIsNone(result["_label_fallback_reason"])
            self.assertIsNone(result["_label_extract_finish_reason"])
            self.assertIsNone(result["_label_assess_finish_reason"])
            self.assertEqual(result["_label_finish_reasons"], {})
            self.assertEqual(result["_label_thinking_budget"], {})
            self.assertEqual(result["_label_usage"], {})
            self.assertEqual(result["_label_usage_metadata"], {})

    def test_label_flash_primary_uses_zero_thinking_budget(self):
        primary_model_cases = ("gemini-2.5-flash", "gemini-2.5-flash-lite")
        for model_name in primary_model_cases:
            with self.subTest(model_name=model_name):
                with (
                    patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
                    patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
                    patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
                    patch.dict(
                        os.environ,
                        {
                            "GEMINI_LABEL_MODEL_NAME": model_name,
                            "GEMINI_LABEL_FALLBACK_ENABLED": "0",
                            "GEMINI_LABEL_PRO_THINKING_BUDGET": "",
                        },
                        clear=False,
                    ),
                ):
                    mock_model_cls.return_value = object()
                    mock_generate.return_value = _MockResponse(
                        '{"safetyStatus":"SAFE","ingredients":[]}',
                        1,
                    )

                    analyst = FoodAnalyst()
                    with (
                        patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                        patch.object(
                            analyst,
                            "_parse_ai_response",
                            return_value={"safetyStatus": "SAFE", "ingredients": []},
                        ),
                        patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
                    ):
                        analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

                    generation_config = mock_generate.call_args.kwargs["generation_config"]
                    self.assertEqual(_extract_thinking_budget(generation_config), 0)

    def test_label_pro_fallback_uses_configured_low_thinking_budget(self):
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
                    "GEMINI_LABEL_PRO_THINKING_BUDGET": "64",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                ServiceUnavailable("primary unavailable"),
                _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", return_value={"safetyStatus": "SAFE", "ingredients": []}),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            primary_generation_config = mock_generate.call_args_list[0].kwargs["generation_config"]
            fallback_generation_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(_extract_thinking_budget(primary_generation_config), 0)
            self.assertEqual(_extract_thinking_budget(fallback_generation_config), 64)
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["_label_primary_model"], "gemini-2.5-flash")
            self.assertEqual(result["_label_used_model"], "gemini-2.5-pro")
            self.assertTrue(result["_label_fallback_used"])
            self.assertEqual(result["_label_fallback_reason"], "extract_primary_transient_error")
            self.assertEqual(result["_label_finish_reasons"], {"extract": 1})
            self.assertEqual(result["_label_thinking_budget"], {"extract": 64})

    def test_label_non_transient_generation_error_does_not_fall_back_to_pro(self):
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
            mock_generate.side_effect = InvalidArgument("bad schema")

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_model_cls.call_count, 2)
            self.assertEqual(mock_generate.call_count, 1)
            self.assertEqual(result["used_model"], "gemini-2.5-flash")
            self.assertFalse(result["_label_chargeable"])

    def test_label_extract_parse_error_falls_back_to_pro_only_when_enabled(self):
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
                    "GEMINI_LABEL_FALLBACK_ON_PARSE_ERROR": "1",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                _MockResponse('{"foodName":', 1),
                _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    side_effect=[
                        {
                            "foodName": "Analysis Error",
                            "raw_result": "AI 응답을 처리할 수 없습니다. 다시 시도해주세요.",
                            "ingredients": [],
                        },
                        {"safetyStatus": "SAFE", "ingredients": []},
                    ],
                ),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 2)
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["_label_fallback_reason"], "extract_parse_error")

    def test_label_extract_max_tokens_falls_back_to_pro_only_when_enabled(self):
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
                    "GEMINI_LABEL_FALLBACK_ON_MAX_TOKENS": "1",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                _MockResponse('{"foodName":"Cereal","ingredients":[', 2),
                _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", return_value={"safetyStatus": "SAFE", "ingredients": []}),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 2)
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["_label_fallback_reason"], "extract_max_tokens")
            self.assertNotIn("_label_truncated", result)

    def test_label_invalid_thinking_budget_env_fails_closed(self):
        invalid_env_cases = (
            ("GEMINI_LABEL_PRO_THINKING_BUDGET", "-1"),
            ("GEMINI_LABEL_PRO_THINKING_BUDGET", "many"),
        )
        for env_name, env_value in invalid_env_cases:
            with self.subTest(env_name=env_name, env_value=env_value):
                with (
                    patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
                    patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
                    patch.dict(os.environ, {env_name: env_value}, clear=False),
                ):
                    mock_model_cls.return_value = object()
                    with self.assertRaisesRegex(ValueError, env_name):
                        FoodAnalyst()

    def test_label_empty_thinking_budget_env_uses_clear_default(self):
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
                    "GEMINI_LABEL_PRO_THINKING_BUDGET": "",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                ServiceUnavailable("primary unavailable"),
                _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", return_value={"safetyStatus": "SAFE", "ingredients": []}),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            primary_generation_config = mock_generate.call_args_list[0].kwargs["generation_config"]
            fallback_generation_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(_extract_thinking_budget(primary_generation_config), 0)
            self.assertEqual(_extract_thinking_budget(fallback_generation_config), 128)

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
            self.assertEqual(extract_config["thinking_config"]["thinking_budget"], 0)
            self.assertEqual(assess_config["thinking_config"]["thinking_budget"], 0)

    def test_label_observability_metadata_records_extract_and_assess_usage(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-flash"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _mock_response_with_usage(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"밀","isAllergen":false}],"nutrition":{"calories":100},"raw_result":"ok"}',
                    1,
                    {"prompt_token_count": 11, "candidates_token_count": 7, "total_token_count": 18},
                ),
                _mock_response_with_usage(
                    '{"safetyStatus":"DANGER","ingredients":[{"name":"밀","isAllergen":true,"riskReason":"contains wheat"}]}',
                    2,
                    {"prompt_token_count": 5, "candidates_token_count": 3, "total_token_count": 8},
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

            self.assertEqual(result["_label_primary_model"], "gemini-2.5-flash")
            self.assertEqual(result["_label_used_model"], "gemini-2.5-flash")
            self.assertFalse(result["_label_fallback_used"])
            self.assertIsNone(result["_label_fallback_reason"])
            self.assertEqual(result["_label_extract_finish_reason"], 1)
            self.assertEqual(result["_label_assess_finish_reason"], 2)
            self.assertEqual(result["_label_finish_reasons"], {"extract": 1, "assess": 2})
            self.assertEqual(result["_label_thinking_budget"], {"extract": 0, "assess": 0})
            self.assertEqual(
                result["_label_usage"],
                {
                    "extract": {
                        "prompt_token_count": 11,
                        "candidates_token_count": 7,
                        "total_token_count": 18,
                    },
                    "assess": {
                        "prompt_token_count": 5,
                        "candidates_token_count": 3,
                        "total_token_count": 8,
                    },
                },
            )
            self.assertEqual(
                result["_label_usage_metadata"],
                {
                    "extract": {
                        "prompt_token_count": 11,
                        "candidates_token_count": 7,
                        "total_token_count": 18,
                    },
                    "assess": {
                        "prompt_token_count": 5,
                        "candidates_token_count": 3,
                        "total_token_count": 8,
                    },
                },
            )

    def test_label_fallback_call_applies_pro_thinking_budget_only_to_fallback(self):
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
                    "GEMINI_LABEL_FLASH_THINKING_BUDGET": "0",
                    "GEMINI_LABEL_PRO_THINKING_BUDGET": "128",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                ServiceUnavailable("primary unavailable"),
                _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", return_value={"safetyStatus": "SAFE", "ingredients": []}),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            primary_config = mock_generate.call_args_list[0].kwargs["generation_config"]
            fallback_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(primary_config["thinking_config"]["thinking_budget"], 0)
            self.assertEqual(fallback_config["thinking_config"]["thinking_budget"], 128)
            self.assertEqual(result["used_model"], "gemini-2.5-pro")

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
                ServiceUnavailable("primary assess unavailable"),
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
                ServiceUnavailable("primary extract unavailable"),
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

    def test_label_runtime_error_does_not_fall_back_to_pro(self):
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
            mock_generate.side_effect = RuntimeError("programming error")

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_model_cls.call_count, 2)
            self.assertEqual(mock_model_cls.call_args_list[1].args[0], "gemini-2.5-flash")
            self.assertEqual(mock_generate.call_count, 1)
            self.assertEqual(result["used_model"], "gemini-2.5-flash")

    def test_label_invalid_argument_does_not_fall_back_to_pro(self):
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
            mock_generate.side_effect = InvalidArgument("invalid generation config")

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_model_cls.call_count, 2)
            self.assertEqual(mock_model_cls.call_args_list[1].args[0], "gemini-2.5-flash")
            self.assertEqual(mock_generate.call_count, 1)
            self.assertEqual(result["used_model"], "gemini-2.5-flash")

    def test_label_preprocess_error_does_not_fall_back_to_pro(self):
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

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", side_effect=ValueError("bad image")):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_model_cls.call_count, 1)
            mock_generate.assert_not_called()
            self.assertEqual(result["used_model"], "gemini-2.5-flash")

    def test_label_parse_error_uses_pro_only_when_parse_fallback_enabled(self):
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
                    "GEMINI_LABEL_FALLBACK_ON_PARSE_ERROR": "1",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                _MockResponse('{"foodName":"Cereal","ingredients":[', 1),
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"oat","isAllergen":false}],"nutrition":{},"raw_result":"ok"}',
                    1,
                ),
            ]

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(
                    Image.new("RGB", (4, 4)),
                    "None",
                    "US",
                    assess_enabled=False,
                )

            self.assertEqual(mock_generate.call_count, 2)
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["_label_fallback_reason"], "extract_parse_error")

    def test_label_parse_error_without_pro_fallback_returns_reviewable_caution(self):
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
                    "GEMINI_LABEL_FALLBACK_ON_PARSE_ERROR": "0",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model"]
            mock_generate.return_value = _MockResponse('{"foodName":"Cereal","ingredients":[', 1)

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(
                    Image.new("RGB", (4, 4)),
                    "None",
                    "US",
                    "ko-KR",
                    assess_enabled=False,
                )

            self.assertEqual(mock_generate.call_count, 1)
            self.assertEqual(result["foodName"], "라벨 분석 확인 필요")
            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertEqual(result["used_model"], "gemini-2.5-flash")
            self.assertEqual(result["_label_fallback_reason"], "extract_parse_error")
            self.assertTrue(result["_label_partial"])
            self.assertNotEqual(result["foodName"], "Analysis Error")

    def test_label_max_tokens_uses_pro_only_when_max_tokens_fallback_enabled(self):
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
                    "GEMINI_LABEL_FALLBACK_ON_MAX_TOKENS": "1",
                },
                clear=False,
            ),
        ):
            mock_model_cls.side_effect = ["food-model", "primary-model", "fallback-model"]
            mock_generate.side_effect = [
                _MockResponse('{"foodName":"Cereal","ingredients":[', 2),
                _MockResponse(
                    '{"foodName":"Cereal","safetyStatus":"SAFE","ingredients":[{"name":"oat","isAllergen":false}],"nutrition":{},"raw_result":"ok"}',
                    1,
                ),
            ]

            analyst = FoodAnalyst()
            with patch.object(analyst, "_prepare_vertex_image", return_value=object()):
                result = analyst.analyze_label_json(
                    Image.new("RGB", (4, 4)),
                    "None",
                    "US",
                    assess_enabled=False,
                )

            self.assertEqual(mock_generate.call_count, 2)
            self.assertEqual(mock_model_cls.call_args_list[2].args[0], "gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["_label_fallback_reason"], "extract_max_tokens")
            self.assertNotIn("_label_truncated", result)

    def test_invalid_max_output_token_env_fails_closed(self):
        invalid_env_cases = (
            ("GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS", "0"),
            ("GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS", "-1"),
            ("GEMINI_BARCODE_ALLERGEN_MAX_OUTPUT_TOKENS", "many"),
            ("GEMINI_LABEL_PRO_THINKING_BUDGET", "-1"),
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
