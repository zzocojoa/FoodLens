"""Pure allergen/language normalization helpers."""

import re

from .constants import ISO_COUNTRY_TO_LANGUAGE, STANDARD_ALLERGENS


def get_language_for_country(iso_code: str) -> str:
    """Return the primary language for a given ISO country code."""
    return ISO_COUNTRY_TO_LANGUAGE.get(iso_code.upper(), "English")


def normalize_allergens(raw_input: str) -> list[str]:
    """
    Normalize free-text allergy input to standard allergen names.

    Example:
    "peanut, 우유, shellfish" -> ["Peanut", "Milk/Dairy", "Shellfish"]
    """
    if not raw_input or raw_input.lower() in ["none", "없음", "no", ""]:
        return []

    tokens = re.split(r"[,;/\s]+", raw_input.lower().strip())

    normalized: list[str] = []
    for token in tokens:
        token = token.strip()
        if token in STANDARD_ALLERGENS:
            allergen = STANDARD_ALLERGENS[token]
            if allergen not in normalized:
                normalized.append(allergen)
        elif token and len(token) > 1:
            # Unknown allergen: keep user intent while normalizing casing.
            formatted = token.capitalize()
            if formatted not in normalized:
                normalized.append(formatted)

    return normalized


def format_allergens_for_prompt(raw_input: str) -> str:
    """Format free-text allergy input for prompt-safe, normalized usage."""
    normalized = normalize_allergens(raw_input)
    if not normalized:
        return "None"
    return ", ".join(normalized)

