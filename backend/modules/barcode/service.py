import json
import os
import time
from pathlib import Path
from .clients.datago_client import DatagoClient
from .clients.openfoodfacts_client import OpenFoodFactsClient
from .clients.public_data_client import PublicDataClient
from .constants import NUTRITION_PATCH_KEYS
from .normalizers import (
    is_nutrition_missing,
    normalize_datago,
    normalize_off,
)
from typing import Dict, Any, Optional

class BarcodeService:
    """
    Domain Service for Barcode Lookup.
    Orchestrates multiple clients (Data.go.kr, OpenFoodFacts) and normalizes data.
    """
    
    def __init__(self):
        self.datago_client = DatagoClient()
        self.off_client = OpenFoodFactsClient()
        self.public_data_client = PublicDataClient()
        self.cache_ttl_seconds = max(300, int(os.getenv("BARCODE_LOOKUP_CACHE_TTL_SECONDS", "604800")))
        self.cache_max_entries = max(100, int(os.getenv("BARCODE_LOOKUP_CACHE_MAX_ENTRIES", "1000")))
        cache_path = os.getenv("BARCODE_LOOKUP_CACHE_PATH", "/tmp/foodlens_barcode_lookup_cache.json").strip()
        self.cache_path = Path(cache_path) if cache_path else None
        self._cache: dict[str, dict[str, Any]] = {}
        self._load_cache()

    def _load_cache(self) -> None:
        if self.cache_path is None or not self.cache_path.exists():
            return
        try:
            loaded = json.loads(self.cache_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                self._cache = loaded
        except Exception:
            self._cache = {}

    def _persist_cache(self) -> None:
        if self.cache_path is None:
            return
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(self._cache, ensure_ascii=False), encoding="utf-8")
        except Exception:
            return

    def _cache_get(self, barcode: str) -> Optional[Dict[str, Any]]:
        entry = self._cache.get(barcode)
        if not isinstance(entry, dict):
            return None
        stored_at = entry.get("stored_at")
        data = entry.get("data")
        if not isinstance(stored_at, (int, float)) or not isinstance(data, dict):
            return None
        if time.time() - float(stored_at) > self.cache_ttl_seconds:
            self._cache.pop(barcode, None)
            self._persist_cache()
            return None
        cached = dict(data)
        source = str(cached.get("source") or "BARCODE_CACHE")
        if not source.endswith("_CACHE"):
            source = f"{source}_CACHE"
        cached["source"] = source
        return cached

    def _cache_set(self, barcode: str, data: Dict[str, Any]) -> None:
        if not barcode or not isinstance(data, dict):
            return
        self._cache[barcode] = {"stored_at": time.time(), "data": data}
        if len(self._cache) > self.cache_max_entries:
            ordered = sorted(
                self._cache.items(),
                key=lambda item: float(item[1].get("stored_at", 0)) if isinstance(item[1], dict) else 0,
                reverse=True,
            )
            self._cache = dict(ordered[: self.cache_max_entries])
        self._persist_cache()

    @staticmethod
    def _client_unavailable(client: Any) -> bool:
        checker = getattr(client, "had_upstream_failure", None)
        if callable(checker):
            try:
                return bool(checker())
            except Exception:
                return False
        return False

    async def get_product_info(self, barcode: str) -> Optional[Dict[str, Any]]:
        """
        Orchestration Logic:
        1. Try Data.go.kr (Primary - Korean Products)
        2. If failed/empty, Try OpenFoodFacts (Secondary - Global)
        3. Normalize Output
        """
        
        # 1. Try Data.go.kr
        print(f"\n[BarcodeTrace] >>> Starting lookup for: {barcode}")
        print(f"[BarcodeTrace] Step 1: Querying Data.go.kr (C005)...")
        clean_barcode = barcode.strip()
        korean_data = await self.datago_client.get_product_by_barcode(clean_barcode)
        datago_unavailable = self._client_unavailable(self.datago_client)
        
        if korean_data:
            print(f"[BarcodeTrace] ✓ Found in Data.go.kr (C005)")
            print(f"[BarcodeTrace] Product Name: {korean_data.get('PRDLST_NM')}")
            
            # Enrich with C002 (Ingredients) if available
            report_no = korean_data.get('PRDLST_REPORT_NO')
            if report_no:
                # 1.1. Enrich Ingredients (C002)
                print(f"[BarcodeTrace] Step 1.1: Enriching with C002 (Report No: {report_no})...")
                raw_materials = await self.datago_client.get_food_item_raw_materials(report_no)
                if raw_materials:
                     raw_names = raw_materials.get('RAWMTRL_NM', '')
                     if raw_names:
                         print(f"[BarcodeTrace] ✓ C002 Ingredients Found!")
                         korean_data['RAWMTRL_NM'] = raw_names
                
                # 1.2. Enrich Nutrition (I2790) if needed
                if is_nutrition_missing(korean_data):
                    print(f"[BarcodeTrace] Step 1.2: Nutrition missing in C005. Trying I2790...")
                    nutrition_data = await self.datago_client.get_product_by_report_no(report_no)
                    if nutrition_data:
                        print(f"[BarcodeTrace] ✓ I2790 Nutrition Found! Patching data...")
                        for key in NUTRITION_PATCH_KEYS:
                            if nutrition_data.get(key):
                                korean_data[key] = nutrition_data[key]
                        korean_data['enrichment_nutr'] = "I2790"

                # 1.3. Fallback to Public Data Portal (Name-based) if still missing
                if is_nutrition_missing(korean_data):
                    food_name = korean_data.get('PRDLST_NM')
                    print(f"[BarcodeTrace] Step 1.3: Nutrition still missing. Trying Public Data Portal (Name: {food_name})...")
                    if food_name:
                        pd_nutrition = await self.public_data_client.get_nutrition_by_name(food_name)
                        if pd_nutrition:
                            print(f"[BarcodeTrace] ✓ Public Data Nutrition Found! Patching...")
                            norm_pd = self.public_data_client.normalize_response(pd_nutrition)
                            korean_data['NUTR_CONT1'] = norm_pd['calories']
                            korean_data['NUTR_CONT2'] = norm_pd['carbs']
                            korean_data['NUTR_CONT3'] = norm_pd['protein']
                            korean_data['NUTR_CONT4'] = norm_pd['fat']
                            korean_data['enrichment_nutr'] = "PublicData"

            normalized = normalize_datago(korean_data)
            self._cache_set(clean_barcode, normalized)
            print(f"[BarcodeTrace] Final Result (KR): {normalized.get('food_name')} ({normalized.get('calories')} kcal)")
            return normalized
            
        # 2. Try Open Food Facts
        print(f"[BarcodeTrace] Step 2: Not found in KR DB. Trying OpenFoodFacts...")
        off_data = await self.off_client.get_product_by_barcode(clean_barcode)
        off_unavailable = self._client_unavailable(self.off_client)
        
        if off_data:
            print(f"[BarcodeTrace] ✓ Found in OpenFoodFacts")
            normalized = normalize_off(off_data)
            self._cache_set(clean_barcode, normalized)
            print(f"[BarcodeTrace] Final Result (OFF): {normalized.get('food_name')} ({normalized.get('calories')} kcal)")
            return normalized

        cached = self._cache_get(clean_barcode)
        if cached:
            if datago_unavailable or off_unavailable:
                print(
                    f"[BarcodeTrace] ⚠ Upstream unavailable. Serving cached product for {clean_barcode} "
                    f"(source={cached.get('source')})"
                )
            else:
                print(
                    f"[BarcodeTrace] ⚠ Source miss. Serving recent cached product for {clean_barcode} "
                    f"(source={cached.get('source')})"
                )
            return cached

        print(f"[BarcodeTrace] ✗ Barcode {barcode} not found in any DB.")
        return None
