import json
import unittest
from pathlib import Path

from backend.modules.contracts.barcode_response import BarcodeLookupResponseContract

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"


def _load_json(filename: str) -> dict:
    with (FIXTURE_DIR / filename).open("r", encoding="utf-8") as fp:
        return json.load(fp)


class BarcodeContractSnapshotTests(unittest.TestCase):
    def test_barcode_snapshot_contract(self):
        snapshot = _load_json("barcode_lookup.snapshot.json")
        validated = BarcodeLookupResponseContract.model_validate(snapshot)
        self.assertIsInstance(validated.found, bool)
        if validated.found:
            self.assertIsNotNone(validated.data)

    def test_barcode_observability_fields_are_backward_compatible(self):
        payload = _load_json("barcode_lookup.snapshot.json")
        payload["request_id"] = "req-barcode-001"
        payload["used_model"] = "gemini-2.0-flash"
        payload["prompt_version"] = "barcode-v1.1-allergen-compact"
        payload["latency_ms"] = {"total": 80, "source_lookup": 20, "allergen_analysis": 60}

        validated = BarcodeLookupResponseContract.model_validate(payload)
        self.assertEqual(validated.request_id, "req-barcode-001")
        self.assertEqual(validated.used_model, "gemini-2.0-flash")
        self.assertEqual(validated.prompt_version, "barcode-v1.1-allergen-compact")
        self.assertEqual(validated.latency_ms.total, 80)

    def test_barcode_decision_fields_are_backward_compatible(self):
        payload = _load_json("barcode_lookup.snapshot.json")
        payload["data"]["decision_status"] = "OK"
        payload["data"]["analysis_origin"] = "barcode_lookup"
        payload["data"]["recommended_action"] = "eat"
        payload["data"]["uncertainty_reason"] = "unknown"
        payload["data"]["decision_confidence"] = "high"

        validated = BarcodeLookupResponseContract.model_validate(payload)
        assert validated.data is not None
        self.assertEqual(validated.data.decision_status, "OK")
        self.assertEqual(validated.data.analysis_origin, "barcode_lookup")
        self.assertEqual(validated.data.recommended_action, "eat")
        self.assertEqual(validated.data.uncertainty_reason, "unknown")
        self.assertEqual(validated.data.decision_confidence, "high")


if __name__ == "__main__":
    unittest.main()
