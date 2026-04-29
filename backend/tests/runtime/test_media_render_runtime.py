import asyncio
import logging
import os
import unittest
from collections import OrderedDict
from contextlib import ExitStack
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from fastapi.testclient import TestClient

_RUNTIME_ENV: dict[str, str] = {
    "OPENAPI_EXPORT_ONLY": "1",
    "AUTH_STATE_BACKEND": "memory",
    "ANALYSIS_JOB_BACKEND": "memory",
    "ANALYSIS_NUTRITION_CACHE_BACKEND": "memory",
    "MEDIA_STORAGE_BACKEND": "disabled",
}
_ORIGINAL_ENV: dict[str, str] = dict(os.environ)
os.environ.update(_RUNTIME_ENV)
import backend.server as server  # noqa: E402
from backend.modules.media.service import MediaObjectPayload, MediaStorageError  # noqa: E402
os.environ.clear()
os.environ.update(_ORIGINAL_ENV)


_RUNTIME_LOGGER_NAMES: tuple[str, ...] = ("foodlens.api", "httpx")


class _FakeRequest:
    def __init__(self, *, base_url: str) -> None:
        self.base_url = base_url


class _FakeAuthService:
    def __init__(self, *, object_key: str) -> None:
        self.object_key = object_key

    def get_media_asset(self, *, asset_id: str) -> dict[str, object]:
        return {
            "asset_id": asset_id,
            "user_id": "usr_render",
            "scope": "profile",
            "object_key": self.object_key,
        }

    def touch_media_asset(self, *, asset_id: str) -> dict[str, object]:
        return {
            "asset_id": asset_id,
            "user_id": "usr_render",
            "scope": "profile",
            "object_key": self.object_key,
        }


class _FailingFetchMediaStorage:
    enabled: bool = True

    def __init__(self, *, error: MediaStorageError) -> None:
        self.error = error

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload:
        raise self.error


def _snapshot_app_state() -> dict[str, object]:
    state = getattr(server.app.state, "_state", None)
    if not isinstance(state, dict):
        raise TypeError("app.state._state must be a dictionary.")

    snapshot: dict[str, object] = {}
    for key, value in state.items():
        if not isinstance(key, str):
            raise TypeError("app.state key must be a string.")
        snapshot[key] = value
    return snapshot


def _restore_app_state(snapshot: dict[str, object]) -> None:
    state = getattr(server.app.state, "_state", None)
    if not isinstance(state, dict):
        raise TypeError("app.state._state must be a dictionary.")

    state.clear()
    state.update(snapshot)


class MediaRenderRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_state: dict[str, object] = _snapshot_app_state()
        self._exit_stack: ExitStack = ExitStack()
        self._exit_stack.enter_context(patch.dict(os.environ, _RUNTIME_ENV, clear=False))
        self._original_logger_levels: dict[str, int] = {}
        for logger_name in _RUNTIME_LOGGER_NAMES:
            logger = logging.getLogger(logger_name)
            self._original_logger_levels[logger_name] = logger.level
            logger.setLevel(logging.CRITICAL)
        self._prime_media_render_runtime(media_public_base_url="")

    def tearDown(self) -> None:
        for logger_name, logger_level in self._original_logger_levels.items():
            logging.getLogger(logger_name).setLevel(logger_level)
        _restore_app_state(self._original_state)
        self._exit_stack.close()

    def _prime_media_render_runtime(self, *, media_public_base_url: str) -> None:
        server.app.state.media_render_default_width = 512
        server.app.state.media_render_default_quality = 75
        server.app.state.media_render_url_ttl_seconds = 86_400
        server.app.state.media_render_allowed_widths = {128, 256, 512, 1024}
        server.app.state.media_render_quality_min = 50
        server.app.state.media_render_quality_max = 85
        server.app.state.media_render_sign_bucket_seconds = 3600
        server.app.state.media_render_signing_secret = "unit-test-secret"
        server.app.state.media_public_base_url = media_public_base_url
        server.app.state.media_render_cache_enabled = True
        server.app.state.media_render_cache_max_items = 2
        server.app.state.media_render_cache_ttl_seconds = 300
        server.app.state.media_render_cache = OrderedDict()
        server.app.state.media_render_cache_lock = asyncio.Lock()
        server.app.state.media_render_inflight_tasks = {}
        server.app.state.media_render_inflight_lock = asyncio.Lock()

    def test_build_render_url_is_stable_within_sign_bucket(self) -> None:
        request = _FakeRequest(base_url="https://example.com/")
        with patch("backend.server.time.time", return_value=1_700_000_000):
            url_a = server._build_media_render_url(request, asset_id="asset_1")
        with patch("backend.server.time.time", return_value=1_700_000_100):
            url_b = server._build_media_render_url(request, asset_id="asset_1")

        query_a = parse_qs(urlparse(url_a).query)
        query_b = parse_qs(urlparse(url_b).query)
        self.assertEqual(query_a["exp"][0], query_b["exp"][0])
        self.assertEqual(query_a["sig"][0], query_b["sig"][0])

    def test_build_render_url_changes_per_request_when_bucket_disabled(self) -> None:
        request = _FakeRequest(base_url="https://example.com/")
        server.app.state.media_render_sign_bucket_seconds = 0
        with patch("backend.server.time.time", return_value=1_700_000_000):
            url_a = server._build_media_render_url(request, asset_id="asset_1")
        with patch("backend.server.time.time", return_value=1_700_000_100):
            url_b = server._build_media_render_url(request, asset_id="asset_1")

        query_a = parse_qs(urlparse(url_a).query)
        query_b = parse_qs(urlparse(url_b).query)
        self.assertNotEqual(query_a["exp"][0], query_b["exp"][0])

    def test_media_render_cache_hit_miss_and_lru_eviction(self) -> None:
        async def _scenario() -> None:
            await server._media_render_cache_set(
                "a",
                bytes_data=b"a",
                content_type="image/jpeg",
                now_ts=1000,
            )
            hit_a = await server._media_render_cache_get("a", 1001)
            self.assertEqual(hit_a, (b"a", "image/jpeg"))

            await server._media_render_cache_set(
                "b",
                bytes_data=b"b",
                content_type="image/jpeg",
                now_ts=1002,
            )
            await server._media_render_cache_set(
                "c",
                bytes_data=b"c",
                content_type="image/jpeg",
                now_ts=1003,
            )
            hit_b = await server._media_render_cache_get("b", 1004)
            hit_c = await server._media_render_cache_get("c", 1004)
            # a는 max_items=2에서 가장 오래 사용되지 않은 항목이므로 제거되어야 한다.
            miss_a = await server._media_render_cache_get("a", 1004)
            self.assertEqual(hit_b, (b"b", "image/jpeg"))
            self.assertEqual(hit_c, (b"c", "image/jpeg"))
            self.assertIsNone(miss_a)

        asyncio.run(_scenario())

    def test_singleflight_renders_once_for_concurrent_same_variant(self) -> None:
        async def _scenario() -> None:
            call_count: dict[str, int] = {"value": 0}

            async def factory() -> tuple[bytes, str, str, str]:
                call_count["value"] += 1
                await asyncio.sleep(0.05)
                return b"img", "image/jpeg", "usr_1", "profile"

            first, second = await asyncio.gather(
                server._run_media_render_singleflight("same-key", factory),
                server._run_media_render_singleflight("same-key", factory),
            )
            self.assertEqual(first, second)
            self.assertEqual(call_count["value"], 1)
            self.assertEqual(server.app.state.media_render_inflight_tasks, {})

        asyncio.run(_scenario())

    def test_media_render_storage_errors_return_detail_code_and_request_id(self) -> None:
        cases: list[tuple[str, int]] = [
            ("MEDIA_GCS_PERMISSION_DENIED", 503),
            ("MEDIA_FETCH_FAILED", 502),
        ]

        with TestClient(server.app) as client:
            for code, status_code in cases:
                with self.subTest(code=code):
                    asset_id = f"asset_{code.lower()}"
                    request_id = f"req-render-{code.lower()}"
                    server.app.state.auth_service = _FakeAuthService(
                        object_key=f"media/usr_render/profile/{asset_id}/original.jpg",
                    )
                    server.app.state.media_storage = _FailingFetchMediaStorage(
                        error=MediaStorageError(
                            code=code,
                            message="Media storage fetch failed.",
                            status_code=status_code,
                        ),
                    )
                    self._prime_media_render_runtime(media_public_base_url="http://testserver")

                    url = server._build_media_render_url(
                        _FakeRequest(base_url="http://testserver/"),
                        asset_id=asset_id,
                    )
                    parsed = urlparse(url)
                    response = client.get(
                        f"{parsed.path}?{parsed.query}",
                        headers={"X-Request-Id": request_id},
                    )

                    self.assertEqual(response.status_code, status_code)
                    detail = response.json()["detail"]
                    self.assertEqual(detail["code"], code)
                    self.assertEqual(detail["request_id"], request_id)


if __name__ == "__main__":
    unittest.main()
