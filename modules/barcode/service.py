
from .clients.datago_client import DatagoClient
from .clients.openfoodfacts_client import OpenFoodFactsClient
from .clients.public_data_client import PublicDataClient
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
        print(f"[BarcodeService] Improving lookup for {barcode} via Data.go.kr...")
        korean_data = await self.datago_client.get_product_by_barcode(barcode)
        
        if korean_data:
            print(f"[BarcodeService] Found in Data.go.kr (C005)")
            
            # Enrich with C002 (Ingredients) if available
            report_no = korean_data.get('PRDLST_REPORT_NO')
            if report_no:
                # 1.1. Enrich Ingredients (C002)
                print(f"[BarcodeService] Enriching with C002 (Report No: {report_no})...")
                raw_materials = await self.datago_client.get_food_item_raw_materials(report_no)
                if raw_materials:
                     raw_names = raw_materials.get('RAWMTRL_NM', '')
                     if raw_names:
                         print(f"[BarcodeService] C002 Ingredients Found!")
                         korean_data['RAWMTRL_NM'] = raw_names
                
                # 1.2. Enrich Nutrition (I2790) if needed
                # C005 often has 0.0 or None for nutrition. If so, try I2790.
                if self._is_nutrition_missing(korean_data):
                    print(f"[BarcodeService] Nutrition missing in C005. Trying I2790...")
                    nutrition_data = await self.datago_client.get_product_by_report_no(report_no)
                    if nutrition_data:
                        print(f"[BarcodeService] I2790 Nutrition Found! Patching data...")
                        # Map I2790 fields back to korean_data so _normalize_datago picks them up
                        # Usually I2790 and C005 use similar NUTR_CONT1 style but nested differently?
                        # I2790 fields: NUTR_CONT1 (Cal), NUTR_CONT2 (Carb), NUTR_CONT3 (Prot), NUTR_CONT4 (Fat)
                        for key in ['NUTR_CONT1', 'NUTR_CONT2', 'NUTR_CONT3', 'NUTR_CONT4']:
                            if nutrition_data.get(key):
                                korean_data[key] = nutrition_data[key]
                        korean_data['enrichment_nutr'] = "I2790"

                # 1.3. Fallback to Public Data Portal (Name-based) if still missing
                if self._is_nutrition_missing(korean_data):
                    food_name = korean_data.get('PRDLST_NM')
                    print(f"[BarcodeService] Nutrition still missing (Cal: {korean_data.get('NUTR_CONT1')}).")
                    if food_name:
                        print(f"[BarcodeService] Trying Public Data Portal (Name: {food_name})...")
                        pd_nutrition = await self.public_data_client.get_nutrition_by_name(food_name)
                        if pd_nutrition:
                            print(f"[BarcodeService] Public Data Nutrition Found! Patching...")
                            # Map PD fields to korean_data
                            norm_pd = self.public_data_client.normalize_response(pd_nutrition)
                            korean_data['NUTR_CONT1'] = norm_pd['calories']
                            korean_data['NUTR_CONT2'] = norm_pd['carbs']
                            korean_data['NUTR_CONT3'] = norm_pd['protein']
                            korean_data['NUTR_CONT4'] = norm_pd['fat']
                            korean_data['enrichment_nutr'] = "PublicData"

            return self._normalize_datago(korean_data)
            
        # 2. Try Open Food Facts
        print(f"[BarcodeService] Not found in KR DB. Trying OpenFoodFacts...")
        off_data = await self.off_client.get_product_by_barcode(barcode)
        
        if off_data:
            print(f"[BarcodeService] Found in OpenFoodFacts")
            return self._normalize_off(off_data)
            
        print(f"[BarcodeService] Barcode {barcode} not found in any DB.")
        return None

    def _is_nutrition_missing(self, data: Dict[str, Any]) -> bool:
        """Checks if C005 data has placeholder/zero nutrition info."""
        cal = self._parse_float(data.get("NUTR_CONT1"))
        # If calories is 0 or all main macros are 0, we consider it missing/placeholder
        # (Very few processed foods have exactly 0 calories, usually placeholders)
        return cal <= 0.0

    def _normalize_datago(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize Data.go.kr response to App Standard
        """
        # C005 Fields: PRDLST_NM(Product Name), NUTR_CONT1(Calories), ...
        # Note: Field names might vary based on specific API version (I2790 vs C005)
        # Assuming C005 standard response based on docs
        
        return {
            "food_name": data.get("PRDLST_NM", "Unknown Product"),
            "calories": self._parse_float(data.get("NUTR_CONT1")), # Energy
            "carbs": self._parse_float(data.get("NUTR_CONT2")),    # Carbs
            "protein": self._parse_float(data.get("NUTR_CONT3")),  # Protein
            "fat": self._parse_float(data.get("NUTR_CONT4")),      # Fat
            "ingredients": self._parse_ingredients_datago(data.get("RAWMTRL_NM")),
            "source": "BARCODE_DATAGO",
            "raw_data": data # Keep raw data for debugging/details
        }

    def _normalize_off(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normalize Open Food Facts response to App Standard
        """
        nutriments = data.get("nutriments", {})
        
        return {
            "food_name": data.get("product_name", data.get("product_name_en", "Unknown Product")),
            "calories": nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal"),
            "carbs": nutriments.get("carbohydrates_100g") or nutriments.get("carbohydrates"),
            "protein": nutriments.get("proteins_100g") or nutriments.get("proteins"),
            "fat": nutriments.get("fat_100g") or nutriments.get("fat"),
            "ingredients": self._parse_ingredients_off(data),
            "source": "BARCODE_OFF",
            "image_url": data.get("image_url"),
            "raw_data": data
        }

    def _parse_ingredients_datago(self, raw_str: Optional[str]) -> list:
        if not raw_str:
            return []
        # Basic split by comma, cleanup needed in real world
        return [i.strip() for i in raw_str.split(',') if i.strip()]

    def _parse_ingredients_off(self, data: Dict[str, Any]) -> list:
        # Try hierarchy first (e.g., "en:tomatoes")
        tags = data.get("ingredients_original_tags") or data.get("ingredients_hierarchy")
        if tags and isinstance(tags, list):
            return [t.replace("en:", "").replace("Ko:", "").replace("-", " ") for t in tags]
        
        # Fallback to text
        text = data.get("ingredients_text")
        if text:
            return [i.strip() for i in text.split(',') if i.strip()]
            
        return []

    def _parse_float(self, value: Any) -> float:
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0
