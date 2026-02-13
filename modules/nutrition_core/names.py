from .constants import FOOD_SYNONYMS


def normalize_food_name(food_name: str) -> list[str]:
    """
    Returns normalized food-name variants for API queries.
    Includes original name plus synonyms and light transformations.
    """
    if not food_name:
        return []

    variants = [food_name]
    lower_name = food_name.lower().strip()

    if lower_name in FOOD_SYNONYMS:
        variants.append(FOOD_SYNONYMS[lower_name])

    for key, value in FOOD_SYNONYMS.items():
        if key in lower_name or lower_name in key:
            if value not in variants:
                variants.append(value)

    transforms = [
        lower_name.replace("korean ", ""),
        lower_name.replace(" dish", ""),
        lower_name.replace(" bowl", ""),
    ]
    for transformed in transforms:
        if transformed != lower_name and transformed not in variants:
            variants.append(transformed)

    return variants

