import aiohttp
import os
import urllib.parse
from typing import Optional, Dict, Any, List

class PublicDataClient:
    """
    Client for Public Data Portal (apis.data.go.kr)
    Specifically for MFDS Food Nutrition Services.
    """
    # Identical to the one in nutrition.py which we know is working
    BASE_URL = "http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"

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
        Search for nutrition info by food name using the unified 'Food Nutrition DB' service.
        """
        if not self.api_key or not food_name:
            return None

        clean_name = food_name.strip()
        
        # Parameters match FoodNtrCpntDbInfo02
        params = {
            "serviceKey": self.api_key,
            "FOOD_NM_KR": clean_name,
            "type": "json",
            "numOfRows": 1,
            "pageNo": 1
        }
        
        print(f"[PublicData] Requesting (Unified Service) for: {clean_name}")

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.BASE_URL, params=params) as response:
                    if response.status != 200:
                        print(f"[PublicData] API Error: Status {response.status}")
                        return None
                    
                    data = await response.json(content_type=None)
                    
                    # Unified Service Response Structure: data['body']['items']
                    body = data.get('body', {})
                    items = body.get('items', [])
                    if not items:
                        return None
                    
                    return items[0]

        except Exception as e:
            print(f"[PublicData] Request Failed: {e}")
            return None

    def normalize_response(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Maps FoodNtrCpntDbInfo02 fields to App Standard.
        AMT_NUM1: Cal, AMT_NUM6: Carb, AMT_NUM3: Prot, AMT_NUM4: Fat, AMT_NUM7: Sugar, AMT_NUM13: Sodium
        """
        return {
            "calories": self._to_float(item.get("AMT_NUM1")),
            "carbs": self._to_float(item.get("AMT_NUM6")),
            "protein": self._to_float(item.get("AMT_NUM3")),
            "fat": self._to_float(item.get("AMT_NUM4")),
            "sugar": self._to_float(item.get("AMT_NUM7")),
            "sodium": self._to_float(item.get("AMT_NUM13")),
            "fiber": self._to_float(item.get("AMT_NUM9")),
            "serving_size": item.get("SERVING_SIZE", "100g"),
            "data_source": "FoodNutritionDB_Unified"
        }

    def _to_float(self, val: Any) -> float:
        try:
            if val is None or val == "": return 0.0
            return float(val)
        except:
            return 0.0
