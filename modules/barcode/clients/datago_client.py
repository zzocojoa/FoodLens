import aiohttp
import os
from typing import Optional, Dict, Any

class DatagoClient:
    """
    Client for Data.go.kr (Food Safety Korea) API.
    Handles I2790 (Product Report) or C005 (Barcode Linked Info).
    
    API Key: Provided in .env as DATAGO_API_KEY
    """
    
    BASE_URL = "http://openapi.foodsafetykorea.go.kr/api"
    
    def __init__(self):
        self.api_key = os.getenv("DATAGO_API_KEY")
        if not self.api_key:
            print("WARNING: DATAGO_API_KEY not found in environment variables.")

    @staticmethod
    def _mask_api_key(url: str, api_key: Optional[str]) -> str:
        if not api_key:
            return url
        return url.replace(api_key, "API_KEY_MASKED")

    @staticmethod
    def _extract_first_row(data: Dict[str, Any], service_id: str) -> Optional[Dict[str, Any]]:
        if service_id not in data:
            if "RESULT" in data:
                print(
                    f"[Datago] {service_id} API Error: {data['RESULT'].get('CODE')} - {data['RESULT'].get('MSG')}"
                )
            else:
                print(f"[Datago] {service_id} Unexpected Response Format: {list(data.keys())}")
            return None

        result = data[service_id].get("RESULT", {})
        result_code = result.get("CODE")
        result_msg = result.get("MSG")

        if result_code != "INFO-000":
            print(f"[Datago] {service_id} Info: {result_code} - {result_msg}")
            return None

        rows = data[service_id].get("row", [])
        if not rows:
            print(f"[Datago] {service_id} Success but 0 rows returned.")
            return None
        return rows[0]

    async def _request_service(self, url: str, service_id: str, log_prefix: str) -> Optional[Dict[str, Any]]:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        print(f"[Datago] {log_prefix}Error: Status {response.status}")
                        return None
                    data = await response.json()
                    return self._extract_first_row(data, service_id)
        except Exception as error:
            print(f"[Datago] {log_prefix}Request Failed: {error}")
            return None

    async def get_product_by_barcode(self, barcode: str) -> Optional[Dict[str, Any]]:
        """
        Fetches product info by barcode from C005 service.
        URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/BAR_CD={barcode}
        """
        if not self.api_key:
            return None
            
        service_id = "C005" # Barcode Linked Product Info
        
        # Ensure clean barcode
        clean_barcode = barcode.strip()
        
        # URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/BAR_CD={barcode}
        url = f"{self.BASE_URL}/{self.api_key}/{service_id}/json/1/1/BAR_CD={clean_barcode}"
        
        # Debug Log (Masking API Key)
        safe_url = self._mask_api_key(url, self.api_key)
        print(f"[Datago] Requesting: {safe_url}")
        return await self._request_service(url, service_id, log_prefix="")

    async def get_product_by_report_no(self, report_no: str) -> Optional[Dict[str, Any]]:
        """
        Fetches product info by Report Number from I2790 service.
        URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/PRDLST_REPORT_NO={report_no}
        """
        if not report_no:
            return None
            
        # CRITICAL: Do NOT use KOREAN_FDA_API_KEY here. 
        # foodsafetykorea.go.kr (I2790) requires a specific Food Safety Korea key (usually short).
        # apis.data.go.kr (Public Data Portal) keys (usually long) will NOT work here.
        api_key = os.getenv("DATAGO_I2790_API_KEY") or self.api_key
        
        if not api_key:
            print("[Datago] Error: No FoodSafetyKorea API Key found for I2790 service.")
            return None
            
        service_id = "I2790" # Food Item Report Service
        clean_report_no = report_no.strip()
        
        url = f"{self.BASE_URL}/{api_key}/{service_id}/json/1/1/PRDLST_REPORT_NO={clean_report_no}"
        
        # Debug Log
        safe_url = self._mask_api_key(url, api_key)
        print(f"[Datago] Requesting I2790: {safe_url}")
        return await self._request_service(url, service_id, log_prefix="I2790 ")

    async def get_food_item_raw_materials(self, report_no: str) -> Optional[Dict[str, Any]]:
        """
        Fetches raw material info by Report Number from C002 service.
        URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/PRDLST_REPORT_NO={report_no}
        """
        if not self.api_key or not report_no:
            return None
            
        service_id = "C002" # Food Item Report (Raw Materials)
        clean_report_no = report_no.strip()
        
        url = f"{self.BASE_URL}/{self.api_key}/{service_id}/json/1/1/PRDLST_REPORT_NO={clean_report_no}"
        
        # Debug Log
        safe_url = self._mask_api_key(url, self.api_key)
        print(f"[Datago] Requesting C002: {safe_url}")
        return await self._request_service(url, service_id, log_prefix="C002 ")
