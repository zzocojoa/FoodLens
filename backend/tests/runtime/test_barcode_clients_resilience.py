import unittest
import os
from unittest.mock import patch

from backend.modules.barcode.clients.datago_client import DatagoClient
from backend.modules.barcode.clients.public_data_client import PublicDataClient


class _FakeResponse:
    def __init__(self, *, status: int, text: str, content_type: str = "application/json") -> None:
        self.status = status
        self._text = text
        self.headers = {"Content-Type": content_type}

    async def text(self) -> str:
        return self._text

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeSession:
    def __init__(self, response: _FakeResponse):
        self._response = response

    def get(self, _url: str):
        return self._response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class BarcodeClientResilienceTests(unittest.IsolatedAsyncioTestCase):
    async def test_datago_parses_json_payload_even_with_text_html_content_type(self):
        client = DatagoClient()
        payload = '{"C005":{"RESULT":{"CODE":"INFO-000","MSG":"정상 처리되었습니다."},"row":[{"PRDLST_NM":"신라면"}]}}'
        fake_response = _FakeResponse(status=200, text=payload, content_type="text/html;charset=utf-8")
        with patch("backend.modules.barcode.clients.datago_client.aiohttp.ClientSession", return_value=_FakeSession(fake_response)):
            result = await client._request_service("http://example.com", "C005", log_prefix="")
        self.assertIsNotNone(result)
        self.assertEqual(result.get("PRDLST_NM"), "신라면")
        self.assertFalse(client.had_upstream_failure())

    async def test_public_data_skips_requests_during_auth_cooldown(self):
        client = PublicDataClient(api_key="dummy")
        client._auth_disabled_until = 9_999_999_999
        with patch("backend.modules.barcode.clients.public_data_client.aiohttp.ClientSession") as mocked_session:
            result = await client.get_nutrition_by_name("신라면")
        self.assertIsNone(result)
        mocked_session.assert_not_called()

    async def test_public_data_sets_auth_cooldown_on_401(self):
        client = PublicDataClient(api_key="dummy")
        before = client._auth_disabled_until
        fake_response = _FakeResponse(status=401, text="{}", content_type="application/json")
        with patch(
            "backend.modules.barcode.clients.public_data_client.aiohttp.ClientSession",
            return_value=_FakeSession(fake_response),
        ):
            result = await client.get_nutrition_by_name("신라면")
        self.assertIsNone(result)
        self.assertGreater(client._auth_disabled_until, before)

    async def test_datago_client_uses_configured_upstream_timeout(self):
        with patch.dict(os.environ, {"BARCODE_UPSTREAM_TIMEOUT_SECONDS": "3"}):
            client = DatagoClient()
        payload = '{"C005":{"RESULT":{"CODE":"INFO-000","MSG":"ok"},"row":[{"PRDLST_NM":"A"}]}}'
        fake_response = _FakeResponse(status=200, text=payload, content_type="application/json")
        with patch(
            "backend.modules.barcode.clients.datago_client.aiohttp.ClientSession",
            return_value=_FakeSession(fake_response),
        ) as mocked_session:
            result = await client._request_service("http://example.com", "C005", log_prefix="")
        self.assertIsNotNone(result)
        self.assertIsNotNone(mocked_session.call_args)
        timeout = mocked_session.call_args.kwargs.get("timeout")
        self.assertIsNotNone(timeout)
        self.assertEqual(timeout.total, 3.0)


if __name__ == "__main__":
    unittest.main()
