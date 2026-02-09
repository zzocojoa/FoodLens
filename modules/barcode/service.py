
from .clients.datago_client import DatagoClient
from .clients.openfoodfacts_client import OpenFoodFactsClient
from typing import Dict, Any, Optional

class BarcodeService:
    """
    Domain Service for Barcode Lookup.
    Orchestrates multiple clients (Data.go.kr, OpenFoodFacts) and normalizes data.
    """
    
    def __init__(self):
        self.datago_client = DatagoClient()
        self.off_client = OpenFoodFactsClient()

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
            print(f"[BarcodeService] Found in Data.go.kr")
            return self._normalize_datago(korean_data)
            
        # 2. Try Open Food Facts
        print(f"[BarcodeService] Not found in KR DB. Trying OpenFoodFacts...")
        off_data = await self.off_client.get_product_by_barcode(barcode)
        
        if off_data:
            print(f"[BarcodeService] Found in OpenFoodFacts")
            return self._normalize_off(off_data)
            
        print(f"[BarcodeService] Barcode {barcode} not found in any DB.")
        return None

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
