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


if __name__ == "__main__":
    unittest.main()
