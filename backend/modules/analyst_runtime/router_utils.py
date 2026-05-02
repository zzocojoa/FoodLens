import json
import math
from typing import Any, Dict, Tuple


ALLOWED_ROUTER_CATEGORIES = frozenset({"REAL_FOOD", "NUTRITION_LABEL", "BARCODE", "MENU", "NOT_FOOD"})


def _is_korean_locale(locale: str | None) -> bool:
    return bool(locale and locale.strip().lower().startswith("ko"))


def _normalize_router_category(category: object) -> str:
    if not isinstance(category, str):
        return "NOT_FOOD"
    normalized = category.strip().upper()
    if normalized in ALLOWED_ROUTER_CATEGORIES:
        return normalized
    return "NOT_FOOD"


def _normalize_classification_confidence(confidence: object) -> float:
    if confidence is None or isinstance(confidence, bool):
        return 0.0
    try:
        normalized = float(confidence)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(normalized):
        return 0.0
    if normalized < 0.0:
        return 0.0
    if normalized > 1.0:
        return 1.0
    return normalized


def parse_classification_response(response_text: str) -> Tuple[str, float]:
    try:
        classification = json.loads(response_text)
        if not isinstance(classification, dict):
            return "NOT_FOOD", 0.0
        category = _normalize_router_category(classification.get("category"))
        confidence = _normalize_classification_confidence(classification.get("confidence"))
        return category, confidence
    except json.JSONDecodeError:
        print(f"[SmartRouter] Failed to parse JSON: {response_text}")
        return "NOT_FOOD", 0.0


def build_barcode_route_response(category: str, locale: str | None = None) -> Dict[str, Any]:
    is_korean = _is_korean_locale(locale)
    normalized_category = _normalize_router_category(category)
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": (
            "바코드가 감지되었습니다. 더 정확한 분석을 위해 바코드 스캐너를 이용해주세요."
            if is_korean
            else "Barcode detected. Please use the barcode scanner for a more accurate analysis."
        ),
        "foodName": "바코드 감지됨" if is_korean else "Barcode detected",
        "ingredients": [],
        "router_category": normalized_category,
    }


def build_not_food_response(category: str, locale: str | None = None) -> Dict[str, Any]:
    is_korean = _is_korean_locale(locale)
    normalized_category = _normalize_router_category(category)
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": (
            "음식이나 영양성분표가 아닌 것 같습니다. 음식 사진을 올려주세요."
            if is_korean
            else "This does not look like food or a nutrition label. Please upload a food image."
        ),
        "foodName": "알 수 없음" if is_korean else "Unknown",
        "ingredients": [],
        "router_category": normalized_category,
    }


def build_router_error_response(error: Exception, locale: str | None = None) -> Dict[str, Any]:
    is_korean = _is_korean_locale(locale)
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": (
            "이미지 분석 중 오류가 발생했습니다."
            if is_korean
            else "An error occurred while analyzing the image."
        ),
        "foodName": "분석 오류" if is_korean else "Analysis error",
        "ingredients": [],
        "error": str(error),
    }
