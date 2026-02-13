
import aiohttp
from typing import Optional, Dict, Any

class OpenFoodFactsClient:
    """
    Client for Open Food Facts API (World).
    """
    
    BASE_URL = "https://world.openfoodfacts.org/api/v2/product"
    USER_AGENT = "FoodLens - Android/iOS - Version 1.0 (contact@foodlens.app)"

    @staticmethod
    def _extract_product(data: Dict[str, Any], barcode: str) -> Optional[Dict[str, Any]]:
        if data.get("status") == 1:
            return data.get("product")
        print(f"[OFF] Product {barcode} not found (status {data.get('status')})")
        return None
    
    async def get_product_by_barcode(self, barcode: str) -> Optional[Dict[str, Any]]:
        """
        Fetches product info by barcode from Open Food Facts.
        """
        url = f"{self.BASE_URL}/{barcode}.json"
        
        try:
            async with aiohttp.ClientSession() as session:
                # User-Agent is required by OFF policy
                headers = {"User-Agent": self.USER_AGENT}
                async with session.get(url, headers=headers) as response:
                    if response.status != 200:
                         print(f"[OFF] API Error: Status {response.status}")
                         return None
                    
                    data = await response.json()
                    return self._extract_product(data, barcode)
                        
        except Exception as e:
            print(f"[OFF] Request Failed: {e}")
            return None
