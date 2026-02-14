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


if __name__ == "__main__":
    unittest.main()
