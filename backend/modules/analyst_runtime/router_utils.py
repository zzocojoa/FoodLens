import json
from typing import Any, Dict, Tuple


def parse_classification_response(response_text: str) -> Tuple[str, float]:
    try:
        classification = json.loads(response_text)
        category = classification.get("category", "NOT_FOOD")
        confidence = classification.get("confidence", 0.0)
        return category, confidence
    except json.JSONDecodeError:
        print(f"[SmartRouter] Failed to parse JSON: {response_text}")
        return "NOT_FOOD", 0.0


def build_barcode_route_response(category: str) -> Dict[str, Any]:
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": "바코드가 감지되었습니다. 더 정확한 분석을 위해 바코드 스캐너를 이용해주세요.",
        "foodName": "바코드 감지됨",
        "ingredients": [],
        "router_category": category,
    }


def build_not_food_response(category: str) -> Dict[str, Any]:
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": "음식이나 영양성분표가 아닌 것 같습니다. 음식 사진을 올려주세요.",
        "foodName": "알 수 없음",
        "ingredients": [],
        "router_category": category,
    }


def build_router_error_response(error: Exception) -> Dict[str, Any]:
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": "이미지 분석 중 오류가 발생했습니다.",
        "error": str(error),
    }

