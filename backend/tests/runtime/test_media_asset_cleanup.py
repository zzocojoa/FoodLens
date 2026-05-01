import asyncio
import hashlib
import io
import os
import sys
import types
import unittest
from collections import OrderedDict
from datetime import datetime, timezone
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
    object_prefix: str = "media"

    def __init__(self, *, delete_error: MediaStorageError | None) -> None:
        self.delete_error = delete_error
        self.deleted_object_keys: list[str] = []
        self.deleted_generations: list[int | None] = []
        self.uploaded_asset_ids: list[str] = []
        self.uploaded_object_keys: list[str] = []
        self.uploaded_generations: list[int] = []
        self.generation_lookup_keys: list[str] = []
        self._payloads_by_object_key: dict[str, tuple[bytes, str]] = {}
        self._generations_by_object_key: dict[str, int] = {}
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
        generation = self._upload_count + 100
        self.uploaded_asset_ids.append(asset_id)
        self.uploaded_object_keys.append(object_key)
        self.uploaded_generations.append(generation)
        self._payloads_by_object_key[object_key] = (payload, mime_type)
        self._generations_by_object_key[object_key] = generation
        return MediaUploadResult(
            asset_id=asset_id,
            object_key=object_key,
            mime_type=mime_type,
            size_bytes=len(payload),
            sha256=hashlib.sha256(payload).hexdigest(),
            created_at="2026-05-01T00:00:00Z",
            generation=generation,
        )

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload:
        payload = self._payloads_by_object_key.get(object_key)
        if payload is None:
            return MediaObjectPayload(bytes_data=_create_jpeg_bytes(), mime_type="image/jpeg")
        return MediaObjectPayload(bytes_data=payload[0], mime_type=payload[1])

    def get_original_generation(self, *, object_key: str) -> int:
        self.generation_lookup_keys.append(object_key)
        return self._generations_by_object_key.get(object_key, 987)

    def delete_original(self, *, object_key: str, generation: int | None = None) -> None:
        if self.delete_error is not None:
            raise self.delete_error
        self.deleted_object_keys.append(object_key)
        self.deleted_generations.append(generation)


