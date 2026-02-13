
from .clients.datago_client import DatagoClient
from .clients.openfoodfacts_client import OpenFoodFactsClient
from .clients.public_data_client import PublicDataClient
from .constants import NUTRITION_PATCH_KEYS
from .normalizers import is_nutrition_missing, normalize_datago, normalize_off
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
        korean_data = await self.datago_client.get_product_by_barcode(barcode)
        
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
            print(f"[BarcodeTrace] Final Result (KR): {normalized.get('food_name')} ({normalized.get('calories')} kcal)")
            return normalized
            
        # 2. Try Open Food Facts
        print(f"[BarcodeTrace] Step 2: Not found in KR DB. Trying OpenFoodFacts...")
        off_data = await self.off_client.get_product_by_barcode(barcode)
        
        if off_data:
            print(f"[BarcodeTrace] ✓ Found in OpenFoodFacts")
            normalized = normalize_off(off_data)
            print(f"[BarcodeTrace] Final Result (OFF): {normalized.get('food_name')} ({normalized.get('calories')} kcal)")
            return normalized
            
        print(f"[BarcodeTrace] ✗ Barcode {barcode} not found in any DB.")
        return None
