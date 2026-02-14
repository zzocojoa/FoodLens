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


if __name__ == "__main__":
    unittest.main()
