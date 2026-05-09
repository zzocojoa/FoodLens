"""Prompt builders for analyst workflows."""
import textwrap
from typing import Final


def _normalize_prompt_template(template: str) -> str:
    return textwrap.dedent(template).strip()


LABEL_PROMPT_VERSION: Final[str] = "label-v1.1-locale-country"
LABEL_2PASS_PROMPT_VERSION: Final[str] = "label-v1.2-2pass-locale-country"
ANALYSIS_PROMPT_VERSION: Final[str] = "food-v3.3.3-schema-safety"
BARCODE_INGREDIENTS_PROMPT_VERSION: Final[str] = "barcode-v1.1-allergen-compact"

ANALYSIS_PROMPT_TEMPLATE: Final[str] = _normalize_prompt_template(
    """
# Food Lens Expert Engine v3.3.3
Return one raw JSON object matching the provided schema. No markdown, prose, code fences, schema explanation, or duplicate keys.

Context:
- Allergy Profile: `{allergy_info}`
- Country ISO: `{iso_current_country}`

Rules:
- Identify the most likely specific main dish; never return "Unknown Dish".
- Multi-food photo: `foodName` is the main entree/prominent dish; include visible sides, toppings, sauces, marinades, glazes, and broth as `ingredients` when needed for safety.
- Use specific proper nouns, not generic names like "Lunch", "Plate", or "Appetizer".
- `foodOrigin` must be exactly one of `korean`, `western`, `asian`, `single_ingredient`, `other`, `unknown`.
- Provide `foodName_en`, `foodName_ko`, integer `confidence` 0-100, and `translationCard.language={iso_current_country}`.
- Keep `raw_result`, `raw_result_en`, and `raw_result_ko` as compact 1-sentence safety summaries.
- Ingredients: visible only; no hidden ingredient inference.
- Each ingredient needs `name` as an English canonical lookup key, plus `name_en`, `name_ko`, `bbox`, and `isAllergen`.
- `bbox` = `[ymin, xmin, ymax, xmax]`, 0-1000 integers, inside image, `ymin < ymax`, `xmin < xmax`.
- Set `isAllergen=true` only for a visible ingredient clearly matching the allergy profile.
- Hidden allergen possibilities in sauce, batter, noodles, broth, or cross-contact: keep `isAllergen=false`, set `safetyStatus=CAUTION`, mention briefly.
- `safetyStatus`: `SAFE` no visible or likely allergen risk; `CAUTION` ambiguity/hidden risk; `DANGER` visible confirmed allergen.
- Prefer `CAUTION` over false `SAFE` or false `DANGER` when uncertain.
"""
)

LABEL_PROMPT_TEMPLATE: Final[str] = """
        # [System Prompt: Food Lens Label Extract Engine v1.2]

        **ROLE**
        You extract compact structured data from a packaged-food nutrition label image.

        **CONTEXT**
        - User Locale: `{locale}`
        - User Country (ISO): `{iso_current_country}`

        **TASK**
        1. Extract the visible product name.
        2. Extract nutrition facts only from visible text.
        3. Extract the ingredient list exactly as visible, split into ingredient items.

        **RULES**
        - Return extraction only. Do not assess allergen risk or safety.
        - Do not infer hidden ingredients, missing nutrition values, or serving sizes.
        - Use null for missing numeric nutrition values.
        - Normalize nutrition numbers only when the unit is visible.
        - Set `dataSource` to `OCR_Label`.
        - For each ingredient, provide only `name`.
        - Keep the response compact and match the provided response schema.
        - Include `ingredients` whenever visible. Omit optional fields when they are not visible.
        - Include `raw_result` only when a short `{locale}` summary is useful.
        - Return one raw JSON object only. No markdown, prose, or schema explanation.
        """

