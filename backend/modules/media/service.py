from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Protocol
from uuid import uuid4


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_ext_from_mime(mime_type: str) -> str:
    normalized = (mime_type or "").strip().lower()
    if normalized == "image/jpeg":
        return ".jpg"
    if normalized == "image/png":
        return ".png"
    if normalized == "image/webp":
        return ".webp"
    return ".bin"


class MediaStorageError(Exception):
    def __init__(self, *, code: str, message: str, status_code: int = 500):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(slots=True)
class MediaUploadResult:
    asset_id: str
    object_key: str
    mime_type: str
    size_bytes: int
    sha256: str
    created_at: str


@dataclass(slots=True)
class MediaObjectPayload:
    bytes_data: bytes
    mime_type: str


class MediaStorage(Protocol):
    enabled: bool

    def upload_original(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        payload: bytes,
        filename: str | None = None,
    ) -> MediaUploadResult: ...

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload: ...


class DisabledMediaStorage:
    enabled = False

    def upload_original(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        payload: bytes,
        filename: str | None = None,
    ) -> MediaUploadResult:
        raise MediaStorageError(
            code="MEDIA_STORAGE_DISABLED",
            message="Media storage is disabled.",
            status_code=503,
        )

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload:
        raise MediaStorageError(
            code="MEDIA_STORAGE_DISABLED",
            message="Media storage is disabled.",
            status_code=503,
        )


class GcsMediaStorage:
    enabled = True

    def __init__(
        self,
        *,
        bucket_name: str,
        object_prefix: str = "media",
        max_upload_bytes: int = 10 * 1024 * 1024,
    ):
        self.bucket_name = bucket_name
        self.object_prefix = object_prefix.strip().strip("/") or "media"
        self.max_upload_bytes = max(1_000_000, int(max_upload_bytes))

        try:
            from google.cloud import storage  # type: ignore
        except Exception as exc:  # pragma: no cover - import guard
            raise MediaStorageError(
                code="MEDIA_STORAGE_DEPENDENCY_MISSING",
                message="google-cloud-storage is not installed.",
                status_code=500,
            ) from exc

        self._storage = storage
        self._client = storage.Client()
        self._bucket = self._client.bucket(self.bucket_name)

    def upload_original(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        payload: bytes,
        filename: str | None = None,
    ) -> MediaUploadResult:
        if len(payload) <= 0:
            raise MediaStorageError(
                code="MEDIA_EMPTY_FILE",
                message="Uploaded media payload is empty.",
                status_code=400,
            )
        if len(payload) > self.max_upload_bytes:
            raise MediaStorageError(
                code="MEDIA_FILE_TOO_LARGE",
                message="Uploaded media payload is too large.",
                status_code=413,
            )

        asset_id = f"asset_{uuid4().hex}"
        extension = _safe_ext_from_mime(mime_type)
        object_key = (
            f"{self.object_prefix}/{user_id.strip()}/{scope.strip()}/{asset_id}/original{extension}"
        )
        sha256 = hashlib.sha256(payload).hexdigest()
        created_at = _utc_now_iso()

        blob = self._bucket.blob(object_key)
        blob.cache_control = "private, max-age=0, no-store"
        blob.upload_from_string(payload, content_type=mime_type)

        return MediaUploadResult(
            asset_id=asset_id,
            object_key=object_key,
            mime_type=mime_type,
            size_bytes=len(payload),
            sha256=sha256,
            created_at=created_at,
        )

    def fetch_original(self, *, object_key: str) -> MediaObjectPayload:
        blob = self._bucket.blob(object_key)
        try:
            payload = blob.download_as_bytes()
        except Exception as exc:
            raise MediaStorageError(
                code="MEDIA_NOT_FOUND",
                message="Media object not found.",
                status_code=404,
            ) from exc
        mime_type = (blob.content_type or "").strip().lower() or "application/octet-stream"
        return MediaObjectPayload(bytes_data=payload, mime_type=mime_type)


def build_media_storage_from_env(
    get_env: Callable[[str, str | None], str | None],
) -> MediaStorage:
    backend = (get_env("MEDIA_STORAGE_BACKEND", "gcs") or "gcs").strip().lower()
    if backend in {"disabled", "off", "none"}:
        return DisabledMediaStorage()

    bucket_name = (get_env("MEDIA_GCS_BUCKET", "") or "").strip()
    if not bucket_name:
        return DisabledMediaStorage()

    object_prefix = (get_env("MEDIA_GCS_PREFIX", "media") or "media").strip()
    max_upload_mb_raw = (get_env("MEDIA_MAX_UPLOAD_MB", "10") or "10").strip()
    try:
        max_upload_mb = float(max_upload_mb_raw)
    except ValueError:
        max_upload_mb = 10.0
    max_upload_bytes = int(max(1.0, max_upload_mb) * 1024 * 1024)

    return GcsMediaStorage(
        bucket_name=bucket_name,
        object_prefix=object_prefix,
        max_upload_bytes=max_upload_bytes,
    )

