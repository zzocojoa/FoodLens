import unittest

from backend.scripts.run_label_golden_model_eval import (
    LabelEvalCall,
    LabelEvalGateThresholds,
    LabelEvalResult,
    _compute_set_metrics,
    _extract_actual_allergens,
    _extract_actual_risk_ingredients,
    _build_gate_failures,
)


def _call(finish_reason: str | None, parsed_success: bool) -> LabelEvalCall:
    return LabelEvalCall(
        model_name="gemini-2.5-flash",
        phase="extract",
        elapsed_ms=100,
        finish_reason=finish_reason,
        usage_metadata={},
        parsed_success=parsed_success,
        error_type=None,
        error_message=None,
    )


def _result(
    model_name: str,
    success: bool,
    expected_status_match: bool,
    min_ingredients_pass: bool,
    nutrition_keys_pass: bool,
    finish_reason: str | None,
    allergen_recall_eligible: bool,
) -> LabelEvalResult:
    return LabelEvalResult(
        sample_id=f"{model_name}-{success}-{expected_status_match}",
        model_name=model_name,
        image_sha256="0" * 64,
        success=success,
        expected_safety_status="CAUTION",
        actual_safety_status="CAUTION" if expected_status_match else "DANGER",
        expected_status_match=expected_status_match,
        ingredients_count=1 if min_ingredients_pass else 0,
        min_ingredients_pass=min_ingredients_pass,
        missing_nutrition_keys=[] if nutrition_keys_pass else ["calories"],
        nutrition_keys_pass=nutrition_keys_pass,
        human_label_status="reviewed" if allergen_recall_eligible else "needs_human_review",
        human_label_provenance={
            "reviewed_by": "unit-test",
            "assistance": "none",
            "source": "fixture",
            "confidence": "high",
        },
        allergen_recall_eligible=allergen_recall_eligible,
        allergen_metrics=_compute_set_metrics(["milk"], ["milk"] if allergen_recall_eligible else []),
        risk_ingredient_metrics=_compute_set_metrics(["milk powder"], ["milk powder"] if allergen_recall_eligible else []),
        total_elapsed_ms=100,
        calls=[_call(finish_reason, success)],
        output={"foodName": "fixture"} if success else None,
    )


def _thresholds(
    min_success_rate: float,
    min_expected_status_match_rate: float,
    min_ingredients_pass_rate: float,
    min_nutrition_keys_pass_rate: float,
    min_allergen_recall_rate: float,
    min_risk_ingredient_recall_rate: float,
    max_max_tokens_rate: float,
    max_p95_elapsed_ms: int | None,
) -> LabelEvalGateThresholds:
    return LabelEvalGateThresholds(
        min_success_rate=min_success_rate,
        min_expected_status_match_rate=min_expected_status_match_rate,
        min_ingredients_pass_rate=min_ingredients_pass_rate,
        min_nutrition_keys_pass_rate=min_nutrition_keys_pass_rate,
        min_allergen_recall_rate=min_allergen_recall_rate,
        min_risk_ingredient_recall_rate=min_risk_ingredient_recall_rate,
        max_max_tokens_rate=max_max_tokens_rate,
        max_p95_elapsed_ms=max_p95_elapsed_ms,
    )


