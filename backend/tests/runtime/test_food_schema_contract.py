import unittest
from typing import get_args

from backend.modules.analyst_core.schemas import FOOD_ORIGIN_ENUM, build_food_response_schema
from backend.modules.contracts.analysis_response import FoodOrigin


class FoodSchemaContractTests(unittest.TestCase):
    def test_food_schema_requires_origin_enum(self) -> None:
        schema = build_food_response_schema()

        self.assertIn("foodOrigin", schema["required"])
        self.assertEqual(schema["properties"]["foodOrigin"]["enum"], FOOD_ORIGIN_ENUM)
        self.assertEqual(tuple(FOOD_ORIGIN_ENUM), get_args(FoodOrigin))

    def test_food_schema_requires_canonical_and_localized_ingredient_names(self) -> None:
        schema = build_food_response_schema()
        ingredient_schema = schema["properties"]["ingredients"]["items"]

        self.assertEqual(
            ingredient_schema["required"],
            ["name", "name_en", "name_ko", "bbox", "isAllergen"],
        )
        self.assertEqual(ingredient_schema["properties"]["name"]["type"], "STRING")
        self.assertEqual(ingredient_schema["properties"]["name_en"]["type"], "STRING")
        self.assertEqual(ingredient_schema["properties"]["name_ko"]["type"], "STRING")


if __name__ == "__main__":
    unittest.main()
