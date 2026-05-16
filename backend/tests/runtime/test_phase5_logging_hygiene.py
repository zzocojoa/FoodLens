import logging
import unittest
from datetime import datetime, timezone

from backend.modules.auth.email_sender import LoggingEmailVerificationSender
from backend.modules.auth.service import AuthServiceError
from backend.modules.ops.deletion_queue import DeletionRequest, DeletionTarget
from backend.modules.ops.privacy_deletion import UserDeletionHandler
from backend.server import _log_email_verification_event


class _RecordHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


class _FakeAuthService:
    def reset_user_data(self, *, user_id: str) -> dict[str, int]:
        return {
            "deleted_history_count": 3,
            "deleted_media_count": 2,
            "revoked_sessions_count": 1,
        }

    def delete_user_account(self, *, user_id: str) -> dict[str, int]:
        return {
            "deleted_history_count": 3,
            "revoked_sessions_count": 1,
        }

    def list_media_assets_for_user(self, *, user_id: str) -> list[dict[str, str]]:
        return []

    def delete_media_asset(self, asset_id: str) -> bool:
        return True


class _MissingAccountAuthService(_FakeAuthService):
    def list_media_assets_for_user(self, *, user_id: str) -> list[dict[str, str]]:
        raise AuthServiceError(
            code="AUTH_USER_NOT_FOUND",
            message="User not found.",
            status_code=404,
            user_id=user_id,
        )


class _FakeMediaStorage:
    object_prefix: str = "media"

    def __init__(self) -> None:
        self.deleted: list[tuple[str, int | None]] = []

    def delete_original(self, *, object_key: str, generation: int | None = None) -> None:
        self.deleted.append((object_key, generation))
        return None


class _FakeRetentionStore:
    def remove(self, asset_id: str) -> None:
        return None


class _FakeAnalysisJobStore:
    def __init__(self) -> None:
        self.scrubbed_user_ids: list[str] = []
        self.scrubbed_count = 4
        self.scrubbed_at: datetime | None = None

    def scrub_jobs_for_user(self, *, user_id: str, scrubbed_at: datetime) -> int:
        self.scrubbed_user_ids.append(user_id)
        self.scrubbed_at = scrubbed_at
        return self.scrubbed_count


class _MismatchedMediaAuthService(_FakeAuthService):
    def list_media_assets_for_user(self, *, user_id: str) -> list[dict[str, object]]:
        return [
            {
                "asset_id": "asset_123",
                "user_id": user_id,
                "scope": "history",
                "object_key": "media/other-user/history/asset_123/original.png",
                "object_generation": 10,
                "size_bytes": 3,
                "sha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            }
        ]


class Phase5LoggingHygieneTests(unittest.TestCase):
    def test_httpx_info_logs_are_suppressed(self) -> None:
        self.assertGreaterEqual(logging.getLogger("httpx").level, logging.WARNING)

    def test_deletion_success_log_includes_request_id(self) -> None:
        logger = logging.getLogger("foodlens.deletion")
        handler = _RecordHandler()
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        try:
            deletion_handler = UserDeletionHandler(
                auth_service=_FakeAuthService(),
                analysis_job_store=_FakeAnalysisJobStore(),
                media_storage=_FakeMediaStorage(),
                retention_store=_FakeRetentionStore(),
            )

            result = deletion_handler.handle(
                DeletionRequest(
                    queue_id="del-123",
                    created_at=datetime.now(timezone.utc),
                    target=DeletionTarget.DATA,
                    user_id="usr_123",
                    request_id="req_123",
                    reason="user_requested",
                )
            )

            self.assertEqual(result.status.value, "done")
            self.assertEqual(len(handler.records), 1)
            self.assertEqual(getattr(handler.records[0], "request_id", None), "req_123")
            self.assertEqual(getattr(handler.records[0], "scrubbed_analysis_job_count", None), 4)
        finally:
            logger.removeHandler(handler)

    def test_account_deletion_retry_treats_missing_user_as_done(self) -> None:
        analysis_job_store = _FakeAnalysisJobStore()
        deletion_handler = UserDeletionHandler(
            auth_service=_MissingAccountAuthService(),
            analysis_job_store=analysis_job_store,
            media_storage=_FakeMediaStorage(),
            retention_store=_FakeRetentionStore(),
        )

        result = deletion_handler.handle(
            DeletionRequest(
                queue_id="del-retry",
                created_at=datetime.now(timezone.utc),
                target=DeletionTarget.ACCOUNT,
                user_id="usr_deleted",
                request_id="req_retry",
                reason="user_requested",
            )
        )

        self.assertEqual(result.status.value, "done")
        self.assertEqual(analysis_job_store.scrubbed_user_ids, ["usr_deleted"])

    def test_user_deletion_rejects_generated_asset_with_object_key_mismatch(self) -> None:
        media_storage = _FakeMediaStorage()
        analysis_job_store = _FakeAnalysisJobStore()
        deletion_handler = UserDeletionHandler(
            auth_service=_MismatchedMediaAuthService(),
            analysis_job_store=analysis_job_store,
            media_storage=media_storage,
            retention_store=_FakeRetentionStore(),
        )

        result = deletion_handler.handle(
            DeletionRequest(
                queue_id="del-key-mismatch",
                created_at=datetime.now(timezone.utc),
                target=DeletionTarget.DATA,
                user_id="usr_owner",
                request_id="req_key_mismatch",
                reason="user_requested",
            )
        )

        self.assertEqual(result.status.value, "failed")
        self.assertIn("MEDIA_OBJECT_KEY_MISMATCH", str(result.error))
        self.assertEqual(analysis_job_store.scrubbed_user_ids, ["usr_owner"])
        self.assertEqual(media_storage.deleted, [])

    def test_logging_sender_masks_email_and_never_logs_code(self) -> None:
        logger = logging.getLogger("foodlens.auth.email")
        handler = _RecordHandler()
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        try:
            sender = LoggingEmailVerificationSender(include_code_in_logs=True)

            sender.send_verification_code(
                email="owner@example.com",
                code="123456",
                expires_in_seconds=300,
                user_id="usr_123",
            )
            sender.send_password_reset_code(
                email="owner@example.com",
                code="654321",
                expires_in_seconds=300,
                user_id="usr_123",
            )

            messages = [record.getMessage() for record in handler.records]
            self.assertEqual(len(messages), 2)
            self.assertTrue(all("ow***@example.com" in message for message in messages))
            self.assertTrue(all("123456" not in message for message in messages))
            self.assertTrue(all("654321" not in message for message in messages))
        finally:
            logger.removeHandler(handler)

    def test_email_verification_event_masks_email(self) -> None:
        logger = logging.getLogger("foodlens.api")
        handler = _RecordHandler()
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        try:
            _log_email_verification_event(
                result={
                    "verification_required": True,
                    "user": {
                        "id": "usr_123",
                        "email": "owner@example.com",
                    },
                    "verification_id": "ver_123",
                },
                request_id="req_456",
                event="signup",
            )

            self.assertEqual(len(handler.records), 1)
            message = handler.records[0].getMessage()
            self.assertIn("ow***@example.com", message)
            self.assertNotIn("owner@example.com", message)
        finally:
            logger.removeHandler(handler)


if __name__ == "__main__":
    unittest.main()
