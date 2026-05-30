from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.modules.analysis_jobs import AnalysisJobStoreError
from backend.modules.auth.service import AuthServiceError
from backend.modules.media.service import MediaStorage, MediaStorageError
from backend.modules.ops.data_retention import RetentionStore
from backend.modules.ops.deletion_queue import (
    DeletionRequest,
    DeletionResult,
    DeletionStatus,
    DeletionTarget,
)

logger = logging.getLogger("foodlens.deletion")


@dataclass(frozen=True)
class UserDeletionSummary:
    deleted_history_count: int
    deleted_media_count: int
    revoked_sessions_count: int
    scrubbed_analysis_job_count: int


class UserDeletionHandler:
    def __init__(
        self,
        *,
        auth_service: Any,
        analysis_job_store: Any,
        media_storage: MediaStorage,
        retention_store: RetentionStore,
    ) -> None:
        self._auth_service = auth_service
        self._analysis_job_store = analysis_job_store
        self._media_storage = media_storage
        self._retention_store = retention_store

    def handle(self, item: DeletionRequest) -> DeletionResult:
        try:
            if item.target == DeletionTarget.DATA:
                user_id = self._require_user_id(item)
                scrubbed_analysis_job_count = self._scrub_user_analysis_jobs(user_id=user_id)
                self._delete_user_media_assets(user_id=user_id)
                reset_summary = self._auth_service.reset_user_data(user_id=user_id)
                logger.info(
                    "[Deletion] completed",
                    extra={
                        "target": item.target.value,
                        "request_id": item.request_id,
                        "reason": item.reason,
                        "deleted_history_count": reset_summary.get("deleted_history_count", 0),
                        "deleted_media_count": reset_summary.get("deleted_media_count", 0),
                        "revoked_sessions_count": reset_summary.get("revoked_sessions_count", 0),
                        "scrubbed_analysis_job_count": scrubbed_analysis_job_count,
                    },
                )
                return DeletionResult(
                    queue_id=item.queue_id,
                    status=DeletionStatus.DONE,
                    target=item.target,
                )

            if item.target == DeletionTarget.ACCOUNT:
                user_id = self._require_user_id(item)
                scrubbed_analysis_job_count = self._scrub_user_analysis_jobs(user_id=user_id)
                try:
                    summary = self._delete_user_media_assets(user_id=user_id)
                    account_summary = self._auth_service.delete_user_account(user_id=user_id)
                except AuthServiceError as error:
                    if error.code != "AUTH_USER_NOT_FOUND":
                        raise
                    logger.info(
                        "[Deletion] completed",
                        extra={
                            "target": item.target.value,
                            "request_id": item.request_id,
                            "reason": item.reason,
                            "deleted_history_count": 0,
                            "deleted_media_count": 0,
                            "revoked_sessions_count": 0,
                            "scrubbed_analysis_job_count": scrubbed_analysis_job_count,
                        },
                    )
                    return DeletionResult(
                        queue_id=item.queue_id,
                        status=DeletionStatus.DONE,
                        target=item.target,
                    )
                logger.info(
                    "[Deletion] completed",
                    extra={
                        "target": item.target.value,
                        "request_id": item.request_id,
                        "reason": item.reason,
                        "deleted_history_count": account_summary.get("deleted_history_count", 0),
                        "deleted_media_count": summary.deleted_media_count,
                        "revoked_sessions_count": account_summary.get("revoked_sessions_count", 0),
                        "scrubbed_analysis_job_count": scrubbed_analysis_job_count,
                    },
                )
                return DeletionResult(
                    queue_id=item.queue_id,
                    status=DeletionStatus.DONE,
                    target=item.target,
                )

            raise ValueError(f"Unsupported deletion target: {item.target.value}")
        except Exception as error:
            error_message = _deletion_error_message(error)
            logger.warning(
                "[Deletion] failed",
                extra={
                    "target": item.target.value,
                    "request_id": item.request_id,
                    "reason": item.reason,
                    "error_type": type(error).__name__,
                    "error_code": _deletion_error_code(error),
                },
            )
            return DeletionResult(
                queue_id=item.queue_id,
                status=DeletionStatus.FAILED,
                target=item.target,
                error=error_message,
            )

    def _delete_user_media_assets(self, *, user_id: str) -> UserDeletionSummary:
        assets = self._auth_service.list_media_assets_for_user(user_id=user_id)
        deleted_media_count = 0
        for asset in assets:
            object_key = str(asset.get("object_key", "")).strip()
            asset_id = str(asset.get("asset_id", "")).strip()
            if object_key:
                try:
                    object_generation = self._resolve_asset_generation(asset=asset)
                    self._media_storage.delete_original(
                        object_key=object_key,
                        generation=object_generation,
                    )
                except MediaStorageError as error:
                    if error.code != "MEDIA_NOT_FOUND":
                        raise
            if asset_id and self._auth_service.delete_media_asset(asset_id=asset_id):
                deleted_media_count += 1
                self._retention_store.remove(asset_id)

        return UserDeletionSummary(
            deleted_history_count=0,
            deleted_media_count=deleted_media_count,
            revoked_sessions_count=0,
            scrubbed_analysis_job_count=0,
        )

    def _scrub_user_analysis_jobs(self, *, user_id: str) -> int:
        scrub_jobs_for_user = getattr(self._analysis_job_store, "scrub_jobs_for_user", None)
        if not callable(scrub_jobs_for_user):
            raise AnalysisJobStoreError("analysis job store does not support user data scrubbing.")
        return int(scrub_jobs_for_user(user_id=user_id, scrubbed_at=datetime.now(timezone.utc)))

    def _resolve_asset_generation(self, *, asset: dict[str, object]) -> int:
        object_key = str(asset.get("object_key", "")).strip()
        object_prefix = str(getattr(self._media_storage, "object_prefix", "media"))
        if not _is_media_asset_object_key(
            object_key=object_key,
            object_prefix=object_prefix,
            user_id=str(asset.get("user_id", "")).strip(),
            scope=str(asset.get("scope", "")).strip(),
            asset_id=str(asset.get("asset_id", "")).strip(),
        ):
            raise MediaStorageError(
                code="MEDIA_OBJECT_KEY_MISMATCH",
                message="Media asset storage key does not match owner metadata.",
                status_code=409,
            )
        object_generation = _coerce_optional_int(asset.get("object_generation"))
        if object_generation is not None:
            return object_generation

        payload = self._media_storage.fetch_original(object_key=object_key)
        expected_size = int(asset.get("size_bytes") or -1)
        expected_sha256 = str(asset.get("sha256") or "").strip().lower()
        actual_sha256 = hashlib.sha256(payload.bytes_data).hexdigest()
        if expected_size != len(payload.bytes_data) or expected_sha256 != actual_sha256:
            raise MediaStorageError(
                code="MEDIA_GENERATION_BACKFILL_MISMATCH",
                message="Legacy media object content does not match stored metadata.",
                status_code=409,
            )
        generation = self._media_storage.get_original_generation(object_key=object_key)
        asset_id = str(asset.get("asset_id", "")).strip()
        if asset_id:
            self._auth_service.update_media_asset_generation(
                asset_id=asset_id,
                object_generation=generation,
            )
        return generation

    @staticmethod
    def _require_user_id(item: DeletionRequest) -> str:
        if item.user_id:
            return item.user_id
        raise ValueError("user_id is required for user deletion requests")


def _coerce_optional_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _deletion_error_message(error: Exception) -> str:
    if isinstance(error, MediaStorageError):
        return f"{error.code}: {error.message}"
    if isinstance(error, AnalysisJobStoreError):
        return str(error)
    if isinstance(error, AuthServiceError):
        return f"{error.code}: {error.message}"
    return str(error)


def _deletion_error_code(error: Exception) -> str:
    code = getattr(error, "code", None)
    if isinstance(code, str) and code.strip():
        return code.strip()
    return "DELETION_HANDLER_ERROR"


def _is_media_asset_object_key(
    *,
    object_key: str,
    object_prefix: str,
    user_id: str,
    scope: str,
    asset_id: str,
) -> bool:
    key_parts = [part for part in object_key.strip().strip("/").split("/") if part]
    prefix_parts = [part for part in object_prefix.strip().strip("/").split("/") if part] or ["media"]
    expected_parts = [*prefix_parts, user_id.strip(), scope.strip(), asset_id.strip()]
    if len(key_parts) != len(expected_parts) + 1:
        return False
    return key_parts[:-1] == expected_parts and key_parts[-1].startswith("original.")
