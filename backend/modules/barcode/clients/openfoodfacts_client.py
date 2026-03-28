import asyncio
import aiohttp
import os
from typing import Any, Final

JSONDict = dict[str, Any]

class OpenFoodFactsClient:
    """
    Client for Open Food Facts API (World).
    """
    
    BASE_URL: Final[str] = "https://world.openfoodfacts.org/api/v2/product"
    USER_AGENT: Final[str] = "FoodLens - Android/iOS - Version 1.0 (contact@foodlens.app)"
    REQUEST_HEADERS: Final[dict[str, str]] = {"User-Agent": USER_AGENT}
    DEFAULT_REQUEST_TIMEOUT_SECONDS: Final[float] = 15.0
    DEFAULT_RETRY_COUNT: Final[int] = 3
    DEFAULT_RETRY_BACKOFF_SECONDS: Final[float] = 1.0

    def __init__(self) -> None:
        raw_timeout = os.getenv("BARCODE_UPSTREAM_TIMEOUT_SECONDS", str(self.DEFAULT_REQUEST_TIMEOUT_SECONDS))
        try:
            self.request_timeout_seconds = max(1.0, float(raw_timeout))
        except ValueError:
            self.request_timeout_seconds = self.DEFAULT_REQUEST_TIMEOUT_SECONDS
        raw_retry_count = os.getenv("BARCODE_UPSTREAM_RETRY_COUNT", str(self.DEFAULT_RETRY_COUNT))
        try:
            self.retry_count = max(0, int(raw_retry_count))
        except ValueError:
            self.retry_count = self.DEFAULT_RETRY_COUNT
        raw_retry_backoff = os.getenv(
            "BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS",
            str(self.DEFAULT_RETRY_BACKOFF_SECONDS),
        )
        try:
            self.retry_backoff_seconds = max(0.0, float(raw_retry_backoff))
        except ValueError:
            self.retry_backoff_seconds = self.DEFAULT_RETRY_BACKOFF_SECONDS
        self.last_failure_kind: str | None = None
        self.last_failure_message: str | None = None

    def _clear_failure(self) -> None:
        self.last_failure_kind = None
        self.last_failure_message = None

    def _set_failure(self, *, kind: str, message: str) -> None:
        self.last_failure_kind = kind
        self.last_failure_message = message

    def had_upstream_failure(self) -> bool:
        return self.last_failure_kind is not None

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
        self._clear_failure()
        url = f"{self.BASE_URL}/{barcode}.json"
        attempts = self.retry_count + 1
        
        timeout = aiohttp.ClientTimeout(total=self.request_timeout_seconds)
        for attempt in range(1, attempts + 1):
            try:
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    # User-Agent is required by OFF policy
                    async with session.get(url, headers=self.REQUEST_HEADERS) as response:
                        if response.status != 200:
                            self._set_failure(kind=f"http_{response.status}", message=f"status={response.status}")
                            print(f"[OFF] API Error: Status {response.status}")
                            if response.status == 429 or response.status >= 500:
                                if attempt < attempts:
                                    delay = self.retry_backoff_seconds * (2 ** (attempt - 1))
                                    if delay > 0:
                                        await asyncio.sleep(delay)
                                    continue
                            return None

                        data = await response.json()
                        product = self._extract_product(data, barcode)
                        if product is not None:
                            self._clear_failure()
                        return product

            except Exception as error:
                self._set_failure(kind="network", message=str(error))
                print(f"[OFF] Request Failed: {error}")
                if attempt < attempts:
                    delay = self.retry_backoff_seconds * (2 ** (attempt - 1))
                    if delay > 0:
                        await asyncio.sleep(delay)
                    continue
                return None
