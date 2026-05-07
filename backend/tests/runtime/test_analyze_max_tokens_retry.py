import unittest
from unittest.mock import patch

from PIL import Image

from backend.modules.analyst_core.postprocess import enrich_with_nutrition
from backend.modules.analyst_runtime.food_analyst import FoodAnalyst


class _MockCandidate:
    def __init__(self, finish_reason: int):
        self.finish_reason = finish_reason


class _MockResponse:
    def __init__(
        self,
        text: str,
        finish_reason: int,
        usage_metadata: dict[str, int] | None = None,
    ):
        self.text = text
        self.candidates = [_MockCandidate(finish_reason)]
        if usage_metadata is not None:
            self.usage_metadata = dict(usage_metadata)


class AnalyzeMaxTokensRetryTests(unittest.TestCase):
    def test_analyze_food_retries_once_when_finish_reason_is_max_tokens(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_retry_and_fallback") as mock_generate,
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse(
                    '{"foodName":"RetryDish","ingredients":[]}',
                    2,
                    {"prompt_token_count": 10, "total_token_count": 20},
                ),
                _MockResponse(
                    '{"foodName":"RetryDish","ingredients":[]}',
                    1,
                    {"prompt_token_count": 3, "total_token_count": 7},
                ),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={"foodName": "RetryDish", "ingredients": [], "safetyStatus": "SAFE"},
                ),
                patch.object(analyst, "_enrich_with_nutrition", side_effect=lambda result: result),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_food_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 2)
            first_config = mock_generate.call_args_list[0].kwargs["generation_config"]
            second_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(first_config["max_output_tokens"], 4096)
            self.assertEqual(second_config["max_output_tokens"], 8192)
            self.assertEqual(result["foodName"], "RetryDish")
            self.assertEqual(result["_food_usage_metadata"]["prompt_token_count"], 13)
            self.assertEqual(result["_food_usage_metadata"]["total_token_count"], 27)

    def test_analyze_food_does_not_retry_when_finish_reason_is_not_max_tokens(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_retry_and_fallback") as mock_generate,
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"foodName":"OneShot","ingredients":[]}', 1)

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={"foodName": "OneShot", "ingredients": [], "safetyStatus": "SAFE"},
                ),
                patch.object(analyst, "_enrich_with_nutrition", side_effect=lambda result: result),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_food_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 1)
            self.assertEqual(result["foodName"], "OneShot")

    def test_analyze_food_does_not_retry_max_tokens_when_provider_call_budget_is_exhausted(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_retry_and_fallback") as mock_generate,
        ):
            exhausted_response = _MockResponse('{"foodName":"FallbackDish","ingredients":[]}', 2)
            setattr(exhausted_response, "_foodlens_provider_call_count", 3)
            mock_model_cls.return_value = object()
            mock_generate.return_value = exhausted_response

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={"foodName": "FallbackDish", "ingredients": [], "safetyStatus": "SAFE"},
                ),
                patch.object(analyst, "_enrich_with_nutrition", side_effect=lambda result: result),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_food_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 1)
            self.assertEqual(result["foodName"], "FallbackDish")

    def test_analyze_food_does_not_retry_max_tokens_when_fallback_response_was_used(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_retry_and_fallback") as mock_generate,
        ):
            fallback_response = _MockResponse('{"foodName":"FallbackDish","ingredients":[]}', 2)
            setattr(fallback_response, "_foodlens_provider_call_count", 1)
            setattr(fallback_response, "_foodlens_fallback_used", True)
            setattr(fallback_response, "_foodlens_fallback_reason", "primary_429_cooldown")
            mock_model_cls.return_value = object()
            mock_generate.return_value = fallback_response

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={"foodName": "FallbackDish", "ingredients": [], "safetyStatus": "SAFE"},
                ),
                patch.object(analyst, "_enrich_with_nutrition", side_effect=lambda result: result),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_food_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 1)
            self.assertEqual(result["foodName"], "FallbackDish")
            self.assertEqual(result["_food_fallback_used"], True)
            self.assertEqual(result["_food_fallback_reason"], "primary_429_cooldown")
            self.assertEqual(result["_food_truncated"], True)

    def test_analyze_food_uses_fallback_thinking_config_for_fallback_model(self):
        with (
            patch.dict(
                "os.environ",
                {
                    "GEMINI_MODEL_NAME": "gemini-2.5-flash-lite",
                    "GEMINI_FOOD_FLASH_LITE_THINKING_BUDGET": "0",
                    "GEMINI_FOOD_FLASH_THINKING_BUDGET": "256",
                },
                clear=False,
            ),
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_retry_and_fallback") as mock_generate,
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"foodName":"OneShot","ingredients":[]}', 1)

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={"foodName": "OneShot", "ingredients": [], "safetyStatus": "SAFE"},
                ),
                patch.object(analyst, "_enrich_with_nutrition", side_effect=lambda result: result),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                analyst.analyze_food_json(Image.new("RGB", (4, 4)), "None", "US")

            primary_config = mock_generate.call_args.kwargs["generation_config"]
            fallback_config = mock_generate.call_args.kwargs["fallback_generation_config"]
            self.assertEqual(primary_config["thinking_config"]["thinking_budget"], 0)
            self.assertEqual(fallback_config["thinking_config"]["thinking_budget"], 256)

    def test_analyze_food_retry_max_tokens_reads_plan_alias_env(self):
        with (
            patch.dict("os.environ", {"GEMINI_FOOD_MAX_OUTPUT_TOKENS_RETRY": "6144"}, clear=False),
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_retry_and_fallback") as mock_generate,
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse('{"foodName":"RetryDish","ingredients":[]}', 2),
                _MockResponse('{"foodName":"RetryDish","ingredients":[]}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={"foodName": "RetryDish", "ingredients": [], "safetyStatus": "SAFE"},
                ),
                patch.object(analyst, "_enrich_with_nutrition", side_effect=lambda result: result),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                analyst.analyze_food_json(Image.new("RGB", (4, 4)), "None", "US")

            second_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(second_config["max_output_tokens"], 6144)

    def test_analyze_food_job_retries_once_when_finish_reason_is_max_tokens(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_retry_and_fallback") as mock_generate,
        ):
            mock_model_cls.return_value = object()
            mock_generate.side_effect = [
                _MockResponse('{"foodName":"RetryDish","ingredients":[]}', 2),
                _MockResponse('{"foodName":"RetryDish","ingredients":[],"safetyStatus":"SAFE"}', 1),
            ]

            analyst = FoodAnalyst()
            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(
                    analyst,
                    "_parse_ai_response",
                    return_value={"foodName": "RetryDish", "ingredients": [], "safetyStatus": "SAFE"},
                ),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_food_job_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 2)
            first_config = mock_generate.call_args_list[0].kwargs["generation_config"]
            second_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(first_config["max_output_tokens"], 4096)
            self.assertEqual(second_config["max_output_tokens"], 8192)
            self.assertEqual(result["foodName"], "RetryDish")

    def test_enrich_with_nutrition_skips_analysis_error_payload(self):
        payload = {
            "foodName": "Analysis Error",
            "canonicalFoodId": "error",
            "ingredients": [{"name": "Shrimp"}],
            "foodOrigin": "unknown",
        }
        with patch("backend.modules.analyst_core.postprocess.lookup_nutrition") as mock_lookup:
            result = enrich_with_nutrition(payload)
        mock_lookup.assert_not_called()
        self.assertEqual(result["foodName"], "Analysis Error")


if __name__ == "__main__":
    unittest.main()
