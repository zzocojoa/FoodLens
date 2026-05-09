"""라벨 추출 결과와 알레르기 평가 결과 병합 헬퍼."""

from copy import deepcopy
from typing import Any, Final

SAFETY_STATUSES: Final[frozenset[str]] = frozenset({"SAFE", "CAUTION", "DANGER"})
CAUTION_STATUS: Final[str] = "CAUTION"
DANGER_STATUS: Final[str] = "DANGER"
KO_ASSESSMENT_UNAVAILABLE_MESSAGE: Final[str] = "알레르기 평가를 완료할 수 없어 주의가 필요합니다."
EN_ASSESSMENT_UNAVAILABLE_MESSAGE: Final[str] = "Allergen assessment could not be completed. Please use caution."


def _normalize_name(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def _copy_extract_ingredients(extract_result: dict[str, Any]) -> list[dict[str, Any]]:
    ingredients = extract_result.get("ingredients")
    copied_ingredients: list[dict[str, Any]] = []
    if not isinstance(ingredients, list):
        return copied_ingredients

    for ingredient in ingredients:
        if isinstance(ingredient, dict):
            copied_ingredients.append(deepcopy(ingredient))
    return copied_ingredients


def _with_default_risk_fields(ingredient: dict[str, Any]) -> dict[str, Any]:
    merged_ingredient = deepcopy(ingredient)
    merged_ingredient["isAllergen"] = bool(merged_ingredient.get("isAllergen", False))
    if "riskReason" not in merged_ingredient:
        merged_ingredient["riskReason"] = None
    return merged_ingredient


def _build_assessment_map(assess_result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    ingredients = assess_result.get("ingredients")
    assessment_map: dict[str, dict[str, Any]] = {}
    if not isinstance(ingredients, list):
        return assessment_map

    for ingredient in ingredients:
        if not isinstance(ingredient, dict):
            continue
        key = _normalize_name(ingredient.get("name"))
        if key:
            assessment_map[key] = ingredient
    return assessment_map


def _read_assessment_status(assess_result: dict[str, Any] | None) -> str | None:
    if assess_result is None:
        return None
    status = assess_result.get("safetyStatus")
    if not isinstance(status, str):
        return None
    normalized_status = status.strip().upper()
    if normalized_status in SAFETY_STATUSES:
        return normalized_status
    return None


def _build_assessment_unavailable_message(locale: str) -> str:
    if locale.strip().lower().startswith("ko"):
        return KO_ASSESSMENT_UNAVAILABLE_MESSAGE
    return EN_ASSESSMENT_UNAVAILABLE_MESSAGE


def build_no_allergy_label_assessment(ingredient_names: list[str]) -> dict[str, Any]:
    return {
        "safetyStatus": "SAFE",
        "ingredients": [
            {"name": ingredient_name, "isAllergen": False, "riskReason": ""}
            for ingredient_name in ingredient_names
        ],
    }


def _read_coach_message(assess_result: dict[str, Any]) -> str | None:
    coach_message = assess_result.get("coachMessage")
    if not isinstance(coach_message, str):
        return None
    normalized_message = coach_message.strip()
    if not normalized_message:
        return None
    return normalized_message


def _ensure_raw_result(result: dict[str, Any], assess_result: dict[str, Any]) -> dict[str, Any]:
    raw_result = result.get("raw_result")
    if isinstance(raw_result, str) and raw_result.strip():
        return result
    coach_message = _read_coach_message(assess_result)
    result["raw_result"] = coach_message or ""
    return result


def _close_with_caution(result: dict[str, Any], locale: str) -> dict[str, Any]:
    result["safetyStatus"] = CAUTION_STATUS
    raw_result = result.get("raw_result")
    if not isinstance(raw_result, str) or not raw_result.strip():
        result["raw_result"] = _build_assessment_unavailable_message(locale)
    return result


def merge_label_extract_and_assessment(
    extract_result: dict[str, Any],
    assess_result: dict[str, Any] | None,
    locale: str,
) -> dict[str, Any]:
    if not isinstance(extract_result, dict):
        raise TypeError("extract_result must be a dict")
    if assess_result is not None and not isinstance(assess_result, dict):
        raise TypeError("assess_result must be a dict or None")
    if not isinstance(locale, str):
        raise TypeError("locale must be a str")

    result: dict[str, Any] = deepcopy(extract_result)
    extract_ingredients = _copy_extract_ingredients(extract_result)
    result["ingredients"] = [_with_default_risk_fields(ingredient) for ingredient in extract_ingredients]

    assessment_status = _read_assessment_status(assess_result)
    if not extract_ingredients:
        if assessment_status == DANGER_STATUS:
            result["safetyStatus"] = DANGER_STATUS
            return result
        return _close_with_caution(result, locale)

    if assess_result is None:
        return _close_with_caution(result, locale)

    assessment_map = _build_assessment_map(assess_result)
    if not assessment_map:
        if assessment_status == DANGER_STATUS:
            result["safetyStatus"] = DANGER_STATUS
            return result
        return _close_with_caution(result, locale)

    matched_assessment = False
    merged_ingredients: list[dict[str, Any]] = []
    for ingredient in extract_ingredients:
        key = _normalize_name(ingredient.get("name"))
        assessment = assessment_map.get(key)
        merged_ingredient = _with_default_risk_fields(ingredient)
        if assessment is not None:
            matched_assessment = True
            merged_ingredient["isAllergen"] = bool(assessment.get("isAllergen", False))
            merged_ingredient["riskReason"] = assessment.get("riskReason")
        merged_ingredients.append(merged_ingredient)

    result["ingredients"] = merged_ingredients
    if assessment_status == DANGER_STATUS:
        result["safetyStatus"] = DANGER_STATUS
        return _ensure_raw_result(result, assess_result)
    if matched_assessment and assessment_status in SAFETY_STATUSES:
        result["safetyStatus"] = assessment_status
        return _ensure_raw_result(result, assess_result)
    return _close_with_caution(result, locale)
