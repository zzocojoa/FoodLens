
import aiohttp
from typing import Any, Final

JSONDict = dict[str, Any]

class OpenFoodFactsClient:
    """
    Client for Open Food Facts API (World).
    """
    
    BASE_URL: Final[str] = "https://world.openfoodfacts.org/api/v2/product"
    USER_AGENT: Final[str] = "FoodLens - Android/iOS - Version 1.0 (contact@foodlens.app)"
    REQUEST_HEADERS: Final[dict[str, str]] = {"User-Agent": USER_AGENT}

    @staticmethod
    def _extract_product(data: JSONDict, barcode: str) -> JSONDict | None:
        if data.get("status") == 1:
            return data.get("product")
        print(f"[OFF] Product {barcode} not found (status {data.get('status')})")
        return None
    
    async def get_product_by_barcode(self, barcode: str) -> JSONDict | None:
        """
        Fetches product info by barcode from Open Food Facts.
        """
        url = f"{self.BASE_URL}/{barcode}.json"
        
        try:
            async with aiohttp.ClientSession() as session:
                # User-Agent is required by OFF policy
                async with session.get(url, headers=self.REQUEST_HEADERS) as response:
                    if response.status != 200:
                         print(f"[OFF] API Error: Status {response.status}")
                         return None
                    
                    data = await response.json()
                    return self._extract_product(data, barcode)
                        
        except Exception as error:
            print(f"[OFF] Request Failed: {error}")
            return None
