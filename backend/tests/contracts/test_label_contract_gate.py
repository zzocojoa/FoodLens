import json
import unittest
from pathlib import Path


FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"
LABEL_SNAPSHOT_PATH = FIXTURE_DIR / "analyze_label_response.snapshot.json"
VALID_SAFETY_STATUS = {"SAFE", "CAUTION", "DANGER"}
REQUIRED_NUTRITION_KEYS = {
    "calories",
    "protein",
    "carbs",
    "fat",
    "fiber",
    "sodium",
    "sugar",
    "servingSize",
    "dataSource",
}


class LabelContractGateTests(unittest.TestCase):
    def _load_snapshot(self) -> dict:
        with LABEL_SNAPSHOT_PATH.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    def test_label_snapshot_has_required_top_level_fields(self):
        payload = self._load_snapshot()
        for key in ("foodName", "safetyStatus", "ingredients", "nutrition"):
            self.assertIn(key, payload, f"Missing top-level field: {key}")

    def test_label_snapshot_safety_status_enum(self):
        payload = self._load_snapshot()
        self.assertIn(payload.get("safetyStatus"), VALID_SAFETY_STATUS)

    def test_label_snapshot_nutrition_shape(self):
        payload = self._load_snapshot()
        nutrition = payload.get("nutrition")
        self.assertIsInstance(nutrition, dict, "nutrition must be an object")
        self.assertTrue(REQUIRED_NUTRITION_KEYS.issubset(set(nutrition.keys())))

    def test_label_snapshot_ingredients_shape(self):
        payload = self._load_snapshot()
        ingredients = payload.get("ingredients")
        self.assertIsInstance(ingredients, list)
        self.assertGreater(len(ingredients), 0, "ingredients must contain at least one item")

        for idx, ingredient in enumerate(ingredients):
            self.assertIsInstance(ingredient, dict, f"ingredient[{idx}] must be an object")
            self.assertIn("name", ingredient, f"ingredient[{idx}] missing name")
            self.assertIn("isAllergen", ingredient, f"ingredient[{idx}] missing isAllergen")
            self.assertIn("name_en", ingredient, f"ingredient[{idx}] missing name_en")
            self.assertIn("name_ko", ingredient, f"ingredient[{idx}] missing name_ko")
            self.assertIsInstance(ingredient["isAllergen"], bool, f"ingredient[{idx}].isAllergen must be bool")


if __name__ == "__main__":
    unittest.main()