class _ForeignObjectKeyMediaStorage(_RecordingMediaStorage):
    def upload_original(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        payload: bytes,
        filename: str | None = None,
    ) -> MediaUploadResult:
        upload = super().upload_original(
            user_id=user_id,
            scope=scope,
            mime_type=mime_type,
            payload=payload,
            filename=filename,
        )
        foreign_object_key = f"media/foreign-user/{scope}/{upload.asset_id}/original.png"
        self.uploaded_object_keys[-1] = foreign_object_key
        return MediaUploadResult(
            asset_id=upload.asset_id,
            object_key=foreign_object_key,
            mime_type=upload.mime_type,
            size_bytes=upload.size_bytes,
            sha256=upload.sha256,
            created_at=upload.created_at,
            generation=upload.generation,
        )


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
        object_generation: int | None = None,
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
        object_generation: int | None = None,
    ) -> dict[str, object]:
        self._delegate.register_media_asset(
            user_id=user_id,
            scope=scope,
            mime_type=mime_type,
            size_bytes=size_bytes,
            sha256=sha256,
            object_key=object_key,
            asset_id=asset_id,
            object_generation=object_generation,
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
        self.assertEqual(media_storage.deleted_generations, media_storage.uploaded_generations)
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

        retention_store = InMemoryRetentionStore()

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = retention_store
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-storage-fail"))
            headers = _auth_headers(str(session["access_token"]))
            upload_body = self._upload_media(client, headers)
            asset_id = str(upload_body["asset"]["asset_id"])

            delete_response = client.delete(f"/me/media/{asset_id}", headers=headers)
            self.assertEqual(delete_response.status_code, 502)

        asset = server.app.state.auth_service.get_media_asset(asset_id=asset_id)
        self.assertEqual(asset["asset_id"], asset_id)
        retry_records = retention_store.list_records(RetentionDataClass.ORIGINAL, 10)
        self.assertEqual(len(retry_records), 1)
        self.assertEqual(retry_records[0].record_id, asset_id)
        self.assertEqual(retry_records[0].storage_key, media_storage.uploaded_object_keys[0])
        self.assertEqual(retry_records[0].object_generation, media_storage.uploaded_generations[0])
        self.assertEqual(retry_records[0].created_at.year, 1970)

    def test_delete_media_asset_rejects_populated_generation_with_object_key_mismatch(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)
        retention_store = InMemoryRetentionStore()

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = retention_store
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-key-mismatch"))
            headers = _auth_headers(str(session["access_token"]))
            user_id = str(session["user"]["id"])
            payload = _create_png_bytes()
            upload = media_storage.upload_original(
                user_id=user_id,
                scope="history",
                mime_type="image/png",
                payload=payload,
                filename="owned.png",
            )
            server.app.state.auth_service.register_media_asset(
                user_id=user_id,
                scope="history",
                mime_type=upload.mime_type,
                size_bytes=upload.size_bytes,
                sha256=upload.sha256,
                object_key=f"media/foreign-user/history/{upload.asset_id}/original.png",
                asset_id=upload.asset_id,
                object_generation=upload.generation,
            )

            delete_response = client.delete(f"/me/media/{upload.asset_id}", headers=headers)

        self.assertEqual(delete_response.status_code, 409)
        self.assertEqual(delete_response.json()["detail"]["code"], "MEDIA_OBJECT_KEY_MISMATCH")
        self.assertEqual(media_storage.deleted_object_keys, [])
        self.assertEqual(retention_store.list_records(RetentionDataClass.ORIGINAL, 10), [])

    def test_retention_retry_reconciles_failed_media_delete(self) -> None:
        media_storage = _RecordingMediaStorage(
            delete_error=MediaStorageError(
                code="MEDIA_DELETE_FAILED",
                message="Failed to delete media object from storage.",
                status_code=502,
            )
        )
        retention_store = InMemoryRetentionStore()

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = retention_store
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-retry"))
            headers = _auth_headers(str(session["access_token"]))
            upload_body = self._upload_media(client, headers)
            asset_id = str(upload_body["asset"]["asset_id"])

            delete_response = client.delete(f"/me/media/{asset_id}", headers=headers)
            self.assertEqual(delete_response.status_code, 502)

        retry_record = retention_store.list_records(RetentionDataClass.ORIGINAL, 10)[0]
        media_storage.delete_error = None
        self.assertTrue(server._delete_media_retention_record(retry_record))
        retention_store.remove(retry_record.record_id)

        self.assertEqual(media_storage.deleted_object_keys, [media_storage.uploaded_object_keys[0]])
        self.assertEqual(media_storage.deleted_generations, [media_storage.uploaded_generations[0]])
        self.assertEqual(retention_store.list_records(RetentionDataClass.ORIGINAL, 10), [])
        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=asset_id)

    def test_delete_legacy_media_asset_backfills_generation_before_delete(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)
        retention_store = InMemoryRetentionStore()

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = retention_store
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-legacy-delete"))
            headers = _auth_headers(str(session["access_token"]))
            user_id = str(session["user"]["id"])
            payload = _create_png_bytes()
            upload = media_storage.upload_original(
                user_id=user_id,
                scope="history",
                mime_type="image/png",
                payload=payload,
                filename="legacy.png",
            )
            server.app.state.auth_service.register_media_asset(
                user_id=user_id,
                scope="history",
                mime_type=upload.mime_type,
                size_bytes=upload.size_bytes,
                sha256=upload.sha256,
                object_key=upload.object_key,
                asset_id=upload.asset_id,
                object_generation=None,
            )
            retention_store.add(
                RetentionRecord(
                    record_id=upload.asset_id,
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=datetime.now(timezone.utc),
                    user_id=user_id,
                    storage_key=upload.object_key,
                    object_generation=None,
                )
            )

            delete_response = client.delete(f"/me/media/{upload.asset_id}", headers=headers)

        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(media_storage.generation_lookup_keys, [upload.object_key])
        self.assertEqual(media_storage.deleted_generations, [upload.generation])
        self.assertEqual(retention_store.list_records(RetentionDataClass.ORIGINAL, 10), [])

    def test_delete_legacy_media_asset_retry_keeps_backfilled_generation(self) -> None:
        media_storage = _RecordingMediaStorage(
            delete_error=MediaStorageError(
                code="MEDIA_DELETE_FAILED",
                message="Failed to delete media object from storage.",
                status_code=502,
            )
        )
        retention_store = InMemoryRetentionStore()

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = retention_store
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-legacy-delete-fail"))
            headers = _auth_headers(str(session["access_token"]))
            user_id = str(session["user"]["id"])
            payload = _create_png_bytes()
            upload = media_storage.upload_original(
                user_id=user_id,
                scope="history",
                mime_type="image/png",
                payload=payload,
                filename="legacy.png",
            )
            server.app.state.auth_service.register_media_asset(
                user_id=user_id,
                scope="history",
                mime_type=upload.mime_type,
                size_bytes=upload.size_bytes,
                sha256=upload.sha256,
                object_key=upload.object_key,
                asset_id=upload.asset_id,
                object_generation=None,
            )
            retention_store.add(
                RetentionRecord(
                    record_id=upload.asset_id,
                    data_class=RetentionDataClass.ORIGINAL,
                    created_at=datetime.now(timezone.utc),
                    user_id=user_id,
                    storage_key=upload.object_key,
                    object_generation=None,
                )
            )

            delete_response = client.delete(f"/me/media/{upload.asset_id}", headers=headers)

        self.assertEqual(delete_response.status_code, 502)
        retry_records = retention_store.list_records(RetentionDataClass.ORIGINAL, 10)
        self.assertEqual(len(retry_records), 1)
        self.assertEqual(retry_records[0].object_generation, upload.generation)

    def test_retention_retry_backfills_missing_generation_before_delete(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)
        retention_store = InMemoryRetentionStore()

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = retention_store
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-legacy-retry"))
            user_id = str(session["user"]["id"])
            payload = _create_png_bytes()
            upload = media_storage.upload_original(
                user_id=user_id,
                scope="history",
                mime_type="image/png",
                payload=payload,
                filename="legacy.png",
            )
            server.app.state.auth_service.register_media_asset(
                user_id=user_id,
                scope="history",
                mime_type=upload.mime_type,
                size_bytes=upload.size_bytes,
                sha256=upload.sha256,
                object_key=upload.object_key,
                asset_id=upload.asset_id,
                object_generation=None,
            )

        record = RetentionRecord(
            record_id=upload.asset_id,
            data_class=RetentionDataClass.ORIGINAL,
            created_at=datetime.now(timezone.utc),
            user_id=user_id,
            request_id="req-legacy-retry",
            storage_key=upload.object_key,
            object_generation=None,
        )

        self.assertTrue(server._delete_media_retention_record(record))
        self.assertEqual(media_storage.generation_lookup_keys, [upload.object_key])
        self.assertEqual(media_storage.deleted_generations, [upload.generation])
        with self.assertRaises(server.AuthServiceError):
            server.app.state.auth_service.get_media_asset(asset_id=upload.asset_id)

    def test_retention_retry_does_not_loop_on_generation_backfill_mismatch(self) -> None:
        media_storage = _RecordingMediaStorage(delete_error=None)

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = InMemoryRetentionStore()
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-mismatch-retry"))
            user_id = str(session["user"]["id"])
            payload = _create_png_bytes()
            upload = media_storage.upload_original(
                user_id=user_id,
                scope="history",
                mime_type="image/png",
                payload=payload,
                filename="legacy.png",
            )
            server.app.state.auth_service.register_media_asset(
                user_id=user_id,
                scope="history",
                mime_type=upload.mime_type,
                size_bytes=upload.size_bytes + 1,
                sha256=upload.sha256,
                object_key=upload.object_key,
                asset_id=upload.asset_id,
                object_generation=None,
            )

        record = RetentionRecord(
            record_id=upload.asset_id,
            data_class=RetentionDataClass.ORIGINAL,
            created_at=datetime.now(timezone.utc),
            user_id=user_id,
            request_id="req-legacy-mismatch",
            storage_key=upload.object_key,
            object_generation=None,
        )

        self.assertTrue(server._delete_media_retention_record(record))
        self.assertEqual(media_storage.deleted_object_keys, [])

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

    def test_upload_compensation_refuses_foreign_object_key(self) -> None:
        media_storage = _ForeignObjectKeyMediaStorage(delete_error=None)

        with TestClient(server.app) as client:
            server.app.state.media_storage = media_storage
            server.app.state.retention_store = InMemoryRetentionStore()
            self._prime_media_render_runtime()
            session = self._signup_and_verify(client, email=self._unique_email("cleanup-foreign-key"))
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
        self.assertEqual(media_storage.deleted_object_keys, [])
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
