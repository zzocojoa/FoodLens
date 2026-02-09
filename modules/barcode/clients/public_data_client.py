import aiohttp
import os
import urllib.parse
from typing import Optional, Dict, Any, List

class PublicDataClient:
    """
    Client for Public Data Portal (apis.data.go.kr)
    Specifically for MFDS Food Nutrition Services.
    """
    BASE_URL = "http://apis.data.go.kr/1471000/FoodNtrIrdntInfoService1/getFoodNtrItmList1"

    def __init__(self, api_key: Optional[str] = None):
        raw_key = api_key or os.getenv("KOREAN_FDA_API_KEY")
        # data.go.kr keys in .env are often already encoded (contain %2B).
        # We unquote them because aiohttp/requests will re-encode them.
        if raw_key and '%' in raw_key:
            self.api_key = urllib.parse.unquote(raw_key)
        else:
            self.api_key = raw_key

    async def get_nutrition_by_name(self, food_name: str) -> Optional[Dict[str, Any]]:
        """
        Search for nutrition info by food name.
        Returns the first matching item.
        """
        if not self.api_key or not food_name:
            return None

        # Clean food name (remove special chars if needed)
        clean_name = food_name.strip()
        
        # Most data.go.kr keys require passing them EXACTLY as given (encoded)
        # requests/aiohttp might encode parameters, so it's safer to build the URL or 
        # pass the key as a literal string if it contains '+' or '='.
        
        # Prepare params
        params = {
            "serviceKey": self.api_key,
            "desc_kor": clean_name,
            "type": "json",
            "numOfRows": 1,
            "pageNo": 1
        }
        
        print(f"[PublicData] Requesting for: {clean_name}")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.BASE_URL, params=params) as response:
                    if response.status != 200:
                        print(f"[PublicData] API Error: Status {response.status}")
                        # If 500, it might be key activation or portal issue
                        return None
                    
                    data = await response.json(content_type=None) # Handle text/html or other mimetypes
                    
                    if not data or 'body' not in data.get('response', {}):
                        return None
                    
                    items = data['response']['body'].get('items', [])
                    if not items:
                        return None
                    
                    return items[0]

        except Exception as e:
            print(f"[PublicData] Request Failed: {e}")
            return None

    def normalize_response(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Maps Public Data Portal fields to App Standard.
        Fields: DESC_KOR, NUTR_CONT1 (Cal), NUTR_CONT2 (Carb), NUTR_CONT3 (Prot), NUTR_CONT4 (Fat)
        """
        return {
            "calories": self._to_float(item.get("NUTR_CONT1")),
            "carbs": self._to_float(item.get("NUTR_CONT2")),
            "protein": self._to_float(item.get("NUTR_CONT3")),
            "fat": self._to_float(item.get("NUTR_CONT4")),
            "sugar": self._to_float(item.get("NUTR_CONT5")),
            "sodium": self._to_float(item.get("NUTR_CONT6")),
            "cholesterol": self._to_float(item.get("NUTR_CONT7")),
            "saturated_fat": self._to_float(item.get("NUTR_CONT8")),
            "trans_fat": self._to_float(item.get("NUTR_CONT9")),
            "serving_size": item.get("SERVING_SIZE", "100g"),
            "data_source": "PublicDataPortal"
        }

    def _to_float(self, val: Any) -> float:
        try:
            if val is None or val == "": return 0.0
            return float(val)
        except:
            return 0.0
