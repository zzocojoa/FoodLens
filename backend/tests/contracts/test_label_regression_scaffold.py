import json
import unittest
from pathlib import Path

from backend.modules.contracts.analysis_response import AnalysisResponseContract


MANIFEST_PATH = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "label_regression"
    / "scaffold_manifest.json"
)


class LabelRegressionScaffoldTests(unittest.TestCase):
    def _load_manifest(self) -> dict:
        with MANIFEST_PATH.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    def test_manifest_has_minimum_20_active_samples(self):
        manifest = self._load_manifest()
        samples = manifest.get("samples", [])
        active = [sample for sample in samples if sample.get("status") == "active"]
        self.assertGreaterEqual(len(active), 20, "Label regression set must include at least 20 active samples.")

    def test_manifest_sample_shape_and_uniqueness(self):
        manifest = self._load_manifest()
        samples = manifest.get("samples", [])
        ids = set()

        for idx, sample in enumerate(samples):
            self.assertIsInstance(sample, dict, f"samples[{idx}] must be object")
            for key in ("id", "golden_json_path", "status", "expected_safetyStatus", "min_ingredients_count"):
                self.assertIn(key, sample, f"samples[{idx}] missing key: {key}")

            sample_id = sample["id"]
            self.assertNotIn(sample_id, ids, f"Duplicate sample id: {sample_id}")
            ids.add(sample_id)

            self.assertTrue(str(sample["golden_json_path"]).strip(), f"samples[{idx}].golden_json_path must be non-empty")
            self.assertIn(sample["status"], {"scaffold", "active"}, f"samples[{idx}].status invalid")

    def test_label_regression_20_golden_samples(self):
        """
        Flaky tolerance rules:
        - ingredient count is lower-bound only: actual >= min_ingredients_count
        - nutrition values are not exact-matched, only required keys existence is validated
        """
        manifest = self._load_manifest()
        samples = [sample for sample in manifest.get("samples", []) if sample.get("status") == "active"]
        failures: list[dict] = []

        for sample in samples:
            sample_id = sample["id"]
            golden_path = MANIFEST_PATH.parent / sample["golden_json_path"]
            fields: list[str] = []

            if not golden_path.exists():
                fields.append("missing_golden_json")
                failures.append({"sample_id": sample_id, "fields": fields})
                continue

            with golden_path.open("r", encoding="utf-8") as fp:
                payload = json.load(fp)

            try:
                model = AnalysisResponseContract.model_validate(payload)
            except Exception:
                fields.append("contract_validation_failed")
                failures.append({"sample_id": sample_id, "fields": fields})
                continue

            normalized = model.model_dump(exclude_none=True)

            expected_status = sample["expected_safetyStatus"]
            if normalized.get("safetyStatus") != expected_status:
                fields.append("safetyStatus")

            ingredients = normalized.get("ingredients", [])
            if len(ingredients) < int(sample["min_ingredients_count"]):
                fields.append("ingredients_count")

            nutrition = normalized.get("nutrition")
            required_nutrition_keys = sample.get("required_nutrition_keys", [])
            if not isinstance(nutrition, dict):
                fields.append("nutrition")
            else:
                missing_nutrition = [key for key in required_nutrition_keys if key not in nutrition]
                if missing_nutrition:
                    fields.append(f"nutrition_missing:{','.join(missing_nutrition)}")

            if fields:
                failures.append({"sample_id": sample_id, "fields": fields})

        print(f"[LabelRegression] checked_samples={len(samples)}")
        if failures:
            self.fail(f"Label regression mismatches: {json.dumps(failures, ensure_ascii=False)}")


if __name__ == "__main__":
    unittest.main()
