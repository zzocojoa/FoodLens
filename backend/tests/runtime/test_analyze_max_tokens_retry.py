import unittest
from unittest.mock import patch

from PIL import Image

from backend.modules.analyst_core.postprocess import enrich_with_nutrition
from backend.modules.analyst_runtime.food_analyst import FoodAnalyst


class _MockCandidate:
    def __init__(self, finish_reason: int):
        self.finish_reason = finish_reason


class _MockResponse:
    def __init__(self, text: str, finish_reason: int):
        self.text = text
        self.candidates = [_MockCandidate(finish_reason)]


class AnalyzeMaxTokensRetryTests(unittest.TestCase):
    def test_analyze_food_retries_once_when_finish_reason_is_max_tokens(self):
        with (
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
                result = analyst.analyze_food_json(Image.new("RGB", (4, 4)), "None", "US")

            self.assertEqual(mock_generate.call_count, 2)
            first_config = mock_generate.call_args_list[0].kwargs["generation_config"]
            second_config = mock_generate.call_args_list[1].kwargs["generation_config"]
            self.assertEqual(first_config["max_output_tokens"], 4096)
            self.assertEqual(second_config["max_output_tokens"], 8192)
            self.assertEqual(result["foodName"], "RetryDish")

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
