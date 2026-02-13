import aiohttp
import os
import urllib.parse
from typing import Any, Final

JSONDict = dict[str, Any]

class PublicDataClient:
    """
    Client for Public Data Portal (apis.data.go.kr)
    Specifically for MFDS Food Nutrition Services.
    """
    # Identical to the one in nutrition.py which we know is working
    BASE_URL: Final[str] = "http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"
    DEFAULT_RESPONSE_TYPE: Final[str] = "json"
    DEFAULT_NUM_OF_ROWS: Final[int] = 1
    DEFAULT_PAGE_NO: Final[int] = 1
    DEFAULT_SERVING_SIZE: Final[str] = "100g"
    DEFAULT_DATA_SOURCE: Final[str] = "FoodNutritionDB_Unified"

    def __init__(self, api_key: str | None = None):
        raw_key = api_key or os.getenv("KOREAN_FDA_API_KEY")
        self.api_key = self._decode_api_key(raw_key)

    @staticmethod
    def _decode_api_key(raw_key: str | None) -> str | None:
        if not raw_key:
            return raw_key
        # data.go.kr keys in .env are often already encoded (contain %2B).
        # We unquote them because aiohttp/requests will re-encode them.
        if "%" in raw_key:
            return urllib.parse.unquote(raw_key)
        return raw_key

    def _build_request_url(self, clean_name: str) -> str:
        params = {
            "FOOD_NM_KR": clean_name,
            "type": self.DEFAULT_RESPONSE_TYPE,
            "numOfRows": self.DEFAULT_NUM_OF_ROWS,
            "pageNo": self.DEFAULT_PAGE_NO,
        }
        query_string = urllib.parse.urlencode(params)
        return f"{self.BASE_URL}?serviceKey={self.api_key}&{query_string}"

    @staticmethod
    def _extract_first_item(data: JSONDict, clean_name: str) -> JSONDict | None:
        body = data.get("body", {})
        items = body.get("items", [])
        if not items:
            print(f"[PublicData] No items found for: {clean_name}")
            return None
        print(f"[PublicData] ✓ Found {len(items)} items. Picking top result: {items[0].get('FOOD_NM_KR')}")
        return items[0]

    async def get_nutrition_by_name(self, food_name: str) -> JSONDict | None:
        """
        Search for nutrition info by food name using the unified 'Food Nutrition DB' service.
        """
        if not self.api_key or not food_name:
            return None

        clean_name = food_name.strip()
        
        # Parameters match FoodNtrCpntDbInfo02
        # IMPORTANT: 'serviceKey' is double-encoded by many libraries if passed in params.
        # We manually construct the query string for the key to be safe.
        print(f"[PublicData] Requesting (Unified Service) for: {clean_name}")

        try:
            async with aiohttp.ClientSession() as session:
                # Manual URL construction to control serviceKey encoding exactly
                full_url = self._build_request_url(clean_name)
                
                async with session.get(full_url) as response:
                    if response.status != 200:
                        print(f"[PublicData] API Error: Status {response.status}")
                        return None
                    
                    data = await response.json(content_type=None)
                    
                    # Unified Service Response Structure: data['body']['items']
                    return self._extract_first_item(data, clean_name)

        except Exception as error:
            print(f"[PublicData] Request Failed: {error}")
            return None

    def normalize_response(self, item: JSONDict) -> JSONDict:
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
            "serving_size": item.get("SERVING_SIZE", self.DEFAULT_SERVING_SIZE),
            "data_source": self.DEFAULT_DATA_SOURCE
        }

    @staticmethod
    def _to_float(val: Any) -> float:
        try:
            if val is None or val == "":
                return 0.0
            return float(val)
        except Exception:
            return 0.0
