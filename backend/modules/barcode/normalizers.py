from typing import Any, Dict, Optional

from .constants import INGREDIENT_BLACKLIST


def parse_float(value: Any) -> float:
    try:
        return float(value)
    except (ValueError, TypeError):
        return 0.0


def is_nutrition_missing(data: Dict[str, Any]) -> bool:
    """Checks if C005 data has placeholder/zero nutrition info."""
    calories = parse_float(data.get("NUTR_CONT1"))
    return calories <= 0.0


def filter_ingredients(ingredients: list[str]) -> list[str]:
    filtered: list[str] = []
    for ingredient in ingredients:
        cleaned = ingredient.strip()
        if cleaned and cleaned not in INGREDIENT_BLACKLIST:
            filtered.append(cleaned)
    return filtered


def parse_ingredients_datago(raw_str: Optional[str]) -> list[str]:
    if not raw_str:
        return []
    raw_list = [item.strip() for item in raw_str.split(",") if item.strip()]
    return filter_ingredients(raw_list)


def parse_ingredients_off(data: Dict[str, Any]) -> list[str]:
    tags = data.get("ingredients_original_tags") or data.get("ingredients_hierarchy")
    if tags and isinstance(tags, list):
        raw_list = [tag.replace("en:", "").replace("Ko:", "").replace("-", " ") for tag in tags]
        return filter_ingredients(raw_list)

    text = data.get("ingredients_text")
    if text:
        raw_list = [item.strip() for item in text.split(",") if item.strip()]
        return filter_ingredients(raw_list)

    return []


def normalize_datago(data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "food_name": data.get("PRDLST_NM", "Unknown Product"),
        "calories": parse_float(data.get("NUTR_CONT1")),
        "carbs": parse_float(data.get("NUTR_CONT2")),
        "protein": parse_float(data.get("NUTR_CONT3")),
        "fat": parse_float(data.get("NUTR_CONT4")),
        "ingredients": parse_ingredients_datago(data.get("RAWMTRL_NM")),
        "source": "BARCODE_DATAGO",
        "raw_data": data,
    }


def normalize_off(data: Dict[str, Any]) -> Dict[str, Any]:
    nutriments = data.get("nutriments", {})
    return {
        "food_name": data.get("product_name", data.get("product_name_en", "Unknown Product")),
        "calories": nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal"),
        "carbs": nutriments.get("carbohydrates_100g") or nutriments.get("carbohydrates"),
        "protein": nutriments.get("proteins_100g") or nutriments.get("proteins"),
        "fat": nutriments.get("fat_100g") or nutriments.get("fat"),
        "ingredients": parse_ingredients_off(data),
        "source": "BARCODE_OFF",
        "image_url": data.get("image_url"),
        "raw_data": data,
    }

