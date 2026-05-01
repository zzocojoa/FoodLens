import asyncio
import hashlib
import io
import os
import sys
import types
import unittest
from collections import OrderedDict
from typing import Any
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["AUTH_EMAIL_VERIFICATION_REQUIRED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DELIVERY_MODE"] = "log"
os.environ.pop("DATABASE_URL", None)
sys.modules.setdefault("sentry_sdk", types.SimpleNamespace(init=lambda **_kwargs: None))
import backend.server as server  # noqa: E402
from backend.modules.media.service import MediaObjectPayload, MediaStorageError, MediaUploadResult  # noqa: E402
from backend.modules.ops.data_retention import (  # noqa: E402
    InMemoryRetentionStore,
    RetentionDataClass,
    RetentionRecord,
    RetentionStoreError,
)


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def _create_png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (4, 4), color=(48, 96, 160)).save(output, format="PNG")
    return output.getvalue()


def _create_jpeg_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (4, 4), color=(255, 255, 255)).save(output, format="JPEG")
    return output.getvalue()


class _FakeRequest:
    def __init__(self, *, base_url: str) -> None:
        self.base_url = base_url


class _RecordingMediaStorage:
    enabled: bool = True

    def __init__(self, *, delete_error: MediaStorageError | None) -> None:
        self.delete_error = delete_error
        self.deleted_object_keys: list[str] = []
        self.uploaded_asset_ids: list[str] = []
        self.uploaded_object_keys: list[str] = []
        self._upload_count = 0

    def upload_original(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        payload: bytes,
        filename: str | None = None,
    ) -> MediaUploadResult:
        self._upload_count += 1
        asset_id = f"asset_cleanup_{uuid4().hex[:10]}"
        extension = "png" if mime_type == "image/png" else "jpg"
        object_key = f"media/{user_id}/{scope}/{asset_id}/original.{extension}"
        self.uploaded_asset_ids.append(asset_id)
        self.uploaded_object_keys.append(object_key)
        return MediaUploadResult(
            asset_id=asset_id,
            object_key=object_key,
            mime_type=mime_type,
            size_bytes=len(payload),
            sha256=hashlib.sha256(payload).hexdigest(),
            created_at="2026-05-01T00:00:00Z",
        )

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload:
        return MediaObjectPayload(bytes_data=_create_jpeg_bytes(), mime_type="image/jpeg")

    def delete_original(self, *, object_key: str) -> None:
        if self.delete_error is not None:
            raise self.delete_error
        self.deleted_object_keys.append(object_key)


class _RegisterMediaAssetFailingAuthService:
    def __init__(self, *, delegate: Any) -> None:
        self._delegate = delegate

    def __getattr__(self, name: str) -> Any:
        return getattr(self._delegate, name)

    def register_media_asset(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        size_bytes: int,
        sha256: str,
        object_key: str,
        asset_id: str,
    ) -> dict[str, object]:
        raise server.AuthServiceError(
            code="AUTH_MEDIA_REGISTER_FAILED",
            message="Media metadata registration failed.",
            status_code=503,
            user_id=user_id,
        )


class _RegisterMediaAssetPersistFailingAuthService:
    def __init__(self, *, delegate: Any) -> None:
        self._delegate = delegate

    def __getattr__(self, name: str) -> Any:
        return getattr(self._delegate, name)

    def register_media_asset(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        size_bytes: int,
        sha256: str,
        object_key: str,
        asset_id: str,
    ) -> dict[str, object]:
        self._delegate.register_media_asset(
            user_id=user_id,
            scope=scope,
            mime_type=mime_type,
            size_bytes=size_bytes,
            sha256=sha256,
            object_key=object_key,
            asset_id=asset_id,
        )
        raise server.AuthStateStoreError("forced auth state save failure")


class _FailingRetentionStore(InMemoryRetentionStore):
    def add(self, record: RetentionRecord) -> None:
        raise RetentionStoreError("forced retention failure")


