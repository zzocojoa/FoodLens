import asyncio
import io
import logging
import os
import unittest
from collections import OrderedDict
from contextlib import ExitStack
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

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


class _SuccessfulFetchMediaStorage:
    enabled: bool = True

    def __init__(self, *, bytes_data: bytes) -> None:
        self.bytes_data = bytes_data
        self.fetch_count = 0

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload:
        self.fetch_count += 1
        return MediaObjectPayload(bytes_data=self.bytes_data, mime_type="image/jpeg")


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


def _create_jpeg_bytes() -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (4, 4), color=(255, 255, 255)).save(out, format="JPEG")
    return out.getvalue()


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
        server.app.state.media_render_webp_method = 4
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

            async def factory() -> tuple[bytes, str, str, str, dict[str, int]]:
                call_count["value"] += 1
                await asyncio.sleep(0.05)
                return b"img", "image/jpeg", "usr_1", "profile", {"fetch": 1}

            first, second = await asyncio.gather(
                server._run_media_render_singleflight("same-key", factory),
                server._run_media_render_singleflight("same-key", factory),
            )
            self.assertEqual(first, second)
            self.assertEqual(call_count["value"], 1)
            self.assertEqual(server.app.state.media_render_inflight_tasks, {})

        asyncio.run(_scenario())

    def test_singleflight_waiter_cancellation_does_not_cancel_shared_render(self) -> None:
        async def _scenario() -> None:
            render_started = asyncio.Event()
            release_render = asyncio.Event()
            call_count: dict[str, int] = {"value": 0}

            async def factory() -> tuple[bytes, str, str, str, dict[str, int]]:
                call_count["value"] += 1
                render_started.set()
                await release_render.wait()
                return b"img", "image/jpeg", "usr_1", "profile", {"fetch": 1}

            first_task = asyncio.create_task(
                server._run_media_render_singleflight("cancel-key", factory)
            )
            await render_started.wait()
            second_task = asyncio.create_task(
                server._run_media_render_singleflight("cancel-key", factory)
            )
            second_task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await second_task

            release_render.set()
            result = await first_task
            self.assertEqual(result[0], b"img")
            self.assertEqual(call_count["value"], 1)
            await asyncio.sleep(0)
            self.assertEqual(server.app.state.media_render_inflight_tasks, {})

        asyncio.run(_scenario())

    def test_media_render_response_headers_expose_cache_hit_and_miss(self) -> None:
        with TestClient(server.app) as client:
            asset_id = "asset_header_cache"
            server.app.state.auth_service = _FakeAuthService(
                object_key=f"media/usr_render/profile/{asset_id}/original.jpg",
            )
            media_storage = _SuccessfulFetchMediaStorage(
                bytes_data=_create_jpeg_bytes(),
            )
            server.app.state.media_storage = media_storage
            self._prime_media_render_runtime(media_public_base_url="http://testserver")

            url = server._build_media_render_url(
                _FakeRequest(base_url="http://testserver/"),
                asset_id=asset_id,
            )
            parsed = urlparse(url)
            first_response = client.get(f"{parsed.path}?{parsed.query}")
            second_response = client.get(f"{parsed.path}?{parsed.query}")

            self.assertEqual(first_response.status_code, 200)
            self.assertEqual(second_response.status_code, 200)
            self.assertEqual(first_response.headers["x-media-render-cache"], "miss")
            self.assertEqual(second_response.headers["x-media-render-cache"], "hit")
            self.assertIn("x-media-render-duration-ms", first_response.headers)
            self.assertIn("x-media-render-duration-ms", second_response.headers)
            self.assertIn("x-media-render-stage-ms", first_response.headers)
            self.assertNotIn("x-media-render-stage-ms", second_response.headers)
            self.assertIn("fetch=", first_response.headers["x-media-render-stage-ms"])
            self.assertIn("transform=", first_response.headers["x-media-render-stage-ms"])
            self.assertIn("touch=", first_response.headers["x-media-render-stage-ms"])
            self.assertEqual(media_storage.fetch_count, 1)

    def test_media_render_cache_disabled_header_does_not_report_miss(self) -> None:
        with TestClient(server.app) as client:
            asset_id = "asset_cache_disabled"
            server.app.state.auth_service = _FakeAuthService(
                object_key=f"media/usr_render/profile/{asset_id}/original.jpg",
            )
            media_storage = _SuccessfulFetchMediaStorage(
                bytes_data=_create_jpeg_bytes(),
            )
            server.app.state.media_storage = media_storage
            self._prime_media_render_runtime(media_public_base_url="http://testserver")
            server.app.state.media_render_cache_enabled = False

            url = server._build_media_render_url(
                _FakeRequest(base_url="http://testserver/"),
                asset_id=asset_id,
            )
            parsed = urlparse(url)
            first_response = client.get(f"{parsed.path}?{parsed.query}")
            second_response = client.get(f"{parsed.path}?{parsed.query}")

            self.assertEqual(first_response.status_code, 200)
            self.assertEqual(second_response.status_code, 200)
            self.assertEqual(first_response.headers["x-media-render-cache"], "disabled")
            self.assertEqual(second_response.headers["x-media-render-cache"], "disabled")
            self.assertEqual(media_storage.fetch_count, 2)

    def test_media_render_cache_uninitialized_header_does_not_report_miss(self) -> None:
        with TestClient(server.app) as client:
            asset_id = "asset_cache_uninitialized"
            server.app.state.auth_service = _FakeAuthService(
                object_key=f"media/usr_render/profile/{asset_id}/original.jpg",
            )
            media_storage = _SuccessfulFetchMediaStorage(
                bytes_data=_create_jpeg_bytes(),
            )
            server.app.state.media_storage = media_storage
            self._prime_media_render_runtime(media_public_base_url="http://testserver")
            server.app.state.media_render_cache = None

            url = server._build_media_render_url(
                _FakeRequest(base_url="http://testserver/"),
                asset_id=asset_id,
            )
            parsed = urlparse(url)
            response = client.get(f"{parsed.path}?{parsed.query}")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["x-media-render-cache"], "disabled")
            self.assertEqual(media_storage.fetch_count, 1)

    def test_media_render_cors_exposes_cache_diagnostics_headers(self) -> None:
        with TestClient(server.app) as client:
            asset_id = "asset_cors_headers"
            server.app.state.auth_service = _FakeAuthService(
                object_key=f"media/usr_render/profile/{asset_id}/original.jpg",
            )
            server.app.state.media_storage = _SuccessfulFetchMediaStorage(
                bytes_data=_create_jpeg_bytes(),
            )
            self._prime_media_render_runtime(media_public_base_url="http://testserver")

            url = server._build_media_render_url(
                _FakeRequest(base_url="http://testserver/"),
                asset_id=asset_id,
            )
            parsed = urlparse(url)
            response = client.get(
                f"{parsed.path}?{parsed.query}",
                headers={"Origin": "http://localhost:8081"},
            )

            exposed_headers = response.headers["access-control-expose-headers"].lower()
            self.assertEqual(response.status_code, 200)
            self.assertIn("x-request-id", exposed_headers)
            self.assertIn("x-media-render-cache", exposed_headers)
            self.assertIn("x-media-render-duration-ms", exposed_headers)
            self.assertIn("x-media-render-stage-ms", exposed_headers)

    def test_media_render_auto_format_cache_preserves_content_type(self) -> None:
        with TestClient(server.app) as client:
            asset_id = "asset_content_type"
            server.app.state.auth_service = _FakeAuthService(
                object_key=f"media/usr_render/profile/{asset_id}/original.jpg",
            )
            media_storage = _SuccessfulFetchMediaStorage(
                bytes_data=_create_jpeg_bytes(),
            )
            server.app.state.media_storage = media_storage
            self._prime_media_render_runtime(media_public_base_url="http://testserver")

            url = server._build_media_render_url(
                _FakeRequest(base_url="http://testserver/"),
                asset_id=asset_id,
            )
            parsed = urlparse(url)
            request_target = f"{parsed.path}?{parsed.query}"
            first_response = client.get(
                request_target,
                headers={"Accept": "image/webp,image/*,*/*;q=0.8"},
            )
            second_response = client.get(
                request_target,
                headers={"Accept": "image/webp,image/*,*/*;q=0.8"},
            )

            self.assertEqual(first_response.status_code, 200)
            self.assertEqual(second_response.status_code, 200)
            self.assertEqual(first_response.headers["content-type"], "image/webp")
            self.assertEqual(second_response.headers["content-type"], "image/webp")
            self.assertEqual(first_response.headers["x-media-render-cache"], "miss")
            self.assertEqual(second_response.headers["x-media-render-cache"], "hit")
            self.assertEqual(media_storage.fetch_count, 1)

    def test_media_render_webp_method_uses_configured_value(self) -> None:
        captured_methods: list[int] = []
        original_save = Image.Image.save

        def capture_save(
            image: Image.Image,
            fp: object,
            format: str | None = None,
            **params: object,
        ) -> None:
            if format == "WEBP":
                method = params.get("method")
                if not isinstance(method, int):
                    raise TypeError("WEBP method must be an integer.")
                captured_methods.append(method)
            original_save(image, fp, format=format, **params)

        with patch.object(Image.Image, "save", new=capture_save):
            rendered_bytes, content_type = server._render_image_bytes(
                source_bytes=_create_jpeg_bytes(),
                target_width=512,
                target_quality=75,
                target_format="webp",
                target_webp_method=3,
            )

        self.assertEqual(content_type, "image/webp")
        self.assertGreater(len(rendered_bytes), 0)
        self.assertEqual(captured_methods, [3])

    def test_media_render_invalid_signed_urls_do_not_leak_secret_values(self) -> None:
        with TestClient(server.app) as client:
            asset_id = "asset_forbidden"
            server.app.state.auth_service = _FakeAuthService(
                object_key=f"media/usr_render/profile/{asset_id}/original.jpg",
            )
            server.app.state.media_storage = _SuccessfulFetchMediaStorage(
                bytes_data=_create_jpeg_bytes(),
            )
            self._prime_media_render_runtime(media_public_base_url="http://testserver")

            url = server._build_media_render_url(
                _FakeRequest(base_url="http://testserver/"),
                asset_id=asset_id,
            )
            parsed = urlparse(url)
            query = parse_qs(parsed.query)
            leaked_sig = "leaky-signed-secret-token"
            invalid_query = (
                f"w={query['w'][0]}&q={query['q'][0]}&fmt={query['fmt'][0]}"
                f"&exp={query['exp'][0]}&sig={leaked_sig}"
            )
            expired_query = (
                f"w={query['w'][0]}&q={query['q'][0]}&fmt={query['fmt'][0]}"
                f"&exp=1&sig={leaked_sig}"
            )

            invalid_response = client.get(
                f"{parsed.path}?{invalid_query}",
                headers={"X-Request-Id": "req-invalid-signature"},
            )
            expired_response = client.get(
                f"{parsed.path}?{expired_query}",
                headers={"X-Request-Id": "req-expired-signature"},
            )

            self.assertEqual(invalid_response.status_code, 403)
            self.assertEqual(expired_response.status_code, 403)
            self.assertNotIn(leaked_sig, invalid_response.text)
            self.assertNotIn(leaked_sig, expired_response.text)
            self.assertNotIn("unit-test-secret", invalid_response.text)
            self.assertNotIn("unit-test-secret", expired_response.text)
            self.assertEqual(invalid_response.headers["x-request-id"], "req-invalid-signature")
            self.assertEqual(expired_response.headers["x-request-id"], "req-expired-signature")
            self.assertEqual(invalid_response.headers["x-media-render-cache"], "miss")
            self.assertEqual(expired_response.headers["x-media-render-cache"], "miss")
            self.assertNotIn("x-media-render-duration-ms", invalid_response.headers)

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
                    self.assertEqual(response.headers["x-request-id"], request_id)
                    self.assertEqual(response.headers["x-media-render-cache"], "miss")


if __name__ == "__main__":
    unittest.main()