BARCODE_PROMPT_TEMPLATE: Final[str] = _normalize_prompt_template(
    """
You are a food allergen analyst. Analyze this packaged-food ingredient list against the user's allergens.

**CONTEXT**
- User Allergy Profile: {normalized_allergens}
- User Locale: {locale}
- Ingredient List: [{ingredients_str}]

**RULES**
1. For each ingredient, determine if it is or contains any user allergen.
2. Be thorough: "밀가루" matches "Wheat/Gluten"; "아몬드슬라이스" matches "Tree Nut (Almond)".
3. Understand Korean food terms and packaged-food category names.
4. Mark vague seafood categories such as "기타 수산물가공품" as CAUTION for Shellfish/Fish allergies.
5. Mark vague categories such as "복합조미식품" or "곡류가공품" as CAUTION when allergen-derived content is plausible.
6. Set `safetyStatus` to DANGER for confirmed allergen matches, CAUTION for ambiguity, or SAFE when no allergens are detected.
7. Write a concise {coach_message_language} `coachMessage` in 1-2 sentences.

Return JSON only and match the provided response schema.
"""
)

LABEL_ASSESS_PROMPT_TEMPLATE: Final[str] = """
        # [System Prompt: Food Lens Label Risk Assess Engine v1.2]

        **ROLE**
        You assess allergen risk from an already extracted ingredient list.

        **CONTEXT**
        - User Allergy Profile: {normalized_allergens}
        - User Locale: {locale}
        - User Country (ISO): {iso_current_country}
        - Extracted Ingredients: [{ingredients_str}]

        **TASK**
        Judge only allergen risk for the extracted ingredients.

        **RULES**
        - Return risk assessment only. Do not extract nutrition, product names, or label text.
        - Mark an ingredient as allergen when it is or clearly contains a user allergen.
        - Use CAUTION for ambiguous ingredients that may contain or derive from a user allergen.
        - Use DANGER if any ingredient is a confirmed allergen match.
        - Use CAUTION if no confirmed match exists but any ingredient is ambiguous.
        - Use SAFE only when no ingredient matches and no ingredient is ambiguous.
        - Keep `riskReason` concise.
        - `coachMessage` is optional; include it only when it adds a short safety summary.
        - Match the provided response schema.
        - Return one raw JSON object only. No markdown, prose, or schema explanation.
        """


def _render_prompt(template: str, **kwargs: object) -> str:
    return template.format(**kwargs)


def _format_ingredients_for_prompt(ingredients: list[str]) -> str:
    if not ingredients:
        return ""
    return ", ".join(f'"{ingredient}"' for ingredient in ingredients)


def build_analysis_prompt(allergy_info: str, iso_current_country: str) -> str:
    return _render_prompt(
        ANALYSIS_PROMPT_TEMPLATE,
        allergy_info=allergy_info,
        iso_current_country=iso_current_country,
    )


def build_label_prompt(allergy_info: str, locale: str, iso_current_country: str) -> str:
    return _render_prompt(
        LABEL_PROMPT_TEMPLATE,
        allergy_info=allergy_info,
        locale=locale,
        iso_current_country=iso_current_country,
    )


def build_barcode_ingredients_prompt(
    normalized_allergens: str,
    ingredients: list[str],
    locale: str | None = None,
) -> str:
    normalized_locale = (locale or "").strip().lower()
    coach_message_language = "Korean" if normalized_locale.startswith("ko") else "English"
    return _render_prompt(
        BARCODE_PROMPT_TEMPLATE,
        normalized_allergens=normalized_allergens,
        locale=locale or "en-US",
        coach_message_language=coach_message_language,
        ingredients_str=_format_ingredients_for_prompt(ingredients),
    )


def build_label_assess_prompt(
    normalized_allergens: str,
    ingredients: list[str],
    locale: str,
    iso_current_country: str,
) -> str:
    return _render_prompt(
        LABEL_ASSESS_PROMPT_TEMPLATE,
        normalized_allergens=normalized_allergens,
        ingredients_str=_format_ingredients_for_prompt(ingredients),
        locale=locale,
        iso_current_country=iso_current_country,
    )
