from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

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


class UserDeletionHandler:
    def __init__(
        self,
        *,
        auth_service: Any,
        media_storage: MediaStorage,
        retention_store: RetentionStore,
    ) -> None:
        self._auth_service = auth_service
        self._media_storage = media_storage
        self._retention_store = retention_store

    def handle(self, item: DeletionRequest) -> DeletionResult:
        try:
            if item.target == DeletionTarget.DATA:
                self._delete_user_media_assets(user_id=self._require_user_id(item))
                reset_summary = self._auth_service.reset_user_data(user_id=self._require_user_id(item))
                logger.info(
                    "[Deletion] completed",
                    extra={
                        "queue_id": item.queue_id,
                        "target": item.target.value,
                        "user_id": item.user_id,
                        "request_id": item.request_id,
                        "reason": item.reason,
                        "deleted_history_count": reset_summary.get("deleted_history_count", 0),
                        "deleted_media_count": reset_summary.get("deleted_media_count", 0),
                        "revoked_sessions_count": reset_summary.get("revoked_sessions_count", 0),
                    },
                )
                return DeletionResult(
                    queue_id=item.queue_id,
                    status=DeletionStatus.DONE,
                    target=item.target,
                )

            if item.target == DeletionTarget.ACCOUNT:
                user_id = self._require_user_id(item)
                summary = self._delete_user_media_assets(user_id=user_id)
                account_summary = self._auth_service.delete_user_account(user_id=user_id)
                logger.info(
                    "[Deletion] completed",
                    extra={
                        "queue_id": item.queue_id,
                        "target": item.target.value,
                        "user_id": item.user_id,
                        "request_id": item.request_id,
                        "reason": item.reason,
                        "deleted_history_count": account_summary.get("deleted_history_count", 0),
                        "deleted_media_count": summary.deleted_media_count,
                        "revoked_sessions_count": account_summary.get("revoked_sessions_count", 0),
                    },
                )
                return DeletionResult(
                    queue_id=item.queue_id,
                    status=DeletionStatus.DONE,
                    target=item.target,
                )

            raise ValueError(f"Unsupported deletion target: {item.target.value}")
        except Exception as error:
            logger.warning(
                "[Deletion] failed",
                extra={
                    "queue_id": item.queue_id,
                    "target": item.target.value,
                    "user_id": item.user_id,
                    "request_id": item.request_id,
                    "reason": item.reason,
                    "error": str(error),
                },
            )
            return DeletionResult(
                queue_id=item.queue_id,
                status=DeletionStatus.FAILED,
                target=item.target,
                error=str(error),
            )

    def _delete_user_media_assets(self, *, user_id: str) -> UserDeletionSummary:
        assets = self._auth_service.list_media_assets_for_user(user_id=user_id)
        deleted_media_count = 0
        for asset in assets:
            object_key = str(asset.get("object_key", "")).strip()
            asset_id = str(asset.get("asset_id", "")).strip()
            if object_key:
                try:
                    self._media_storage.delete_original(object_key=object_key)
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
        )

    @staticmethod
    def _require_user_id(item: DeletionRequest) -> str:
        if item.user_id:
            return item.user_id
        raise ValueError("user_id is required for user deletion requests")
