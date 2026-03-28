import logging
import unittest
from datetime import datetime, timezone

from backend.modules.auth.email_sender import LoggingEmailVerificationSender
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


class _FakeMediaStorage:
    def delete_original(self, *, object_key: str) -> None:
        return None


class _FakeRetentionStore:
    def remove(self, asset_id: str) -> None:
        return None


class Phase5LoggingHygieneTests(unittest.TestCase):
    def test_deletion_success_log_includes_request_id(self) -> None:
        logger = logging.getLogger("foodlens.deletion")
        handler = _RecordHandler()
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        try:
            deletion_handler = UserDeletionHandler(
                auth_service=_FakeAuthService(),
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
        finally:
            logger.removeHandler(handler)

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
