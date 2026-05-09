import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from backend.scripts.run_food_golden_model_eval import (
    FoodEvalCase,
    FoodEvalResult,
    FoodEvalThresholds,
    _build_gate_failures,
    _evaluate_output,
    _load_cases,
    _missing_terms,
    _summarize_results,
)


def _case(image_path: Path) -> FoodEvalCase:
    return FoodEvalCase(
        case_id="visible-milk",
        image_path=image_path,
        category="visible_allergen_danger",
        allergy_info="Milk",
        iso_country="US",
        expected_safety_status="DANGER",
        allowed_safety_statuses=["DANGER"],
        expected_food_origin="western",
        required_visible_allergens=["cheese"],
        required_ingredient_terms=["pasta", "cheese"],
        required_status_reason_terms=["milk", "cheese"],
        review_confidence="high",
        notes="unit test",
    )


def _thresholds() -> FoodEvalThresholds:
    return FoodEvalThresholds(
        min_success_rate=1.0,
        min_expected_status_match_rate=1.0,
        min_food_origin_match_rate=1.0,
        min_required_terms_pass_rate=1.0,
        min_visible_allergen_recall_rate=1.0,
        min_status_reason_terms_pass_rate=1.0,
        max_invalid_bbox_rate=0.0,
        max_p95_elapsed_ms=None,
    )


