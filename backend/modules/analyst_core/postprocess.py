"""Post-processing helpers for analyst responses."""
from typing import Any, Generator

from modules.nutrition import lookup_nutrition

NUTRIENT_KEYS = ("calories", "protein", "carbs", "fat", "fiber", "sodium", "sugar")
ERROR_NAMES = {"Error Analyzing Food", "Not Food", "분석 오류"}
DEFAULT_SERVING_SIZE = "100g (total)"
DEFAULT_MULTI_SOURCE = "Multiple Sources"
UNKNOWN_SOURCE = "Unknown"
DEFAULT_ORIGIN = "unknown"


def _build_total_nutrition() -> dict[str, Any]:
    return {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "fiber": 0,
        "sodium": 0,
        "sugar": 0,
        "servingSize": DEFAULT_SERVING_SIZE,
        "dataSource": DEFAULT_MULTI_SOURCE,
    }


def _iter_unique_ingredients(ingredients: list[Any]) -> Generator[tuple[dict[str, Any], str], None, None]:
    seen_names = set()
    for ingredient in ingredients:
        if not isinstance(ingredient, dict):
            continue

        ing_name = ingredient.get("name", "").strip()
        if not ing_name:
            continue

        normalized_name = ing_name.lower()
        if normalized_name in seen_names:
            continue
        seen_names.add(normalized_name)
        yield ingredient, ing_name


def _accumulate_total_nutrition(total_nutrition: dict[str, Any], nutrition_data: dict[str, Any]) -> None:
    for key in NUTRIENT_KEYS:
        if nutrition_data.get(key) is not None:
            total_nutrition[key] = (total_nutrition.get(key) or 0) + float(nutrition_data[key])


def _build_fallback_name_variants(result: dict[str, Any]) -> list[str]:
    return [
        result.get("foodName_en") or "",
        result.get("foodName") or "",
        str(result.get("canonicalFoodId", "")).replace("_", " "),
    ]


def enrich_with_nutrition(result: dict[str, Any]) -> dict[str, Any]:
    """Enrich analysis result with per-ingredient and total nutrition."""
    food_origin = result.get("foodOrigin", DEFAULT_ORIGIN)

    if result.get("foodName", "") in ERROR_NAMES:
        return result

    total_nutrition = _build_total_nutrition()
    sources = set()
    has_any_nutrition = False

    ingredients = result.get("ingredients", [])
    unique_ingredients = []

    for ingredient, ing_name in _iter_unique_ingredients(ingredients):
        nutrition_data = lookup_nutrition(ing_name, food_origin)

        if nutrition_data and nutrition_data.get("calories") is not None:
            ingredient["nutrition"] = nutrition_data
            has_any_nutrition = True

            _accumulate_total_nutrition(total_nutrition, nutrition_data)

            sources.add(nutrition_data.get("dataSource", "Unknown"))
            print(f"  ↳ {ing_name}: {nutrition_data.get('calories')} kcal ({nutrition_data.get('dataSource')})")
        else:
            print(f"  ↳ {ing_name}: No nutrition data found")

        unique_ingredients.append(ingredient)

    result["ingredients"] = unique_ingredients

    if has_any_nutrition:
        total_nutrition["dataSource"] = " + ".join(sources) if sources else UNKNOWN_SOURCE
        result["nutrition"] = total_nutrition
        print(f"Total Nutrition: {total_nutrition['calories']:.1f} kcal from {len(sources)} source(s)")
    else:
        for name in _build_fallback_name_variants(result):
            if not name:
                continue
            nutrition_data = lookup_nutrition(name, food_origin)
            if nutrition_data and nutrition_data.get("calories") is not None:
                result["nutrition"] = nutrition_data
                print(f"Nutrition Data ({nutrition_data.get('dataSource')}): fallback to '{name}'")
                break

    return result
