"""Post-processing helpers for analyst responses."""

from modules.nutrition import lookup_nutrition


def enrich_with_nutrition(result: dict) -> dict:
    """Enrich analysis result with per-ingredient and total nutrition."""
    food_origin = result.get("foodOrigin", "unknown")

    error_names = ["Error Analyzing Food", "Not Food", "분석 오류"]
    if result.get("foodName", "") in error_names:
        return result

    total_nutrition = {
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "fiber": 0,
        "sodium": 0,
        "sugar": 0,
        "servingSize": "100g (total)",
        "dataSource": "Multiple Sources",
    }
    sources = set()
    has_any_nutrition = False

    ingredients = result.get("ingredients", [])
    unique_ingredients = []
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

        nutrition_data = lookup_nutrition(ing_name, food_origin)

        if nutrition_data and nutrition_data.get("calories") is not None:
            ingredient["nutrition"] = nutrition_data
            has_any_nutrition = True

            for key in ["calories", "protein", "carbs", "fat", "fiber", "sodium", "sugar"]:
                if nutrition_data.get(key) is not None:
                    total_nutrition[key] = (total_nutrition.get(key) or 0) + float(nutrition_data[key])

            sources.add(nutrition_data.get("dataSource", "Unknown"))
            print(f"  ↳ {ing_name}: {nutrition_data.get('calories')} kcal ({nutrition_data.get('dataSource')})")
        else:
            print(f"  ↳ {ing_name}: No nutrition data found")

        unique_ingredients.append(ingredient)

    result["ingredients"] = unique_ingredients

    if has_any_nutrition:
        total_nutrition["dataSource"] = " + ".join(sources) if sources else "Unknown"
        result["nutrition"] = total_nutrition
        print(f"Total Nutrition: {total_nutrition['calories']:.1f} kcal from {len(sources)} source(s)")
    else:
        name_variants = [
            result.get("foodName_en"),
            result.get("foodName"),
            result.get("canonicalFoodId", "").replace("_", " "),
        ]
        for name in name_variants:
            if not name:
                continue
            nutrition_data = lookup_nutrition(name, food_origin)
            if nutrition_data and nutrition_data.get("calories") is not None:
                result["nutrition"] = nutrition_data
                print(f"Nutrition Data ({nutrition_data.get('dataSource')}): fallback to '{name}'")
                break

    return result