class MediaAssetCleanupTests(unittest.TestCase):
    @staticmethod
    def _unique_email(prefix: str) -> str:
        return f"{prefix}-{uuid4().hex[:10]}@example.com"

    def setUp(self) -> None:
        self._original_media_storage = getattr(server.app.state, "media_storage", None)
        self._original_retention_store = getattr(server.app.state, "retention_store", None)
        self._original_media_render_cache = getattr(server.app.state, "media_render_cache", None)
        self._original_media_render_cache_lock = getattr(server.app.state, "media_render_cache_lock", None)
        self._original_media_render_cache_enabled = getattr(server.app.state, "media_render_cache_enabled", None)
        self._prime_media_render_runtime()

    def tearDown(self) -> None:
        server.app.state.media_storage = self._original_media_storage
        server.app.state.retention_store = self._original_retention_store
        server.app.state.media_render_cache = self._original_media_render_cache
        server.app.state.media_render_cache_lock = self._original_media_render_cache_lock
        server.app.state.media_render_cache_enabled = self._original_media_render_cache_enabled

    def _prime_media_render_runtime(self) -> None:
        server.app.state.media_render_default_width = 512
        server.app.state.media_render_default_quality = 75
        server.app.state.media_render_webp_method = 4
        server.app.state.media_render_url_ttl_seconds = 86_400
        server.app.state.media_render_allowed_widths = {128, 256, 512, 1024}
        server.app.state.media_render_quality_min = 50
        server.app.state.media_render_quality_max = 85
        server.app.state.media_render_sign_bucket_seconds = 3600
        server.app.state.media_render_signing_secret = "unit-test-secret"
        server.app.state.media_public_base_url = ""
        server.app.state.media_render_cache_enabled = True
        server.app.state.media_render_cache_max_items = 4
        server.app.state.media_render_cache_ttl_seconds = 300
        server.app.state.media_render_cache = OrderedDict()
        server.app.state.media_render_cache_lock = asyncio.Lock()
        server.app.state.media_render_inflight_tasks = {}
        server.app.state.media_render_inflight_lock = asyncio.Lock()
        server.app.state.media_render_max_concurrent_misses = 2
        server.app.state.media_render_miss_semaphore = server._build_media_render_miss_semaphore(2)

    def _signup_and_verify(self, client: TestClient, *, email: str) -> dict[str, object]:
        signup_response = client.post(
            "/auth/email/signup",
            json={
                "email": email,
                "password": "Passw0rd!",
                "display_name": "Media Cleanup User",
                "locale": "ko-KR",
            },
        )
        self.assertEqual(signup_response.status_code, 200)
        signup_body = signup_response.json()

        verify_response = client.post(
            "/auth/email/verify",
            json={
                "email": email,
                "code": signup_body["verification_debug_code"],
            },
        )
        self.assertEqual(verify_response.status_code, 200)
        return verify_response.json()

    def _upload_media(self, client: TestClient, headers: dict[str, str]) -> dict[str, object]:
        upload_response = client.post(
            "/me/media/upload",
            files={"file": ("cleanup.png", _create_png_bytes(), "image/png")},
            data={"scope": "history"},
            headers=headers,
        )
        self.assertEqual(upload_response.status_code, 200)
        return upload_response.json()

    def test_delete_media_asset_requires_auth(self) -> None:
        with TestClient(server.app) as client:
            response = client.delete("/me/media/asset_missing")

        self.assertEqual(response.status_code, 401)

    def test_delete_media_asset_deletes_owned_uploaded_asset(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)
        retention_store = InMemoryRetentionStore()

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = retention_store
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-owned"))
            headers = _auth_headers(str(session["access_token"]))
            upload_body = self._upload_media(client, headers)
            asset_id = str(upload_body["asset"]["asset_id"])
            render_url = str(upload_body["asset"]["render_url"])

            first_render = client.get(render_url)
            self.assertEqual(first_render.status_code, 200)
            self.assertEqual(first_render.headers["x-media-render-cache"], "miss")

            delete_response = client.delete(f"/me/media/{asset_id}", headers=headers)
            self.assertEqual(delete_response.status_code, 200)
            self.assertTrue(delete_response.json()["deleted"])
            self.assertEqual(delete_response.json()["asset_id"], asset_id)

            deleted_render = client.get(render_url)
            self.assertEqual(deleted_render.status_code, 404)

        self.assertEqual(media_storage.deleted_object_keys, media_storage.uploaded_object_keys)
        self.assertEqual(retention_store.list_records(RetentionDataClass.ORIGINAL, 10), [])
        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=asset_id)

    def test_delete_media_asset_rejects_other_user_asset(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = InMemoryRetentionStore()
            self._prime_media_render_runtime()
            session_a = self._signup_and_verify(client, email=self._unique_email("cleanup-owner"))
            session_b = self._signup_and_verify(client, email=self._unique_email("cleanup-attacker"))
            headers_a = _auth_headers(str(session_a["access_token"]))
            headers_b = _auth_headers(str(session_b["access_token"]))
            upload_body = self._upload_media(client, headers_a)
            asset_id = str(upload_body["asset"]["asset_id"])

            delete_response = client.delete(f"/me/media/{asset_id}", headers=headers_b)
            self.assertEqual(delete_response.status_code, 403)

        self.assertEqual(media_storage.deleted_object_keys, [])
        asset = server.app.state.auth_service.get_media_asset(asset_id=asset_id)
        self.assertEqual(asset["asset_id"], asset_id)

    def test_delete_media_asset_preserves_metadata_when_storage_delete_fails(self) -> None:
        media_storage = _RecordingMediaStorage(
            delete_error=MediaStorageError(
                code="MEDIA_DELETE_FAILED",
                message="Failed to delete media object from storage.",
                status_code=502,
            )
        )

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = InMemoryRetentionStore()
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-storage-fail"))
            headers = _auth_headers(str(session["access_token"]))
            upload_body = self._upload_media(client, headers)
            asset_id = str(upload_body["asset"]["asset_id"])

            delete_response = client.delete(f"/me/media/{asset_id}", headers=headers)
            self.assertEqual(delete_response.status_code, 502)

        asset = server.app.state.auth_service.get_media_asset(asset_id=asset_id)
        self.assertEqual(asset["asset_id"], asset_id)

    def test_delete_media_asset_accepts_missing_storage_object_after_owner_check(self) -> None:
        media_storage = _RecordingMediaStorage(
            delete_error=MediaStorageError(
                code="MEDIA_NOT_FOUND",
                message="Media object not found.",
                status_code=404,
            )
        )

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = InMemoryRetentionStore()
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-storage-missing"))
            headers = _auth_headers(str(session["access_token"]))
            upload_body = self._upload_media(client, headers)
            asset_id = str(upload_body["asset"]["asset_id"])

            delete_response = client.delete(f"/me/media/{asset_id}", headers=headers)
            self.assertEqual(delete_response.status_code, 200)
            self.assertTrue(delete_response.json()["deleted"])

        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=asset_id)

    def test_upload_deletes_uploaded_object_when_auth_registration_fails(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = InMemoryRetentionStore()
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-register-fail"))
            headers = _auth_headers(str(session["access_token"]))
            original_auth_service = server.app.state.auth_service
            server.app.state.auth_service = _RegisterMediaAssetFailingAuthService(delegate=original_auth_service)
            try:
                upload_response = client.post(
                    "/me/media/upload",
                    files={"file": ("cleanup.png", _create_png_bytes(), "image/png")},
                    data={"scope": "history"},
                    headers=headers,
                )
            finally:
                server.app.state.auth_service = original_auth_service

        self.assertEqual(upload_response.status_code, 503)
        self.assertEqual(upload_response.json()["detail"]["code"], "AUTH_MEDIA_REGISTER_FAILED")
        self.assertEqual(media_storage.deleted_object_keys, media_storage.uploaded_object_keys)
        self.assertEqual(len(media_storage.uploaded_asset_ids), 1)
        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=media_storage.uploaded_asset_ids[0])

    def test_upload_deletes_uploaded_object_and_metadata_when_auth_persistence_fails(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)

        with TestClient(server.app, raise_server_exceptions=False) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = InMemoryRetentionStore()
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-auth-state-fail"))
            headers = _auth_headers(str(session["access_token"]))
            original_auth_service = server.app.state.auth_service
            server.app.state.auth_service = _RegisterMediaAssetPersistFailingAuthService(delegate=original_auth_service)
            try:
                upload_response = client.post(
                    "/me/media/upload",
                    files={"file": ("cleanup.png", _create_png_bytes(), "image/png")},
                    data={"scope": "history"},
                    headers=headers,
                )
            finally:
                server.app.state.auth_service = original_auth_service

        self.assertEqual(upload_response.status_code, 500)
        self.assertEqual(upload_response.json()["detail"]["code"], "AUTH_STATE_STORE_FAILED")
        self.assertEqual(media_storage.deleted_object_keys, media_storage.uploaded_object_keys)
        self.assertEqual(len(media_storage.uploaded_asset_ids), 1)
        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=media_storage.uploaded_asset_ids[0])

    def test_upload_deletes_uploaded_object_and_metadata_when_retention_registration_fails(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)

        with TestClient(server.app, raise_server_exceptions=False) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = _FailingRetentionStore()
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-retention-fail"))
            headers = _auth_headers(str(session["access_token"]))
            upload_response = client.post(
                "/me/media/upload",
                files={"file": ("cleanup.png", _create_png_bytes(), "image/png")},
                data={"scope": "history"},
                headers=headers,
            )

        self.assertEqual(upload_response.status_code, 500)
        self.assertEqual(upload_response.json()["detail"]["code"], "MEDIA_RETENTION_RECORD_ADD_FAILED")
        self.assertEqual(media_storage.deleted_object_keys, media_storage.uploaded_object_keys)
        self.assertEqual(len(media_storage.uploaded_asset_ids), 1)
        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=media_storage.uploaded_asset_ids[0])

    def test_upload_deletes_uploaded_object_when_retention_store_is_missing(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)

        with TestClient(server.app, raise_server_exceptions=False) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = None
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-retention-missing"))
            headers = _auth_headers(str(session["access_token"]))
            upload_response = client.post(
                "/me/media/upload",
                files={"file": ("cleanup.png", _create_png_bytes(), "image/png")},
                data={"scope": "history"},
                headers=headers,
            )

        self.assertEqual(upload_response.status_code, 500)
        self.assertEqual(upload_response.json()["detail"]["code"], "MEDIA_RETENTION_RECORD_ADD_FAILED")
        self.assertEqual(media_storage.deleted_object_keys, media_storage.uploaded_object_keys)
        self.assertEqual(len(media_storage.uploaded_asset_ids), 1)
        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=media_storage.uploaded_asset_ids[0])


if __name__ == "__main__":
    unittest.main()
