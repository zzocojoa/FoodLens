from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Protocol
from uuid import uuid4

logger = logging.getLogger("foodlens.media")


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


def _coerce_status_code(raw_value: object) -> int | None:
    if isinstance(raw_value, int):
        return raw_value
    if isinstance(raw_value, str) and raw_value.isdigit():
        return int(raw_value)
    enum_value = getattr(raw_value, "value", None)
    if isinstance(enum_value, int):
        return enum_value
    if isinstance(enum_value, str) and enum_value.isdigit():
        return int(enum_value)
    return None


def _status_code_from_error(exc: Exception) -> int | None:
    for attr_name in ("status_code", "status"):
        candidate = _coerce_status_code(getattr(exc, attr_name, None))
        if candidate is not None:
            return candidate

    candidate = _coerce_status_code(getattr(exc, "code", None))
    if candidate is not None:
        return candidate

    response = getattr(exc, "response", None)
    if response is not None:
        for attr_name in ("status_code", "status"):
            candidate = _coerce_status_code(getattr(response, attr_name, None))
            if candidate is not None:
                return candidate

    return None


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

    def delete_original(self, *, object_key: str) -> None: ...


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

    def delete_original(self, *, object_key: str) -> None:
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
        service_account_json: str | None = None,
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
        try:
            if service_account_json:
                from google.oauth2 import service_account  # type: ignore

                info = json.loads(service_account_json)
                credentials = service_account.Credentials.from_service_account_info(info)
                self._client = storage.Client(
                    project=info.get("project_id"),
                    credentials=credentials,
                )
            else:
                self._client = storage.Client()
            self._bucket = self._client.bucket(self.bucket_name)
        except Exception as exc:
            raise MediaStorageError(
                code="MEDIA_STORAGE_INIT_FAILED",
                message="Failed to initialize GCS media storage client.",
                status_code=503,
            ) from exc

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
        try:
            blob.upload_from_string(payload, content_type=mime_type)
        except Exception as exc:
            status_code = _status_code_from_error(exc)
            if status_code == 404:
                raise MediaStorageError(
                    code="MEDIA_GCS_BUCKET_NOT_FOUND",
                    message="Configured media bucket was not found.",
                    status_code=503,
                ) from exc
            if status_code in {401, 403}:
                raise MediaStorageError(
                    code="MEDIA_GCS_PERMISSION_DENIED",
                    message="Media bucket access denied.",
                    status_code=503,
                ) from exc
            raise MediaStorageError(
                code="MEDIA_UPLOAD_FAILED",
                message="Failed to upload media to storage.",
                status_code=502,
            ) from exc

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
            status_code = _status_code_from_error(exc)
            if status_code in {401, 403}:
                raise MediaStorageError(
                    code="MEDIA_GCS_PERMISSION_DENIED",
                    message="Media bucket access denied.",
                    status_code=503,
                ) from exc
            if status_code is not None and status_code != 404:
                raise MediaStorageError(
                    code="MEDIA_FETCH_FAILED",
                    message="Failed to fetch media object from storage.",
                    status_code=502,
                ) from exc
            raise MediaStorageError(
                code="MEDIA_NOT_FOUND",
                message="Media object not found.",
                status_code=404,
            ) from exc
        mime_type = (blob.content_type or "").strip().lower() or "application/octet-stream"
        return MediaObjectPayload(bytes_data=payload, mime_type=mime_type)

    def delete_original(self, *, object_key: str) -> None:
        blob = self._bucket.blob(object_key)
        try:
            deleted = blob.delete()
        except Exception as exc:
            status_code = _status_code_from_error(exc)
            if status_code in {401, 403}:
                raise MediaStorageError(
                    code="MEDIA_GCS_PERMISSION_DENIED",
                    message="Media bucket access denied.",
                    status_code=503,
                ) from exc
            if status_code == 404:
                raise MediaStorageError(
                    code="MEDIA_NOT_FOUND",
                    message="Media object not found.",
                    status_code=404,
                ) from exc
            raise MediaStorageError(
                code="MEDIA_DELETE_FAILED",
                message="Failed to delete media object from storage.",
                status_code=502,
            ) from exc

        if deleted is False:
            raise MediaStorageError(
                code="MEDIA_NOT_FOUND",
                message="Media object not found.",
                status_code=404,
            )


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
    service_account_json = (get_env("GCP_SERVICE_ACCOUNT_JSON", None) or "").strip() or None

    try:
        return GcsMediaStorage(
            bucket_name=bucket_name,
            object_prefix=object_prefix,
            max_upload_bytes=max_upload_bytes,
            service_account_json=service_account_json,
        )
    except MediaStorageError as error:
        logger.warning(
            "[Media] storage fallback to disabled backend=gcs code=%s status=%s bucket=%s",
            error.code,
            error.status_code,
            bucket_name,
        )
        return DisabledMediaStorage()