class FoodGoldenModelEvalGateTests(unittest.TestCase):
    def test_load_cases_validates_manifest_images_and_expected_enums(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            image_path = fixture_root / "images" / "case.jpg"
            image_path.parent.mkdir()
            Image.new("RGB", (4, 4), (255, 255, 255)).save(image_path)
            manifest_path = fixture_root / "manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "cases": [
                            {
                                "id": "case-1",
                                "image": "images/case.jpg",
                                "category": "safe_control",
                                "allergy_info": "Peanut",
                                "iso_country": "US",
                                "expected_safetyStatus": "SAFE",
                                "allowed_safetyStatuses": ["SAFE", "CAUTION"],
                                "expected_foodOrigin": "single_ingredient",
                                "required_visible_allergens": [],
                                "required_ingredient_terms": ["tomato"],
                                "required_status_reason_terms": [],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            cases = _load_cases(manifest_path, None)

        self.assertEqual(1, len(cases))
        self.assertEqual("case-1", cases[0].case_id)
        self.assertEqual("SAFE", cases[0].expected_safety_status)
        self.assertEqual(["SAFE", "CAUTION"], cases[0].allowed_safety_statuses)
        self.assertEqual("single_ingredient", cases[0].expected_food_origin)

    def test_load_cases_defaults_allowed_statuses_to_expected_status(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            image_path = fixture_root / "images" / "case.jpg"
            image_path.parent.mkdir()
            Image.new("RGB", (4, 4), (255, 255, 255)).save(image_path)
            manifest_path = fixture_root / "manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "cases": [
                            {
                                "id": "case-1",
                                "image": "images/case.jpg",
                                "category": "safe_control",
                                "allergy_info": "Peanut",
                                "iso_country": "US",
                                "expected_safetyStatus": "SAFE",
                                "expected_foodOrigin": "single_ingredient",
                                "required_visible_allergens": [],
                                "required_ingredient_terms": ["tomato"],
                                "required_status_reason_terms": [],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            cases = _load_cases(manifest_path, None)

        self.assertEqual(["SAFE"], cases[0].allowed_safety_statuses)

    def test_load_cases_requires_allowed_statuses_to_include_expected_status(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            image_path = fixture_root / "images" / "case.jpg"
            image_path.parent.mkdir()
            Image.new("RGB", (4, 4), (255, 255, 255)).save(image_path)
            manifest_path = fixture_root / "manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "cases": [
                            {
                                "id": "case-1",
                                "image": "images/case.jpg",
                                "category": "safe_control",
                                "allergy_info": "Peanut",
                                "iso_country": "US",
                                "expected_safetyStatus": "SAFE",
                                "allowed_safetyStatuses": ["CAUTION"],
                                "expected_foodOrigin": "single_ingredient",
                                "required_visible_allergens": [],
                                "required_ingredient_terms": ["tomato"],
                                "required_status_reason_terms": [],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "allowed_safetyStatuses must include expected_safetyStatus"):
                _load_cases(manifest_path, None)

    def test_allowed_statuses_count_as_expected_status_match(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_path = Path(temporary_directory) / "case.jpg"
            Image.new("RGB", (4, 4), (255, 255, 255)).save(image_path)
            case = FoodEvalCase(
                case_id="hidden-or-visible-soy",
                image_path=image_path,
                category="ambiguous_hidden_visible",
                allergy_info="Soy",
                iso_country="KR",
                expected_safety_status="CAUTION",
                allowed_safety_statuses=["CAUTION", "DANGER"],
                expected_food_origin="korean",
                required_visible_allergens=[],
                required_ingredient_terms=["soy"],
                required_status_reason_terms=["soy"],
                review_confidence="medium",
                notes="unit test",
            )

            result = _evaluate_output(
                case,
                "gemini-2.5-flash",
                "0" * 64,
                100,
                {
                    "foodName": "Soy dish",
                    "foodOrigin": "korean",
                    "safetyStatus": "DANGER",
                    "ingredients": [{"name": "soy bean sprouts", "isAllergen": True, "bbox": [1, 2, 3, 4]}],
                    "raw_result": "soy risk",
                },
            )

        self.assertTrue(result.expected_status_match)

    def test_evaluate_output_tracks_status_origin_allergens_terms_and_bbox(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_path = Path(temporary_directory) / "case.jpg"
            Image.new("RGB", (4, 4), (255, 255, 255)).save(image_path)
            result = _evaluate_output(
                _case(image_path),
                "gemini-2.5-flash",
                "0" * 64,
                100,
                {
                    "foodName": "Cheese pasta",
                    "foodOrigin": "western",
                    "safetyStatus": "DANGER",
                    "ingredients": [
                        {
                            "name": "cheese",
                            "name_en": "cheese",
                            "isAllergen": True,
                            "riskReason": "Visible milk allergen from cheese.",
                            "bbox": [10, 20, 100, 200],
                        }
                    ],
                    "raw_result": "Milk risk from visible cheese.",
                    "used_model": "gemini-2.5-flash",
                    "prompt_version": "food-v3.3.3-schema-safety",
                    "_food_usage_metadata": {"prompt_token_count": 12, "total_token_count": 20},
                    "_food_chargeable": True,
                },
            )

        self.assertTrue(result.success)
        self.assertTrue(result.expected_status_match)
        self.assertTrue(result.food_origin_match)
        self.assertTrue(result.required_terms_pass)
        self.assertTrue(result.visible_allergen_recall_pass)
        self.assertTrue(result.status_reason_terms_pass)
        self.assertTrue(result.bbox_valid_pass)
        self.assertEqual({"prompt_token_count": 12, "total_token_count": 20}, result.usage_metadata)

    def test_required_ingredient_terms_ignore_raw_result_only_matches(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_path = Path(temporary_directory) / "case.jpg"
            Image.new("RGB", (4, 4), (255, 255, 255)).save(image_path)
            case = FoodEvalCase(
                case_id="sauce-required",
                image_path=image_path,
                category="hidden_allergen_caution",
                allergy_info="Soy",
                iso_country="KR",
                expected_safety_status="CAUTION",
                allowed_safety_statuses=["CAUTION"],
                expected_food_origin="korean",
                required_visible_allergens=[],
                required_ingredient_terms=["sauce"],
                required_status_reason_terms=["soy", "sauce"],
                review_confidence="medium",
                notes="unit test",
            )

            result = _evaluate_output(
                case,
                "gemini-2.5-flash",
                "0" * 64,
                100,
                {
                    "foodName": "Jeyuk Bokkeum",
                    "foodOrigin": "korean",
                    "safetyStatus": "CAUTION",
                    "ingredients": [
                        {
                            "name": "pork",
                            "isAllergen": False,
                            "riskReason": "Soy sauce may contain soy.",
                            "bbox": [1, 2, 3, 4],
                        }
                    ],
                    "raw_result": "Soy sauce may contain soy.",
                },
            )

        self.assertEqual(["sauce"], result.required_terms_missing)
        self.assertFalse(result.required_terms_pass)
        self.assertTrue(result.status_reason_terms_pass)

    def test_required_terms_support_pipe_delimited_aliases(self) -> None:
        self.assertEqual([], _missing_terms("creme brulee contains milk and egg", ["custard|creme brulee"]))
        self.assertEqual([], _missing_terms("custard contains milk and egg", ["custard|creme brulee"]))
        self.assertEqual(["custard|creme brulee"], _missing_terms("milk and egg", ["custard|creme brulee"]))

    def test_invalid_bbox_counts_as_gate_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_path = Path(temporary_directory) / "case.jpg"
            Image.new("RGB", (4, 4), (255, 255, 255)).save(image_path)
            result = _evaluate_output(
                _case(image_path),
                "gemini-2.5-flash",
                "0" * 64,
                100,
                {
                    "foodName": "Cheese pasta",
                    "foodOrigin": "western",
                    "safetyStatus": "DANGER",
                    "ingredients": [
                        {
                            "name": "cheese pasta",
                            "isAllergen": True,
                            "riskReason": "milk cheese",
                            "bbox": [100, 20, 10, 200],
                        }
                    ],
                    "raw_result": "milk cheese pasta",
                },
            )
            summary = _summarize_results([result], _thresholds())

        self.assertEqual(1, summary["models"]["gemini-2.5-flash"]["invalid_bbox_count"])
        self.assertEqual("invalid_bbox_rate", summary["failures"][0]["metric"])

    def test_gate_failure_reports_low_status_match(self) -> None:
        summaries = {
            "gemini-2.5-flash": {
                "success_rate": 1.0,
                "expected_status_match_rate": 0.0,
                "food_origin_match_rate": 1.0,
                "required_terms_pass_rate": 1.0,
                "visible_allergen_recall_rate": 1.0,
                "status_reason_terms_pass_rate": 1.0,
                "invalid_bbox_rate": 0.0,
                "p95_elapsed_ms": 100,
            }
        }

        failures = _build_gate_failures(summaries, _thresholds())

        self.assertEqual("expected_status_match_rate", failures[0]["metric"])

    def test_paid_eval_requires_explicit_approval_flag(self) -> None:
        from backend.scripts.run_food_golden_model_eval import _require_paid_eval_approval

        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(SystemExit):
                _require_paid_eval_approval()

        with patch.dict("os.environ", {"ALLOW_VERTEX_FOOD_GOLDEN_EVAL": "1"}, clear=True):
            _require_paid_eval_approval()


if __name__ == "__main__":
    unittest.main()
