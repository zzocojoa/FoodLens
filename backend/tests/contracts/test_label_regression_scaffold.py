import json
import unittest
from pathlib import Path


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

    def test_manifest_has_minimum_20_samples(self):
        manifest = self._load_manifest()
        samples = manifest.get("samples", [])
        self.assertGreaterEqual(len(samples), 20, "Label regression scaffold must include at least 20 samples.")

    def test_manifest_sample_shape_and_uniqueness(self):
        manifest = self._load_manifest()
        samples = manifest.get("samples", [])
        ids = set()

        for idx, sample in enumerate(samples):
            self.assertIsInstance(sample, dict, f"samples[{idx}] must be object")
            for key in ("id", "image_path", "status"):
                self.assertIn(key, sample, f"samples[{idx}] missing key: {key}")

            sample_id = sample["id"]
            self.assertNotIn(sample_id, ids, f"Duplicate sample id: {sample_id}")
            ids.add(sample_id)

            self.assertTrue(str(sample["image_path"]).strip(), f"samples[{idx}].image_path must be non-empty")
            self.assertIn(sample["status"], {"scaffold", "active"}, f"samples[{idx}].status invalid")


if __name__ == "__main__":
    unittest.main()
