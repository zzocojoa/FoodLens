import copy
import unittest
from typing import Any

from backend.modules.analyst_core.label_parse import (
    normalize_label_extract_result,
    parse_label_extract_response,
)


class LabelParseTests(unittest.TestCase):
    def test_parses_markdown_fence_and_trailing_comma_response(self) -> None:
        response_text = """```json
{
  "foodName": "Snack",
  "nutrition": {"calories": 120, "dataSource": "label"},
  "ingredients": [{"name": "Milk",}, "Sugar",],
}
```"""

        parsed = parse_label_extract_response(response_text, "en-US")

        self.assertTrue(parsed["parsed"])
        self.assertEqual(parsed["parse_status"], "repaired")
        self.assertEqual(parsed["repair_strategy"], "remove_trailing_commas")
        self.assertEqual(parsed["result"]["foodName"], "Snack")
        self.assertEqual(parsed["result"]["nutrition"]["calories"], 120)
        self.assertEqual(parsed["result"]["ingredients"], [{"name": "Milk"}, {"name": "Sugar"}])

    def test_balances_truncated_json_response(self) -> None:
        response_text = """
Before JSON:
{
  "foodName": "Cereal",
  "nutrition": {"calories": 90, "dataSource": "label"},
  "ingredients": [{"name": "Wheat"}, {"name": "Soy"}
"""

        parsed = parse_label_extract_response(response_text, "en-US")

        self.assertTrue(parsed["parsed"])
        self.assertEqual(parsed["parse_status"], "repaired")
        self.assertEqual(parsed["repair_strategy"], "close_unclosed_json")
        self.assertEqual(parsed["result"]["foodName"], "Cereal")
        self.assertEqual(parsed["result"]["ingredients"], [{"name": "Wheat"}, {"name": "Soy"}])

    def test_normalizes_string_ingredient_list(self) -> None:
        parsed = parse_label_extract_response(
            '{"foodName":"Cookie","nutrition":null,"ingredients":["Milk","  ","Wheat"]}',
            "en-US",
        )

        self.assertTrue(parsed["parsed"])
        self.assertEqual(parsed["result"]["ingredients"], [{"name": "Milk"}, {"name": "Wheat"}])
        self.assertIn("missing_nutrition", parsed["normalization_warnings"])
        self.assertEqual(parsed["result"]["nutrition"]["dataSource"], "OCR_Label")

    def test_missing_food_name_and_nutrition_use_locale_defaults(self) -> None:
        parsed = parse_label_extract_response('{"ingredients":["우유"]}', "ko-KR")

        self.assertTrue(parsed["parsed"])
        self.assertEqual(parsed["result"]["foodName"], "라벨 식품")
        self.assertEqual(parsed["result"]["nutrition"]["calories"], None)
        self.assertEqual(parsed["result"]["nutrition"]["servingSize"], None)
        self.assertEqual(parsed["result"]["ingredients"], [{"name": "우유"}])
        self.assertIn("missing_foodName", parsed["normalization_warnings"])
        self.assertIn("missing_nutrition", parsed["normalization_warnings"])

    def test_failed_parse_returns_nonparsed_default_result(self) -> None:
        parsed = parse_label_extract_response("not json at all", "en-US")

        self.assertFalse(parsed["parsed"])
        self.assertEqual(parsed["parse_status"], "failed")
        self.assertEqual(parsed["result"]["foodName"], "Label food")
        self.assertEqual(parsed["result"]["ingredients"], [])
        self.assertIn("missing_ingredients", parsed["normalization_warnings"])

    def test_normalize_does_not_mutate_input(self) -> None:
        source: dict[str, Any] = {
            "foodName": "Snack",
            "nutrition": {"calories": 120, "servingSize": "30g", "dataSource": "label"},
            "ingredients": [{"name": " Milk ", "meta": {"source": "ocr"}}],
        }
        original = copy.deepcopy(source)

        normalized, warnings = normalize_label_extract_result(source, "en-US")
        normalized["ingredients"][0]["name"] = "changed"
        normalized["nutrition"]["calories"] = 999

        self.assertEqual(source, original)
        self.assertIn("normalized_ingredients", warnings)


if __name__ == "__main__":
    unittest.main()
