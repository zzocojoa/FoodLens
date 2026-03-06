import json
from typing import Any, Dict, Tuple


def _is_korean_locale(locale: str | None) -> bool:
    return bool(locale and locale.strip().lower().startswith("ko"))


def parse_classification_response(response_text: str) -> Tuple[str, float]:
    try:
        classification = json.loads(response_text)
        category = classification.get("category", "NOT_FOOD")
        confidence = classification.get("confidence", 0.0)
        return category, confidence
    except json.JSONDecodeError:
        print(f"[SmartRouter] Failed to parse JSON: {response_text}")
        return "NOT_FOOD", 0.0


def build_barcode_route_response(category: str, locale: str | None = None) -> Dict[str, Any]:
    is_korean = _is_korean_locale(locale)
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": (
            "바코드가 감지되었습니다. 더 정확한 분석을 위해 바코드 스캐너를 이용해주세요."
            if is_korean
            else "Barcode detected. Please use the barcode scanner for a more accurate analysis."
        ),
        "foodName": "바코드 감지됨" if is_korean else "Barcode detected",
        "ingredients": [],
        "router_category": category,
    }


def build_not_food_response(category: str, locale: str | None = None) -> Dict[str, Any]:
    is_korean = _is_korean_locale(locale)
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": (
            "음식이나 영양성분표가 아닌 것 같습니다. 음식 사진을 올려주세요."
            if is_korean
            else "This does not look like food or a nutrition label. Please upload a food image."
        ),
        "foodName": "알 수 없음" if is_korean else "Unknown",
        "ingredients": [],
        "router_category": category,
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
        "error": str(error),
    }
