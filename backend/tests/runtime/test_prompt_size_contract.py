import unittest
from typing import Final

from backend.modules.analyst_core.prompts import (
    ANALYSIS_PROMPT_VERSION,
    BARCODE_INGREDIENTS_PROMPT_VERSION,
    LABEL_2PASS_PROMPT_VERSION,
    build_analysis_prompt,
    build_barcode_ingredients_prompt,
    build_label_assess_prompt,
    build_label_prompt,
)


FOOD_PROMPT_CHAR_BUDGET: Final[int] = 1800
LABEL_EXTRACT_PROMPT_CHAR_BUDGET: Final[int] = 1220
LABEL_ASSESS_PROMPT_CHAR_BUDGET: Final[int] = 1340
BARCODE_PROMPT_CHAR_BUDGET: Final[int] = 1100
PROMPT_ALLERGIES: Final[str] = "Peanut, Tree Nut, Milk/Dairy, Shellfish, Wheat/Gluten"
LONG_PROMPT_ALLERGIES: Final[str] = (
    "Peanut, Tree Nut, Milk/Dairy, Shellfish, Fish, Egg, Soy, Wheat/Gluten, "
    "Sesame, Mustard, Buckwheat, Sulfites, Kiwi, Banana"
)
PROMPT_COUNTRY: Final[str] = "KR"
PROMPT_LOCALE: Final[str] = "ko-KR"
BARCODE_INGREDIENTS: Final[tuple[str, ...]] = (
    "wheat flour",
    "milk powder",
    "almond slice",
    "sugar",
    "soy lecithin",
    "salt",
)


def _render_prompts() -> dict[str, str]:
    return {
        "food": build_analysis_prompt(PROMPT_ALLERGIES, PROMPT_COUNTRY),
        "label_extract": build_label_prompt(PROMPT_ALLERGIES, PROMPT_LOCALE, PROMPT_COUNTRY),
        "label_assess": build_label_assess_prompt(
            PROMPT_ALLERGIES,
            list(BARCODE_INGREDIENTS),
            PROMPT_LOCALE,
            PROMPT_COUNTRY,
        ),
        "barcode": build_barcode_ingredients_prompt(PROMPT_ALLERGIES, list(BARCODE_INGREDIENTS), PROMPT_LOCALE),
    }


def _render_optimized_prompts() -> dict[str, str]:
    return {
        "food": build_analysis_prompt(PROMPT_ALLERGIES, PROMPT_COUNTRY),
        "barcode": build_barcode_ingredients_prompt(PROMPT_ALLERGIES, list(BARCODE_INGREDIENTS), PROMPT_LOCALE),
    }


class PromptSizeContractTests(unittest.TestCase):
    def test_optimized_rendered_prompts_have_no_broad_leading_indentation(self) -> None:
        for prompt_name, prompt in _render_optimized_prompts().items():
            with self.subTest(prompt_name=prompt_name):
                self.assertFalse(prompt.startswith("\n"))
                self.assertFalse(prompt.endswith("\n"))
                self.assertNotRegex(prompt, r"(?m)^ {8,}\S")

    def test_analysis_prompt_does_not_duplicate_raw_result_locale_keys(self) -> None:
        prompt = build_analysis_prompt(PROMPT_ALLERGIES, PROMPT_COUNTRY)

        self.assertEqual(prompt.count("`raw_result`"), 1)
        self.assertEqual(prompt.count("raw_result_en"), 1)
        self.assertEqual(prompt.count("raw_result_ko"), 1)

    def test_analysis_prompt_includes_schema_safety_alignment_rules(self) -> None:
        prompt = build_analysis_prompt(PROMPT_ALLERGIES, PROMPT_COUNTRY)

        self.assertEqual(ANALYSIS_PROMPT_VERSION, "food-v3.3.3-schema-safety")
        self.assertIn("English canonical lookup key", prompt)
        self.assertIn("`name_en`, `name_ko`, `bbox`, and `isAllergen`", prompt)
        self.assertIn("`foodOrigin` must be exactly one of", prompt)
        self.assertIn("`korean`, `western`, `asian`, `single_ingredient`, `other`, `unknown`", prompt)
        self.assertIn("Multi-food photo", prompt)
        self.assertIn("Hidden allergen possibilities", prompt)
        self.assertIn("`isAllergen=false`, set `safetyStatus=CAUTION`", prompt)
        self.assertIn("`ymin < ymax`, `xmin < xmax`", prompt)

    def test_unvalidated_label_compaction_stays_disabled(self) -> None:
        self.assertEqual(LABEL_2PASS_PROMPT_VERSION, "label-v1.2-2pass-locale-country")
        self.assertEqual(BARCODE_INGREDIENTS_PROMPT_VERSION, "barcode-v1.1-allergen-compact")

    def test_prompt_char_budgets_are_enforced(self) -> None:
        budgets: dict[str, int] = {
            "food": FOOD_PROMPT_CHAR_BUDGET,
            "label_extract": LABEL_EXTRACT_PROMPT_CHAR_BUDGET,
            "label_assess": LABEL_ASSESS_PROMPT_CHAR_BUDGET,
            "barcode": BARCODE_PROMPT_CHAR_BUDGET,
        }

        for prompt_name, prompt in _render_prompts().items():
            with self.subTest(prompt_name=prompt_name):
                self.assertLessEqual(len(prompt), budgets[prompt_name])

    def test_analysis_prompt_budget_handles_long_realistic_allergy_profile(self) -> None:
        prompt = build_analysis_prompt(LONG_PROMPT_ALLERGIES, PROMPT_COUNTRY)

        self.assertLessEqual(len(prompt), FOOD_PROMPT_CHAR_BUDGET)


if __name__ == "__main__":
    unittest.main()
