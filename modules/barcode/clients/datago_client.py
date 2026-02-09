import aiohttp
import os
import json
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
        safe_url = url.replace(self.api_key, "API_KEY_MASKED") if self.api_key else url
        print(f"[Datago] Requesting: {safe_url}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        print(f"[Datago] API Error: Status {response.status}")
                        return None
                    
                    data = await response.json()
                    
                    # Parse Response
                    # Standard Format: { "C005": { "total_count": "1", "row": [ ... ], "RESULT": { "MSG": "...", "CODE": "INFO-000" } } }
                    
                    if service_id not in data:
                        return None
                        
                    result_code = data[service_id]['RESULT']['CODE']
                    if result_code != 'INFO-000':
                        # INFO-200 means no data found usually
                        return None
                        
                    rows = data[service_id].get('row', [])
                    if not rows:
                        return None
                        
                    return rows[0] # Return the first match
                    
        except Exception as e:
            print(f"[Datago] Request Failed: {e}")
            return None

    async def get_product_by_report_no(self, report_no: str) -> Optional[Dict[str, Any]]:
        """
        Fetches product info by Report Number from I2790 service.
        URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/PRDLST_REPORT_NO={report_no}
        """
        if not report_no:
            return None
            
        # Try specific I2790 keys first (KOREAN_FDA_API_KEY or DATAGO_I2790_API_KEY), fallback to general key
        api_key = os.getenv("KOREAN_FDA_API_KEY") or os.getenv("DATAGO_I2790_API_KEY") or self.api_key
        
        if not api_key:
            print("[Datago] Error: No API Key found for I2790 service.")
            return None
            
        service_id = "I2790" # Food Item Report Service
        clean_report_no = report_no.strip()
        
        url = f"{self.BASE_URL}/{api_key}/{service_id}/json/1/1/PRDLST_REPORT_NO={clean_report_no}"
        
        # Debug Log
        safe_url = url.replace(api_key, "API_KEY_MASKED") if api_key else url
        print(f"[Datago] Requesting I2790: {safe_url}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        print(f"[Datago] I2790 Error: Status {response.status}")
                        return None
                    
                    data = await response.json()
                    
                    if service_id not in data:
                        return None
                        
                    result_code = data[service_id]['RESULT']['CODE']
                    if result_code != 'INFO-000':
                        return None
                        
                    rows = data[service_id].get('row', [])
                    if not rows:
                        return None
                        
                    return rows[0]
                    
        except Exception as e:
            print(f"[Datago] I2790 Request Failed: {e}")
            return None

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
        safe_url = url.replace(self.api_key, "API_KEY_MASKED") if self.api_key else url
        print(f"[Datago] Requesting C002: {safe_url}")
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        print(f"[Datago] C002 Error: Status {response.status}")
                        return None
                    
                    data = await response.json()
                    
                    if service_id not in data:
                        return None
                        
                    result_code = data[service_id]['RESULT']['CODE']
                    if result_code != 'INFO-000':
                        return None
                        
                    rows = data[service_id].get('row', [])
                    if not rows:
                        return None
                        
                    return rows[0]
                    
        except Exception as e:
            print(f"[Datago] C002 Request Failed: {e}")
            return None
