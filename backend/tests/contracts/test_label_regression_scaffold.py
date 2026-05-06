import json
import unittest
import hashlib
from pathlib import Path

from PIL import Image

from backend.modules.contracts.analysis_response import AnalysisResponseContract


MANIFEST_PATH = (
    Path(__file__).resolve().parent.parent
    / "fixtures"
    / "label_regression"
    / "scaffold_manifest.json"
)
CANONICAL_ALLERGENS = {"milk", "egg", "peanut", "tree nut", "wheat", "soy", "fish", "shellfish", "sesame"}
PROVENANCE_ASSISTANCE_VALUES = {"none", "ai_visual_review"}
PROVENANCE_CONFIDENCE_VALUES = {"low", "medium", "high"}
REQUIRED_EXPECTED_SAFETY_STATUSES: set[str] = {"SAFE", "CAUTION", "DANGER"}


class LabelRegressionScaffoldTests(unittest.TestCase):
    def _load_manifest(self) -> dict:
        with MANIFEST_PATH.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    def test_manifest_has_minimum_20_active_samples(self):
        manifest = self._load_manifest()
        samples = manifest.get("samples", [])
        active = [sample for sample in samples if sample.get("status") == "active"]
        self.assertGreaterEqual(len(active), 20, "Label regression set must include at least 20 active samples.")

    def test_manifest_active_samples_cover_required_safety_statuses(self) -> None:
        manifest = self._load_manifest()
        samples = manifest.get("samples", [])
        active = [sample for sample in samples if sample.get("status") == "active"]
        expected_statuses: set[str] = {str(sample.get("expected_safetyStatus", "")).strip() for sample in active}
        missing_statuses: list[str] = sorted(REQUIRED_EXPECTED_SAFETY_STATUSES - expected_statuses)

        self.assertEqual(
            [],
            missing_statuses,
            "Active label regression manifest must include SAFE, CAUTION, and DANGER expected_safetyStatus values.",
        )

    def test_manifest_sample_shape_and_uniqueness(self):
        manifest = self._load_manifest()
        samples = manifest.get("samples", [])
        ids = set()

        for idx, sample in enumerate(samples):
            self.assertIsInstance(sample, dict, f"samples[{idx}] must be object")
            for key in ("id", "golden_json_path", "image_path", "status", "expected_safetyStatus", "min_ingredients_count"):
                self.assertIn(key, sample, f"samples[{idx}] missing key: {key}")

            sample_id = sample["id"]
            self.assertNotIn(sample_id, ids, f"Duplicate sample id: {sample_id}")
            ids.add(sample_id)

            self.assertTrue(str(sample["golden_json_path"]).strip(), f"samples[{idx}].golden_json_path must be non-empty")
            self.assertTrue(str(sample["image_path"]).strip(), f"samples[{idx}].image_path must be non-empty")
            self.assertIn(sample["status"], {"scaffold", "active"}, f"samples[{idx}].status invalid")
            self.assertIn(
                sample["expected_safetyStatus"],
                REQUIRED_EXPECTED_SAFETY_STATUSES,
                f"samples[{idx}].expected_safetyStatus invalid",
            )

    def test_manifest_active_samples_have_human_label_shape(self):
        manifest = self._load_manifest()
        samples = [sample for sample in manifest.get("samples", []) if sample.get("status") == "active"]
        failures: list[dict] = []

        for sample in samples:
            sample_id = sample["id"]
            human_label = sample.get("human_label")
            fields: list[str] = []

            if not isinstance(human_label, dict):
                failures.append({"sample_id": sample_id, "fields": ["human_label"]})
                continue

            annotation_status = human_label.get("annotation_status")
            if annotation_status not in {"needs_human_review", "reviewed"}:
                fields.append("annotation_status")

            allergy_profile = human_label.get("allergy_profile")
            if not isinstance(allergy_profile, str) or not allergy_profile.strip():
                fields.append("allergy_profile")

            for list_field in ("expected_allergens", "expected_risk_ingredients"):
                values = human_label.get(list_field)
                if not isinstance(values, list):
                    fields.append(list_field)
                    continue
                normalized_values = []
                for value in values:
                    if not isinstance(value, str) or not value.strip():
                        fields.append(list_field)
                        break
                    normalized_values.append(value.strip().casefold())
                if len(normalized_values) != len(set(normalized_values)):
                    fields.append(f"{list_field}:duplicate")

            expected_allergens = human_label.get("expected_allergens")
            if isinstance(expected_allergens, list):
                unknown_allergens = sorted(str(value) for value in expected_allergens if value not in CANONICAL_ALLERGENS)
                if unknown_allergens:
                    fields.append(f"expected_allergens:unknown:{','.join(unknown_allergens)}")

            review_notes = human_label.get("review_notes")
            if not str(review_notes or "").strip():
                fields.append("review_notes")

            provenance = human_label.get("provenance")
            if not isinstance(provenance, dict):
                fields.append("provenance")
            else:
                reviewed_by = provenance.get("reviewed_by")
                if not isinstance(reviewed_by, str) or not reviewed_by.strip():
                    fields.append("provenance.reviewed_by")
                assistance = provenance.get("assistance")
                if assistance not in PROVENANCE_ASSISTANCE_VALUES:
                    fields.append("provenance.assistance")
                source = provenance.get("source")
                if not isinstance(source, str) or not source.strip():
                    fields.append("provenance.source")
                confidence = provenance.get("confidence")
                if confidence not in PROVENANCE_CONFIDENCE_VALUES:
                    fields.append("provenance.confidence")

            if fields:
                failures.append({"sample_id": sample_id, "fields": fields})

        if failures:
            self.fail(f"Human label manifest shape mismatches: {json.dumps(failures, ensure_ascii=False)}")

    def test_label_regression_active_source_images_are_decodable(self):
        manifest = self._load_manifest()
        samples = [sample for sample in manifest.get("samples", []) if sample.get("status") == "active"]
        failures: list[dict] = []

        for sample in samples:
            sample_id = sample["id"]
            image_path = MANIFEST_PATH.parent / sample["image_path"]
            fields: list[str] = []

            if not image_path.exists():
                fields.append("missing_image")
                failures.append({"sample_id": sample_id, "fields": fields})
                continue

            image_bytes = image_path.read_bytes()
            expected_sha256 = str(sample.get("image_sha256", "")).strip()
            if hashlib.sha256(image_bytes).hexdigest() != expected_sha256:
                fields.append("image_sha256")

            with Image.open(image_path) as image:
                image.verify()
            with Image.open(image_path) as image:
                width, height = image.size

            if width != int(sample.get("image_width", 0)):
                fields.append("image_width")
            if height != int(sample.get("image_height", 0)):
                fields.append("image_height")
            if len(image_bytes) != int(sample.get("image_bytes", 0)):
                fields.append("image_bytes")

            if fields:
                failures.append({"sample_id": sample_id, "fields": fields})

        print(f"[LabelRegression] checked_images={len(samples)}")
        if failures:
            self.fail(f"Label image fixture mismatches: {json.dumps(failures, ensure_ascii=False)}")

    def test_label_regression_source_images_do_not_include_gps_metadata(self):
        manifest = self._load_manifest()
        samples = [sample for sample in manifest.get("samples", []) if sample.get("status") == "active"]
        failures: list[dict] = []

        for sample in samples:
            sample_id = sample["id"]
            image_path = MANIFEST_PATH.parent / sample["image_path"]
            if not image_path.exists():
                continue
            with Image.open(image_path) as image:
                exif = image.getexif()
                gps_info = exif.get(34853) if exif else None
            if gps_info:
                failures.append({"sample_id": sample_id, "fields": ["gps_exif"]})

        if failures:
            self.fail(f"Label image fixture privacy metadata found: {json.dumps(failures, ensure_ascii=False)}")

    def test_label_regression_active_golden_samples(self):
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
