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
