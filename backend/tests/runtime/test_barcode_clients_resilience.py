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


class _FlakySession:
    def __init__(self, responses):
        self._responses = list(responses)

    def get(self, _url: str):
        if not self._responses:
            raise RuntimeError("no more responses")
        next_item = self._responses.pop(0)
        if isinstance(next_item, Exception):
            raise next_item
        return next_item

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

    async def test_datago_retries_on_transient_failure_then_succeeds(self):
        with patch.dict(
            os.environ,
            {
                "BARCODE_UPSTREAM_RETRY_COUNT": "2",
                "BARCODE_UPSTREAM_RETRY_BACKOFF_SECONDS": "0",
            },
        ):
            client = DatagoClient()

        payload = '{"C005":{"RESULT":{"CODE":"INFO-000","MSG":"ok"},"row":[{"PRDLST_NM":"A"}]}}'
        fake_response = _FakeResponse(status=200, text=payload, content_type="application/json")
        timeout_error = TimeoutError("timed out")
        with patch(
            "backend.modules.barcode.clients.datago_client.aiohttp.ClientSession",
            side_effect=[_FlakySession([timeout_error]), _FlakySession([fake_response])],
        ):
            result = await client._request_service("http://example.com", "C005", log_prefix="")
        self.assertIsNotNone(result)
        self.assertEqual(result.get("PRDLST_NM"), "A")

    async def test_public_data_build_url_accepts_decoded_service_key(self):
        client = PublicDataClient(api_key="abc+def=")
        built = client._build_request_url("신라면")
        self.assertIn("serviceKey=abc%2Bdef%3D", built)

    async def test_public_data_build_url_accepts_encoded_service_key(self):
        client = PublicDataClient(api_key="abc%2Bdef%3D")
        built = client._build_request_url("신라면")
        self.assertIn("serviceKey=abc%2Bdef%3D", built)

    async def test_datago_marks_unhealthy_and_skips_until_cooldown_expires(self):
        with patch.dict(
            os.environ,
            {
                "BARCODE_UPSTREAM_RETRY_COUNT": "0",
                "BARCODE_DATAGO_FAILURE_THRESHOLD": "1",
                "BARCODE_DATAGO_UNHEALTHY_COOLDOWN_SECONDS": "60",
            },
        ):
            client = DatagoClient()

        timeout_error = TimeoutError("timed out")
        with patch(
            "backend.modules.barcode.clients.datago_client.aiohttp.ClientSession",
            side_effect=[_FlakySession([timeout_error])],
        ) as mocked_session:
            first_result = await client._request_service("http://example.com", "C005", log_prefix="")
        self.assertIsNone(first_result)
        self.assertEqual(mocked_session.call_count, 1)
        self.assertTrue(client.had_upstream_failure())
        self.assertEqual(client.last_failure_kind, "network")

        with patch("backend.modules.barcode.clients.datago_client.aiohttp.ClientSession") as skipped_session:
            second_result = await client._request_service("http://example.com", "C005", log_prefix="")
        self.assertIsNone(second_result)
        skipped_session.assert_not_called()
        self.assertEqual(client.last_failure_kind, "upstream_unhealthy")


if __name__ == "__main__":
    unittest.main()
