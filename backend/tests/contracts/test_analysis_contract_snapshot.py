import json
import unittest
from pathlib import Path

from backend.modules.contracts.analysis_response import AnalysisResponseContract


FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _load_json(filename: str) -> dict:
    with (FIXTURE_DIR / filename).open("r", encoding="utf-8") as fp:
        return json.load(fp)


class AnalysisContractSnapshotTests(unittest.TestCase):
    def _validate_and_normalize(self, payload: dict) -> dict:
        model = AnalysisResponseContract.model_validate(payload)
        return model.model_dump(exclude_none=True)

    def test_analyze_snapshot_contract(self):
        snapshot = _load_json("analyze_response.snapshot.json")
        normalized = self._validate_and_normalize(snapshot)
        self.assertDictEqual(normalized, snapshot)

    def test_analyze_label_snapshot_contract(self):
        snapshot = _load_json("analyze_label_response.snapshot.json")
        normalized = self._validate_and_normalize(snapshot)
        self.assertDictEqual(normalized, snapshot)

    def test_analyze_smart_snapshot_contract(self):
        snapshot = _load_json("analyze_smart_response.snapshot.json")
        normalized = self._validate_and_normalize(snapshot)
        self.assertDictEqual(normalized, snapshot)

    def test_label_metadata_fields_are_backward_compatible(self):
        payload = _load_json("analyze_label_response.snapshot.json")
        payload["request_id"] = "req-test-001"
        payload["prompt_version"] = "label-v1.2-2pass-locale-country"
        payload["used_model"] = "gemini-2.5-pro"

        normalized = self._validate_and_normalize(payload)
        self.assertEqual(normalized["request_id"], "req-test-001")
        self.assertEqual(normalized["prompt_version"], "label-v1.2-2pass-locale-country")
        self.assertEqual(normalized["used_model"], "gemini-2.5-pro")

    def test_analyze_metadata_fields_are_backward_compatible(self):
        payload = _load_json("analyze_response.snapshot.json")
        payload["request_id"] = "req-test-analyze-001"
        payload["prompt_version"] = "food-v3.3.1-schema-compact"
        payload["used_model"] = "gemini-2.5-pro"

        normalized = self._validate_and_normalize(payload)
        self.assertEqual(normalized["request_id"], "req-test-analyze-001")
        self.assertEqual(normalized["prompt_version"], "food-v3.3.1-schema-compact")
        self.assertEqual(normalized["used_model"], "gemini-2.5-pro")

    def test_analysis_latency_metadata_is_backward_compatible(self):
        payload = _load_json("analyze_response.snapshot.json")
        payload["latency_ms"] = {"total": 123}

        normalized = self._validate_and_normalize(payload)
        self.assertEqual(normalized["latency_ms"]["total"], 123)

    def test_analysis_decision_fields_are_backward_compatible(self):
        payload = _load_json("analyze_response.snapshot.json")
        payload["decision_status"] = "ASK"
        payload["analysis_origin"] = "food_photo"
        payload["recommended_action"] = "verify_label"
        payload["uncertainty_reason"] = "image_ambiguity"
        payload["decision_confidence"] = "medium"

        normalized = self._validate_and_normalize(payload)
        self.assertEqual(normalized["decision_status"], "ASK")
        self.assertEqual(normalized["analysis_origin"], "food_photo")
        self.assertEqual(normalized["recommended_action"], "verify_label")
        self.assertEqual(normalized["uncertainty_reason"], "image_ambiguity")
        self.assertEqual(normalized["decision_confidence"], "medium")


if __name__ == "__main__":
    unittest.main()