class LabelGoldenModelEvalGateTests(unittest.TestCase):
    def test_gate_passes_when_metrics_meet_thresholds(self) -> None:
        results = [
            _result("gemini-2.5-flash", True, True, True, True, "STOP", False),
            _result("gemini-2.5-flash", False, True, True, True, "STOP", False),
        ]

        failures = _build_gate_failures(
            results,
            _thresholds(0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 500),
        )

        self.assertEqual([], failures)

    def test_gate_fails_when_one_model_misses_threshold(self) -> None:
        results = [
            _result("gemini-2.5-flash", True, True, True, True, "STOP", False),
            _result("gemini-2.5-pro", False, True, True, True, "STOP", False),
        ]

        failures = _build_gate_failures(
            results,
            _thresholds(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, None),
        )

        self.assertEqual("gemini-2.5-pro", failures[0]["model"])
        self.assertEqual("success_rate", failures[0]["metric"])

    def test_gate_fails_on_max_tokens_rate(self) -> None:
        results = [
            _result("gemini-2.5-flash", True, True, True, True, "MAX_TOKENS", False),
            _result("gemini-2.5-flash", True, True, True, True, "STOP", False),
        ]

        failures = _build_gate_failures(
            results,
            _thresholds(1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.25, None),
        )

        self.assertEqual("max_tokens_rate", failures[0]["metric"])
        self.assertEqual(0.5, failures[0]["actual"])

    def test_set_metrics_normalizes_case_and_whitespace(self) -> None:
        metrics = _compute_set_metrics([" Milk Powder "], ["milk  powder", "soy"])

        self.assertEqual(["milk powder"], metrics.true_positive)
        self.assertEqual(["soy"], metrics.false_positive)
        self.assertEqual([], metrics.false_negative)
        self.assertEqual(0.5, metrics.precision)
        self.assertEqual(1.0, metrics.recall)

    def test_extract_actual_risk_ingredients_uses_flagged_ingredients_only(self) -> None:
        output = {
            "ingredients": [
                {"name": "milk powder", "isAllergen": True},
                {"name": "sugar", "isAllergen": False},
            ]
        }

        self.assertEqual(["milk powder"], _extract_actual_risk_ingredients(output))

    def test_extract_actual_allergens_canonicalizes_korean_label_terms(self) -> None:
        output = {
            "ingredients": [
                {"name": "대두", "isAllergen": True, "riskReason": "우유, 대두, 밀 함유"},
                {"name": "새우", "isAllergen": True, "riskReason": "게와 조개류 제조시설"},
            ]
        }

        self.assertEqual(["milk", "wheat", "soy", "shellfish"], _extract_actual_allergens(output))

    def test_extract_actual_allergens_does_not_map_buckwheat_to_wheat(self) -> None:
        output = {
            "ingredients": [
                {"name": "메밀", "isAllergen": True, "riskReason": "메밀 함유"},
            ]
        }

        self.assertEqual(["메밀"], _extract_actual_allergens(output))

    def test_extract_actual_allergens_does_not_match_latin_substrings(self) -> None:
        output = {
            "ingredients": [
                {"name": "shellfish", "isAllergen": True, "riskReason": "Contains shellfish"},
                {"name": "buckwheat", "isAllergen": True, "riskReason": "Contains buckwheat"},
                {"name": "eggplant", "isAllergen": True, "riskReason": "Contains eggplant"},
            ]
        }

        self.assertEqual(["shellfish", "buckwheat", "eggplant"], _extract_actual_allergens(output))

    def test_extract_actual_allergens_maps_wheat_compounds_without_buckwheat_collision(self) -> None:
        output = {
            "ingredients": [
                {"name": "밀전분", "isAllergen": True},
                {"name": "메밀", "isAllergen": True},
            ]
        }

        self.assertEqual(["wheat", "메밀"], _extract_actual_allergens(output))

    def test_extract_actual_allergens_does_not_map_unknown_placeholder_to_egg(self) -> None:
        output = {
            "ingredients": [
                {"name": "알 수 없음", "isAllergen": True, "riskReason": "알 수 없음"},
            ]
        }

        self.assertEqual(["알 수 없음"], _extract_actual_allergens(output))

    def test_gate_fails_on_reviewed_allergen_recall(self) -> None:
        result = _result("gemini-2.5-flash", True, True, True, True, "STOP", True)
        result = LabelEvalResult(
            sample_id=result.sample_id,
            model_name=result.model_name,
            image_sha256=result.image_sha256,
            success=result.success,
            expected_safety_status=result.expected_safety_status,
            actual_safety_status=result.actual_safety_status,
            expected_status_match=result.expected_status_match,
            ingredients_count=result.ingredients_count,
            min_ingredients_pass=result.min_ingredients_pass,
            missing_nutrition_keys=result.missing_nutrition_keys,
            nutrition_keys_pass=result.nutrition_keys_pass,
            human_label_status=result.human_label_status,
            human_label_provenance=result.human_label_provenance,
            allergen_recall_eligible=result.allergen_recall_eligible,
            allergen_metrics=_compute_set_metrics(["milk"], []),
            risk_ingredient_metrics=result.risk_ingredient_metrics,
            total_elapsed_ms=result.total_elapsed_ms,
            calls=result.calls,
            output=result.output,
        )

        failures = _build_gate_failures(
            [result],
            _thresholds(1.0, 1.0, 1.0, 1.0, 0.75, 0.0, 0.0, None),
        )

        self.assertEqual("allergen_recall_rate", failures[0]["metric"])


if __name__ == "__main__":
    unittest.main()
