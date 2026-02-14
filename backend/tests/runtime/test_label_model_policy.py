import os
import unittest
from unittest.mock import patch

from PIL import Image

from backend.modules.analyst_runtime.food_analyst import FoodAnalyst


class _MockResponse:
    def __init__(self, text: str):
        self.text = text


class LabelModelPolicyTests(unittest.TestCase):
    def test_label_model_uses_env_and_reports_used_model(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-pro"}, clear=False),
        ):
            mock_model_cls.return_value = object()
            mock_generate.return_value = _MockResponse('{"safetyStatus":"SAFE","ingredients":[]}')

            analyst = FoodAnalyst()
            self.assertEqual(analyst.label_model_name, "gemini-2.5-pro")

            with (
                patch.object(analyst, "_prepare_vertex_image", return_value=object()),
                patch.object(analyst, "_parse_ai_response", return_value={"safetyStatus": "SAFE", "ingredients": []}),
                patch.object(analyst, "_sanitize_response", side_effect=lambda result: result),
            ):
                result = analyst.analyze_label_json(Image.new("RGB", (4, 4)), "None", "US")

            mock_model_cls.assert_any_call("gemini-2.5-pro")
            self.assertEqual(result["used_model"], "gemini-2.5-pro")

    def test_label_model_has_safe_default(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": ""}, clear=False),
        ):
            mock_model_cls.return_value = object()
            analyst = FoodAnalyst()
            self.assertEqual(analyst.label_model_name, "gemini-2.5-pro")

    def test_label_assess_failure_returns_partial_caution(self):
        with (
            patch.object(FoodAnalyst, "_configure_vertex_ai", return_value=None),
            patch("backend.modules.analyst_runtime.food_analyst.GenerativeModel") as mock_model_cls,
            patch("backend.modules.analyst_runtime.food_analyst.generate_with_429_backoff") as mock_generate,
            patch.dict(os.environ, {"GEMINI_LABEL_MODEL_NAME": "gemini-2.5-pro"}, clear=False),
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

            self.assertEqual(result["used_model"], "gemini-2.5-pro")
            self.assertEqual(result["prompt_version"], "label-v1.2-2pass-locale-country")
            self.assertEqual(result["safetyStatus"], "CAUTION")
            self.assertTrue(result.get("_label_partial"))
            self.assertIn("불완전", result.get("raw_result", ""))


if __name__ == "__main__":
    unittest.main()
