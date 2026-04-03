import asyncio
import unittest
from collections import OrderedDict
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse
from unittest.mock import Mock, patch

import backend.server as server
from backend.modules.auth.service import AuthServiceError


class _FakeRequest:
    def __init__(self, base_url: str = "https://example.com/"):
        self.base_url = base_url


class MediaRenderRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original_state = {}
        self._state_keys = [
            "media_render_default_width",
            "media_render_default_quality",
            "media_render_url_ttl_seconds",
            "media_render_sign_bucket_seconds",
            "media_render_signing_secret",
            "media_public_base_url",
            "media_render_cache_enabled",
            "media_render_cache_max_items",
            "media_render_cache_ttl_seconds",
            "media_render_cache",
            "media_render_cache_lock",
            "media_render_inflight_tasks",
            "media_render_inflight_lock",
        ]
        if not hasattr(server.app, "state"):
            server.app.state = SimpleNamespace()
        for key in self._state_keys:
            if hasattr(server.app.state, key):
                self._original_state[key] = getattr(server.app.state, key)
        server.app.state.media_render_default_width = 512
        server.app.state.media_render_default_quality = 75
        server.app.state.media_render_url_ttl_seconds = 86_400
        server.app.state.media_render_sign_bucket_seconds = 3600
        server.app.state.media_render_signing_secret = "unit-test-secret"
        server.app.state.media_public_base_url = ""
        server.app.state.media_render_cache_enabled = True
        server.app.state.media_render_cache_max_items = 2
        server.app.state.media_render_cache_ttl_seconds = 300
        server.app.state.media_render_cache = OrderedDict()
        server.app.state.media_render_cache_lock = asyncio.Lock()
        server.app.state.media_render_inflight_tasks = {}
        server.app.state.media_render_inflight_lock = asyncio.Lock()

    def tearDown(self) -> None:
        for key in self._state_keys:
            if key in self._original_state:
                setattr(server.app.state, key, self._original_state[key])
            elif hasattr(server.app.state, key):
                delattr(server.app.state, key)

    def test_build_render_url_is_stable_within_sign_bucket(self):
        request = _FakeRequest()
        with patch("backend.server.time.time", return_value=1_700_000_000):
            url_a = server._build_media_render_url(request, asset_id="asset_1")
        with patch("backend.server.time.time", return_value=1_700_000_100):
            url_b = server._build_media_render_url(request, asset_id="asset_1")

        query_a = parse_qs(urlparse(url_a).query)
        query_b = parse_qs(urlparse(url_b).query)
        self.assertEqual(query_a["exp"][0], query_b["exp"][0])
        self.assertEqual(query_a["sig"][0], query_b["sig"][0])

    def test_build_render_url_changes_per_request_when_bucket_disabled(self):
        request = _FakeRequest()
        server.app.state.media_render_sign_bucket_seconds = 0
        with patch("backend.server.time.time", return_value=1_700_000_000):
            url_a = server._build_media_render_url(request, asset_id="asset_1")
        with patch("backend.server.time.time", return_value=1_700_000_100):
            url_b = server._build_media_render_url(request, asset_id="asset_1")

        query_a = parse_qs(urlparse(url_a).query)
        query_b = parse_qs(urlparse(url_b).query)
        self.assertNotEqual(query_a["exp"][0], query_b["exp"][0])

    def test_media_render_cache_hit_miss_and_lru_eviction(self):
        async def _scenario():
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
            miss_b = await server._media_render_cache_get("b", 1004)
            hit_c = await server._media_render_cache_get("c", 1004)
            # a was least-recently-used and should be evicted at max_items=2.
            miss_a = await server._media_render_cache_get("a", 1004)
            self.assertEqual(miss_b, (b"b", "image/jpeg"))
            self.assertEqual(hit_c, (b"c", "image/jpeg"))
            self.assertIsNone(miss_a)

        asyncio.run(_scenario())

    def test_media_render_cache_verified_drops_deleted_assets(self):
        async def _scenario():
            await server._media_render_cache_set(
                "asset_1:512:75:image/jpeg",
                bytes_data=b"a",
                content_type="image/jpeg",
                now_ts=1000,
            )
            auth_service = Mock()
            auth_service.get_media_asset.side_effect = AuthServiceError(
                code="AUTH_MEDIA_NOT_FOUND",
                message="Media asset not found.",
                status_code=404,
            )

            cached = await server._media_render_cache_get_verified(
                asset_id="asset_1",
                variant_key="asset_1:512:75:image/jpeg",
                now_ts=1001,
                auth_service=auth_service,
            )

            self.assertIsNone(cached)
            self.assertIsNone(await server._media_render_cache_get("asset_1:512:75:image/jpeg", 1001))

        asyncio.run(_scenario())

    def test_singleflight_renders_once_for_concurrent_same_variant(self):
        async def _scenario():
            call_count = {"value": 0}

            async def factory():
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


if __name__ == "__main__":
    unittest.main()
