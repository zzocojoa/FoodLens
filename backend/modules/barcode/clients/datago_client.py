import asyncio
import aiohttp
import json
import os
import time
from typing import Any, Final

JSONDict = dict[str, Any]


class DatagoClient:
    """
    Client for Data.go.kr (Food Safety Korea) API.
    Handles I2790 (Product Report) or C005 (Barcode Linked Info).
    
    API Key: Provided in .env as DATAGO_API_KEY
    """
    
    BASE_URL: Final[str] = "http://openapi.foodsafetykorea.go.kr/api"
    DEFAULT_DATA_TYPE: Final[str] = "json"
    DEFAULT_START_INDEX: Final[int] = 1
    DEFAULT_END_INDEX: Final[int] = 1
    INFO_OK_CODE: Final[str] = "INFO-000"
    BARCODE_SERVICE_ID: Final[str] = "C005"
    REPORT_SERVICE_ID: Final[str] = "I2790"
    RAW_MATERIAL_SERVICE_ID: Final[str] = "C002"
    DEFAULT_REQUEST_TIMEOUT_SECONDS: Final[float] = 4.0
    DEFAULT_RETRY_COUNT: Final[int] = 2
    DEFAULT_RETRY_BACKOFF_SECONDS: Final[float] = 0.6
    DEFAULT_FAILURE_THRESHOLD: Final[int] = 2
    DEFAULT_UNHEALTHY_COOLDOWN_SECONDS: Final[int] = 120
    
    def __init__(self) -> None:
        self.api_key = os.getenv("DATAGO_API_KEY")
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
        raw_failure_threshold = os.getenv(
            "BARCODE_DATAGO_FAILURE_THRESHOLD",
            str(self.DEFAULT_FAILURE_THRESHOLD),
        )
        try:
            self.failure_threshold = max(1, int(raw_failure_threshold))
        except ValueError:
            self.failure_threshold = self.DEFAULT_FAILURE_THRESHOLD
        raw_unhealthy_cooldown_seconds = os.getenv(
            "BARCODE_DATAGO_UNHEALTHY_COOLDOWN_SECONDS",
            str(self.DEFAULT_UNHEALTHY_COOLDOWN_SECONDS),
        )
        try:
            self.unhealthy_cooldown_seconds = max(5, int(raw_unhealthy_cooldown_seconds))
        except ValueError:
            self.unhealthy_cooldown_seconds = self.DEFAULT_UNHEALTHY_COOLDOWN_SECONDS
        self._consecutive_failures = 0
        self._unhealthy_until = 0.0
        self.last_failure_kind: str | None = None
        self.last_failure_message: str | None = None
        if not self.api_key:
            print("WARNING: DATAGO_API_KEY not found in environment variables.")

    def _clear_failure(self) -> None:
        self.last_failure_kind = None
        self.last_failure_message = None

    def _clear_health_penalty(self) -> None:
        self._consecutive_failures = 0
        self._unhealthy_until = 0.0

    def _mark_failure_for_health(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures < self.failure_threshold:
            return
        self._unhealthy_until = time.time() + self.unhealthy_cooldown_seconds
        print(
            f"[Datago] Marked upstream unhealthy. cooldown={self.unhealthy_cooldown_seconds}s "
            f"failures={self._consecutive_failures}"
        )

    def _is_unhealthy(self) -> bool:
        return time.time() < self._unhealthy_until

    def _set_failure(self, *, kind: str, message: str) -> None:
        self.last_failure_kind = kind
        self.last_failure_message = message

    def had_upstream_failure(self) -> bool:
        return self.last_failure_kind is not None

    @staticmethod
    def _mask_api_key(url: str, api_key: str | None) -> str:
        if not api_key:
            return url
        return url.replace(api_key, "API_KEY_MASKED")

    @staticmethod
    def _extract_first_row(data: JSONDict, service_id: str) -> JSONDict | None:
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

        if result_code != DatagoClient.INFO_OK_CODE:
            print(f"[Datago] {service_id} Info: {result_code} - {result_msg}")
            return None

        rows = data[service_id].get("row", [])
        if not rows:
            print(f"[Datago] {service_id} Success but 0 rows returned.")
            return None
        return rows[0]

    async def _request_service(self, url: str, service_id: str, log_prefix: str) -> JSONDict | None:
        self._clear_failure()
        if self._is_unhealthy():
            retry_in = max(0, int(self._unhealthy_until - time.time()))
            self._set_failure(kind="upstream_unhealthy", message=f"retry_in={retry_in}s")
            print(f"[Datago] {log_prefix}Skipping request due to unhealthy upstream. retry_in={retry_in}s")
            return None

        attempts = self.retry_count + 1
        for attempt in range(1, attempts + 1):
            try:
                timeout = aiohttp.ClientTimeout(total=self.request_timeout_seconds)
                async with aiohttp.ClientSession(timeout=timeout) as session:
                    async with session.get(url) as response:
                        if response.status != 200:
                            self._set_failure(kind=f"http_{response.status}", message=f"status={response.status}")
                            print(f"[Datago] {log_prefix}Error: Status {response.status}")
                            if response.status >= 500 and attempt < attempts:
                                delay = self.retry_backoff_seconds * (2 ** (attempt - 1))
                                if delay > 0:
                                    await asyncio.sleep(delay)
                                continue
                            self._mark_failure_for_health()
                            return None
                        # Some FoodSafety endpoints return JSON payloads with text/html content-type.
                        # Parse text manually as a fallback before marking it as failure.
                        raw_text = await response.text()
                        try:
                            data = json.loads(raw_text)
                        except Exception:
                            preview = raw_text[:120].replace("\n", " ")
                            self._set_failure(
                                kind="invalid_json",
                                message=f"content_type={response.headers.get('Content-Type')} preview={preview}",
                            )
                            print(
                                f"[Datago] {log_prefix}Invalid JSON payload: "
                                f"content_type={response.headers.get('Content-Type')} preview={preview}"
                            )
                            self._mark_failure_for_health()
                            return None
                        if service_id not in data and "RESULT" in data:
                            result = data.get("RESULT", {})
                            code = result.get("CODE")
                            msg = result.get("MSG")
                            self._set_failure(kind=f"result_{code or 'unknown'}", message=str(msg or "unknown"))
                        extracted = self._extract_first_row(data, service_id)
                        if extracted is not None:
                            self._clear_health_penalty()
                        else:
                            # INFO-200/No rows are source miss, not transport failures.
                            if self.last_failure_kind and self.last_failure_kind.startswith("result_INFO-200"):
                                self._clear_health_penalty()
                        return extracted
            except Exception as error:
                self._set_failure(kind="network", message=f"{type(error).__name__}: {error!r}")
                print(
                    f"[Datago] {log_prefix}Request Failed "
                    f"(attempt {attempt}/{attempts}): {type(error).__name__}: {error!r}"
                )
                if attempt < attempts:
                    delay = self.retry_backoff_seconds * (2 ** (attempt - 1))
                    if delay > 0:
                        await asyncio.sleep(delay)
                    continue
                self._mark_failure_for_health()
                return None
        return None

    async def get_product_by_barcode(self, barcode: str) -> JSONDict | None:
        """
        Fetches product info by barcode from C005 service.
        URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/BAR_CD={barcode}
        """
        if not self.api_key:
            return None
            
        service_id = self.BARCODE_SERVICE_ID  # Barcode Linked Product Info
        
        # Ensure clean barcode
        clean_barcode = barcode.strip()
        
        # URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/BAR_CD={barcode}
        url = (
            f"{self.BASE_URL}/{self.api_key}/{service_id}/"
            f"{self.DEFAULT_DATA_TYPE}/{self.DEFAULT_START_INDEX}/{self.DEFAULT_END_INDEX}/BAR_CD={clean_barcode}"
        )
        
        # Debug Log (Masking API Key)
        safe_url = self._mask_api_key(url, self.api_key)
        print(f"[Datago] Requesting: {safe_url}")
        return await self._request_service(url, service_id, log_prefix="")

    async def get_product_by_report_no(self, report_no: str) -> JSONDict | None:
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
            
        service_id = self.REPORT_SERVICE_ID  # Food Item Report Service
        clean_report_no = report_no.strip()
        
        url = (
            f"{self.BASE_URL}/{api_key}/{service_id}/"
            f"{self.DEFAULT_DATA_TYPE}/{self.DEFAULT_START_INDEX}/{self.DEFAULT_END_INDEX}/PRDLST_REPORT_NO={clean_report_no}"
        )
        
        # Debug Log
        safe_url = self._mask_api_key(url, api_key)
        print(f"[Datago] Requesting I2790: {safe_url}")
        return await self._request_service(url, service_id, log_prefix="I2790 ")

    async def get_food_item_raw_materials(self, report_no: str) -> JSONDict | None:
        """
        Fetches raw material info by Report Number from C002 service.
        URL Format: http://openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/{dataType}/{startIdx}/{endIdx}/PRDLST_REPORT_NO={report_no}
        """
        if not self.api_key or not report_no:
            return None
            
        service_id = self.RAW_MATERIAL_SERVICE_ID  # Food Item Report (Raw Materials)
        clean_report_no = report_no.strip()
        
        url = (
            f"{self.BASE_URL}/{self.api_key}/{service_id}/"
            f"{self.DEFAULT_DATA_TYPE}/{self.DEFAULT_START_INDEX}/{self.DEFAULT_END_INDEX}/PRDLST_REPORT_NO={clean_report_no}"
        )
        
        # Debug Log
        safe_url = self._mask_api_key(url, self.api_key)
        print(f"[Datago] Requesting C002: {safe_url}")
        return await self._request_service(url, service_id, log_prefix="C002 ")
