import copy
import unittest
from typing import Any

from backend.modules.analyst_core.label_merge import merge_label_extract_and_assessment


def _build_extract_result() -> dict[str, Any]:
    return {
        "foodName": "Cereal",
        "nutrition": {"calories": 100},
        "ingredients": [
            {"name": " Wheat ", "bbox": [1, 2, 3, 4], "isAllergen": False},
            {"name": "Sugar", "bbox": [5, 6, 7, 8], "isAllergen": False},
        ],
        "safetyStatus": "SAFE",
        "raw_result": "ok",
    }


class LabelMergeTests(unittest.TestCase):
    def test_merges_assessment_by_extract_ingredient_name(self) -> None:
        extract_result = _build_extract_result()
        assess_result: dict[str, Any] = {
            "safetyStatus": "DANGER",
            "ingredients": [
                {"name": "wheat", "isAllergen": True, "riskReason": "contains wheat"},
                {"name": "milk", "isAllergen": True, "riskReason": "contains milk"},
            ],
        }

        merged: dict[str, Any] = merge_label_extract_and_assessment(extract_result, assess_result, "en-US")

        self.assertEqual(merged["foodName"], "Cereal")
        self.assertEqual(merged["nutrition"], {"calories": 100})
        self.assertEqual(merged["safetyStatus"], "DANGER")
        self.assertEqual(merged["raw_result"], "ok")
        self.assertEqual(
            merged["ingredients"],
            [
                {
                    "name": " Wheat ",
                    "bbox": [1, 2, 3, 4],
                    "isAllergen": True,
                    "riskReason": "contains wheat",
                },
                {"name": "Sugar", "bbox": [5, 6, 7, 8], "isAllergen": False, "riskReason": None},
            ],
        )

    def test_does_not_mutate_extract_or_assessment_inputs(self) -> None:
        extract_result = _build_extract_result()
        assess_result: dict[str, Any] = {
            "safetyStatus": "SAFE",
            "ingredients": [{"name": "sugar", "isAllergen": False, "riskReason": None}],
        }
        original_extract: dict[str, Any] = copy.deepcopy(extract_result)
        original_assess: dict[str, Any] = copy.deepcopy(assess_result)

        merged: dict[str, Any] = merge_label_extract_and_assessment(extract_result, assess_result, "en-US")
        merged["ingredients"][0]["bbox"][0] = 999
        merged["nutrition"]["calories"] = 999

        self.assertEqual(extract_result, original_extract)
        self.assertEqual(assess_result, original_assess)

    def test_missing_assessment_fails_closed_with_existing_shape(self) -> None:
        extract_result: dict[str, Any] = {
            "foodName": "Cereal",
            "nutrition": {"calories": 100},
            "ingredients": [{"name": "Wheat", "isAllergen": False}],
            "safetyStatus": "SAFE",
            "raw_result": "",
        }

        merged: dict[str, Any] = merge_label_extract_and_assessment(extract_result, None, "ko-KR")

        self.assertEqual(merged["foodName"], "Cereal")
        self.assertEqual(merged["nutrition"], {"calories": 100})
        self.assertEqual(merged["ingredients"], [{"name": "Wheat", "isAllergen": False, "riskReason": None}])
        self.assertEqual(merged["safetyStatus"], "CAUTION")
        self.assertEqual(merged["raw_result"], "알레르기 평가를 완료할 수 없어 주의가 필요합니다.")

    def test_assessment_without_matching_ingredients_fails_closed(self) -> None:
        extract_result = _build_extract_result()
        assess_result: dict[str, Any] = {
            "safetyStatus": "SAFE",
            "ingredients": [{"name": "milk", "isAllergen": False, "riskReason": None}],
        }

        merged: dict[str, Any] = merge_label_extract_and_assessment(extract_result, assess_result, "en-US")

        self.assertEqual(merged["safetyStatus"], "CAUTION")
        self.assertEqual(merged["raw_result"], "ok")
        self.assertEqual(
            merged["ingredients"],
            [
                {"name": " Wheat ", "bbox": [1, 2, 3, 4], "isAllergen": False, "riskReason": None},
                {"name": "Sugar", "bbox": [5, 6, 7, 8], "isAllergen": False, "riskReason": None},
            ],
        )

    def test_assessment_danger_is_preserved_when_ingredients_are_empty(self) -> None:
        extract_result: dict[str, Any] = {
            "foodName": "Unknown",
            "nutrition": {},
            "ingredients": [],
            "safetyStatus": "SAFE",
            "raw_result": "danger noted",
        }
        assess_result: dict[str, Any] = {"safetyStatus": "DANGER", "ingredients": []}

        merged: dict[str, Any] = merge_label_extract_and_assessment(extract_result, assess_result, "en-US")

        self.assertEqual(merged["safetyStatus"], "DANGER")
        self.assertEqual(merged["ingredients"], [])
        self.assertEqual(merged["raw_result"], "danger noted")


if __name__ == "__main__":
    unittest.main()
