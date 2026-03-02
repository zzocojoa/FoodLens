import unittest
from tempfile import TemporaryDirectory
from pathlib import Path

from backend.modules.barcode.service import BarcodeService


class _FakeDatagoClient:
    def __init__(self) -> None:
        self.mode = "success"
        self.last_failure_kind = None

    async def get_product_by_barcode(self, _barcode: str):
        if self.mode == "success":
            self.last_failure_kind = None
            return {
                "PRDLST_NM": "신라면",
                "NUTR_CONT1": "510",
                "NUTR_CONT2": "80",
                "NUTR_CONT3": "10",
                "NUTR_CONT4": "16",
                "RAWMTRL_NM": "밀가루, 팜유, 향신료",
                "PRDLST_REPORT_NO": "197201540011",
            }
        if self.mode == "no_data":
            self.last_failure_kind = None
            return None
        self.last_failure_kind = "network"
        return None

    async def get_food_item_raw_materials(self, _report_no: str):
        return None

    async def get_product_by_report_no(self, _report_no: str):
        return None

    def had_upstream_failure(self) -> bool:
        return self.last_failure_kind is not None


class _FakeOpenFoodFactsClient:
    def __init__(self) -> None:
        self.last_failure_kind = None

    async def get_product_by_barcode(self, _barcode: str):
        self.last_failure_kind = None
        return None

    def had_upstream_failure(self) -> bool:
        return self.last_failure_kind is not None


class _FakePublicDataClient:
    async def get_nutrition_by_name(self, _name: str):
        return None

    def normalize_response(self, _payload):
        return {"calories": 0, "carbs": 0, "protein": 0, "fat": 0}


class BarcodeCacheFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_cached_product_when_upstream_is_unavailable(self):
        with TemporaryDirectory() as tmp_dir:
            service = BarcodeService()
            service.cache_path = Path(tmp_dir) / "barcode-cache.json"
            service.cache_ttl_seconds = 60
            service.cache_max_entries = 100
            service._cache = {}

            datago = _FakeDatagoClient()
            off = _FakeOpenFoodFactsClient()
            service.datago_client = datago
            service.off_client = off
            service.public_data_client = _FakePublicDataClient()

            barcode = "8801043015981"
            first = await service.get_product_info(barcode)
            self.assertIsNotNone(first)
            self.assertEqual(first.get("food_name"), "신라면")

            datago.mode = "network_fail"
            second = await service.get_product_info(barcode)
            self.assertIsNotNone(second)
            self.assertEqual(second.get("food_name"), "신라면")
            self.assertTrue(str(second.get("source", "")).endswith("_CACHE"))

    async def test_returns_none_when_upstream_unavailable_and_no_cache(self):
        with TemporaryDirectory() as tmp_dir:
            service = BarcodeService()
            service.cache_path = Path(tmp_dir) / "barcode-cache.json"
            service.cache_ttl_seconds = 60
            service.cache_max_entries = 100
            service._cache = {}

            datago = _FakeDatagoClient()
            datago.mode = "network_fail"
            service.datago_client = datago
            service.off_client = _FakeOpenFoodFactsClient()
            service.public_data_client = _FakePublicDataClient()

            result = await service.get_product_info("8801043026505")
            self.assertIsNone(result)

    async def test_returns_cached_product_when_sources_miss_without_failure(self):
        with TemporaryDirectory() as tmp_dir:
            service = BarcodeService()
            service.cache_path = Path(tmp_dir) / "barcode-cache.json"
            service.cache_ttl_seconds = 60
            service.cache_max_entries = 100
            service._cache = {}

            datago = _FakeDatagoClient()
            off = _FakeOpenFoodFactsClient()
            service.datago_client = datago
            service.off_client = off
            service.public_data_client = _FakePublicDataClient()

            barcode = "8801043015981"
            first = await service.get_product_info(barcode)
            self.assertIsNotNone(first)
            self.assertEqual(first.get("food_name"), "신라면")

            datago.mode = "no_data"
            second = await service.get_product_info(barcode)
            self.assertIsNotNone(second)
            self.assertEqual(second.get("food_name"), "신라면")
            self.assertTrue(str(second.get("source", "")).endswith("_CACHE"))


if __name__ == "__main__":
    unittest.main()
