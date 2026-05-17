import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.modules.ops.deletion_queue import (
    DeletionQueueConsumer,
    DeletionQueueProducer,
    DeletionRetryPolicy,
    DeletionResult,
    DeletionStatusSnapshot,
    DeletionStatus,
    DeletionTarget,
    InMemoryDeletionQueueStorage,
    JsonFileDeletionQueueStorage,
    NoOpDeletionHandler,
    PostgresDeletionQueueStorage,
)


TEST_RETRY_POLICY = DeletionRetryPolicy(
    max_attempts=3,
    base_delay_seconds=1,
    max_delay_seconds=1,
)


class _FakePostgresCursor:
    def __init__(self) -> None:
        self.executed: list[str] = []
        self._row: tuple[int] | None = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def execute(self, query: str, params: tuple[object, ...] | None = None) -> None:
        self.executed.append(query)
        if "WITH stale AS" in query:
            self._row = (1,)

    def fetchone(self) -> tuple[int] | None:
        return self._row


class _FakePostgresConnection:
    def __init__(self, cursor: _FakePostgresCursor) -> None:
        self.cursor_instance = cursor

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def cursor(self) -> _FakePostgresCursor:
        return self.cursor_instance


class _FakePostgresConnect:
    def __init__(self) -> None:
        self.cursor = _FakePostgresCursor()

    def __call__(self, database_url: str, autocommit: bool = False) -> _FakePostgresConnection:
        return _FakePostgresConnection(self.cursor)


class _FailedDeletionHandler:
    def __init__(self) -> None:
        self.handled: list[str] = []

    def handle(self, item) -> DeletionResult:
        self.handled.append(item.queue_id)
        return DeletionResult(
            queue_id=item.queue_id,
            status=DeletionStatus.FAILED,
            target=item.target,
            error="deletion failed",
        )


class _FailOnceDeletionHandler:
    def __init__(self) -> None:
        self.handled: list[str] = []

    def handle(self, item) -> DeletionResult:
        self.handled.append(item.queue_id)
        if len(self.handled) == 1:
            return DeletionResult(
                queue_id=item.queue_id,
                status=DeletionStatus.FAILED,
                target=item.target,
                error="temporary deletion failure",
            )
        return DeletionResult(
            queue_id=item.queue_id,
            status=DeletionStatus.DONE,
            target=item.target,
        )


class _StatusCheckingDeletionHandler:
    def __init__(self, storage: InMemoryDeletionQueueStorage) -> None:
        self.storage = storage
        self.seen_statuses: list[DeletionStatus] = []

    def handle(self, item) -> DeletionResult:
        snapshot = self.storage.get_status(item.queue_id)
        if snapshot is not None:
            self.seen_statuses.append(snapshot.status)
        return DeletionResult(
            queue_id=item.queue_id,
            status=DeletionStatus.DONE,
            target=item.target,
        )


class DeletionQueueTests(unittest.TestCase):
    def test_enqueue_dequeue_user_and_request_paths(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)

        user_item = producer.enqueue_user_deletion(
            user_id="user-123",
            target=DeletionTarget.ACCOUNT,
            reason="user_requested",
        )
        request_item = producer.enqueue_request_deletion(
            request_id="req-456",
            reason="request_cleanup",
        )

        self.assertEqual(storage.size(), 2)
        self.assertEqual(storage.get_status(user_item.queue_id).status, DeletionStatus.PENDING)
        self.assertEqual(storage.get_status(user_item.queue_id).target, DeletionTarget.ACCOUNT)
        self.assertEqual(storage.get_status(request_item.queue_id).status, DeletionStatus.PENDING)
        self.assertEqual(storage.get_status(request_item.queue_id).target, DeletionTarget.REQUEST)

        first = storage.dequeue()
        second = storage.dequeue()

        self.assertIsNotNone(first)
        self.assertEqual(first.queue_id, user_item.queue_id)
        self.assertEqual(first.user_id, "user-123")
        self.assertIsNotNone(second)
        self.assertEqual(second.queue_id, request_item.queue_id)
        self.assertEqual(second.request_id, "req-456")
        self.assertEqual(storage.size(), 0)

    def test_consumer_processes_enqueued_item(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)
        handler = NoOpDeletionHandler()
        consumer = DeletionQueueConsumer(storage, handler, retry_policy=TEST_RETRY_POLICY)

        queued = producer.enqueue_user_deletion(
            user_id="user-cleanup",
            target=DeletionTarget.DATA,
            reason="user_requested",
        )
        result = consumer.consume_queue_id(queued.queue_id)

        self.assertIsNotNone(result)
        self.assertEqual(result.queue_id, queued.queue_id)
        self.assertEqual(result.status, DeletionStatus.DONE)
        self.assertEqual(result.target, DeletionTarget.DATA)
        self.assertEqual(handler.handled, [queued.queue_id])
        latest = storage.get_latest_status_for_user("user-cleanup")
        self.assertIsNotNone(latest)
        self.assertEqual(latest.queue_id, queued.queue_id)
        self.assertEqual(latest.status, DeletionStatus.DONE)
        self.assertIsNone(consumer.consume_once())

    def test_consumer_retries_transient_failure_then_marks_done(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)
        handler = _FailOnceDeletionHandler()
        consumer = DeletionQueueConsumer(storage, handler, retry_policy=TEST_RETRY_POLICY)

        queued = producer.enqueue_user_deletion(
            user_id="user-transient",
            target=DeletionTarget.ACCOUNT,
            reason="user_requested",
        )
        first_result = consumer.consume_once()

        self.assertIsNotNone(first_result)
        self.assertEqual(first_result.status, DeletionStatus.PENDING)
        first_status = storage.get_status(queued.queue_id)
        self.assertIsNotNone(first_status)
        self.assertEqual(first_status.status, DeletionStatus.PENDING)
        self.assertEqual(first_status.retry_count, 1)
        self.assertEqual(first_status.error, "temporary deletion failure")
        self.assertIsNotNone(first_status.next_attempt_at)
        self.assertEqual(storage.size(), 0)

        storage.save_status(
            DeletionStatusSnapshot(
                queue_id=queued.queue_id,
                created_at=queued.created_at,
                updated_at=datetime.now(timezone.utc),
                status=DeletionStatus.PENDING,
                target=queued.target,
                user_id=queued.user_id,
                request_id=queued.request_id,
                reason=queued.reason,
                error=first_status.error,
                retry_count=first_status.retry_count,
                next_attempt_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            )
        )
        self.assertEqual(storage.size(), 1)

        second_result = consumer.consume_once()

        self.assertIsNotNone(second_result)
        self.assertEqual(second_result.status, DeletionStatus.DONE)
        self.assertEqual(handler.handled, [queued.queue_id, queued.queue_id])
        final_status = storage.get_status(queued.queue_id)
        self.assertIsNotNone(final_status)
        self.assertEqual(final_status.status, DeletionStatus.DONE)
        self.assertEqual(final_status.retry_count, 1)
        self.assertIsNone(final_status.next_attempt_at)
        self.assertEqual(storage.size(), 0)

    def test_consumer_marks_failed_after_max_attempts(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)
        handler = _FailedDeletionHandler()
        consumer = DeletionQueueConsumer(
            storage,
            handler,
            retry_policy=DeletionRetryPolicy(
                max_attempts=2,
                base_delay_seconds=1,
                max_delay_seconds=1,
            ),
        )

        queued = producer.enqueue_user_deletion(
            user_id="user-failed",
            target=DeletionTarget.ACCOUNT,
            reason="user_requested",
        )
        first_result = consumer.consume_once()

        self.assertIsNotNone(first_result)
        self.assertEqual(first_result.status, DeletionStatus.PENDING)
        first_status = storage.get_status(queued.queue_id)
        self.assertIsNotNone(first_status)
        self.assertEqual(first_status.status, DeletionStatus.PENDING)
        self.assertEqual(first_status.retry_count, 1)
        storage.save_status(
            DeletionStatusSnapshot(
                queue_id=queued.queue_id,
                created_at=queued.created_at,
                updated_at=datetime.now(timezone.utc),
                status=DeletionStatus.PENDING,
                target=queued.target,
                user_id=queued.user_id,
                request_id=queued.request_id,
                reason=queued.reason,
                error=first_status.error,
                retry_count=first_status.retry_count,
                next_attempt_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            )
        )
        result = consumer.consume_once()

        self.assertIsNotNone(result)
        self.assertEqual(result.status, DeletionStatus.FAILED)
        self.assertEqual(handler.handled, [queued.queue_id, queued.queue_id])
        status = storage.get_status(queued.queue_id)
        self.assertIsNotNone(status)
        self.assertEqual(status.status, DeletionStatus.FAILED)
        self.assertEqual(status.error, "deletion failed")
        self.assertEqual(status.retry_count, 2)
        self.assertIsNone(status.next_attempt_at)
        self.assertEqual(storage.size(), 0)

    def test_consumer_status_is_in_progress_until_handler_completes(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)
        handler = _StatusCheckingDeletionHandler(storage)
        consumer = DeletionQueueConsumer(storage, handler, retry_policy=TEST_RETRY_POLICY)

        queued = producer.enqueue_user_deletion(
            user_id="user-status-order",
            target=DeletionTarget.DATA,
            reason="user_requested",
        )
        result = consumer.consume_queue_id(queued.queue_id)

        self.assertIsNotNone(result)
        self.assertEqual(result.status, DeletionStatus.DONE)
        self.assertEqual(handler.seen_statuses, [DeletionStatus.IN_PROGRESS])
        status = storage.get_status(queued.queue_id)
        self.assertIsNotNone(status)
        self.assertEqual(status.status, DeletionStatus.DONE)

    def test_json_file_queue_storage_persists_across_instances(self) -> None:
        with TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "queue.json")
            storage_a = JsonFileDeletionQueueStorage(path)
            producer = DeletionQueueProducer(storage_a)
            queued = producer.enqueue_user_deletion(
                user_id="user-persist",
                target=DeletionTarget.DATA,
                reason="user_requested",
            )

            storage_b = JsonFileDeletionQueueStorage(path)
            self.assertEqual(storage_b.size(), 1)
            pending = storage_b.get_status(queued.queue_id)
            self.assertIsNotNone(pending)
            self.assertEqual(pending.status, DeletionStatus.PENDING)

            consumer = DeletionQueueConsumer(
                storage_b,
                NoOpDeletionHandler(),
                retry_policy=TEST_RETRY_POLICY,
            )
            result = consumer.consume_queue_id(queued.queue_id)
            self.assertIsNotNone(result)
            self.assertEqual(result.status, DeletionStatus.DONE)

            storage_c = JsonFileDeletionQueueStorage(path)
            done = storage_c.get_status(queued.queue_id)
            self.assertIsNotNone(done)
            self.assertEqual(done.status, DeletionStatus.DONE)
            self.assertEqual(storage_b.size(), 0)

    def test_json_file_queue_requeues_stale_in_progress_after_restart(self) -> None:
        with TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "queue.json")
            storage_a = JsonFileDeletionQueueStorage(path)
            producer = DeletionQueueProducer(storage_a)
            queued = producer.enqueue_user_deletion(
                user_id="user-stale",
                target=DeletionTarget.DATA,
                reason="user_requested",
            )
            claimed = storage_a.dequeue()
            self.assertIsNotNone(claimed)
            storage_a.save_status(
                DeletionStatusSnapshot(
                    queue_id=queued.queue_id,
                    created_at=queued.created_at,
                    updated_at=datetime.now(timezone.utc) - timedelta(seconds=600),
                    status=DeletionStatus.IN_PROGRESS,
                    target=queued.target,
                    user_id=queued.user_id,
                    request_id=queued.request_id,
                    reason=queued.reason,
                )
            )

            storage_b = JsonFileDeletionQueueStorage(path)
            consumer = DeletionQueueConsumer(
                storage_b,
                NoOpDeletionHandler(),
                retry_policy=TEST_RETRY_POLICY,
            )

            self.assertEqual(consumer.requeue_stale(lease_seconds=300), 1)
            self.assertEqual(storage_b.size(), 1)
            status = storage_b.get_status(queued.queue_id)
            self.assertIsNotNone(status)
            self.assertEqual(status.status, DeletionStatus.PENDING)
            result = consumer.consume_queue_id(queued.queue_id)
            self.assertIsNotNone(result)
            self.assertEqual(result.status, DeletionStatus.DONE)

    def test_requeue_stale_ignores_fresh_in_progress_and_terminal_statuses(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)
        fresh = producer.enqueue_user_deletion(
            user_id="user-fresh",
            target=DeletionTarget.DATA,
            reason="user_requested",
        )
        done = producer.enqueue_user_deletion(
            user_id="user-done",
            target=DeletionTarget.DATA,
            reason="user_requested",
        )
        failed = producer.enqueue_user_deletion(
            user_id="user-failed-terminal",
            target=DeletionTarget.DATA,
            reason="user_requested",
        )
        storage.save_status(
            DeletionStatusSnapshot(
                queue_id=fresh.queue_id,
                created_at=fresh.created_at,
                updated_at=datetime.now(timezone.utc),
                status=DeletionStatus.IN_PROGRESS,
                target=fresh.target,
                user_id=fresh.user_id,
                request_id=fresh.request_id,
                reason=fresh.reason,
            )
        )
        storage.save_status(
            DeletionStatusSnapshot(
                queue_id=done.queue_id,
                created_at=done.created_at,
                updated_at=datetime.now(timezone.utc) - timedelta(seconds=600),
                status=DeletionStatus.DONE,
                target=done.target,
                user_id=done.user_id,
                request_id=done.request_id,
                reason=done.reason,
            )
        )
        storage.save_status(
            DeletionStatusSnapshot(
                queue_id=failed.queue_id,
                created_at=failed.created_at,
                updated_at=datetime.now(timezone.utc) - timedelta(seconds=600),
                status=DeletionStatus.FAILED,
                target=failed.target,
                user_id=failed.user_id,
                request_id=failed.request_id,
                reason=failed.reason,
            )
        )

        self.assertEqual(storage.requeue_stale(lease_seconds=300), 0)
        self.assertEqual(storage.size(), 0)

    def test_postgres_requeue_stale_resets_in_progress_status(self) -> None:
        fake_connect = _FakePostgresConnect()
        storage = PostgresDeletionQueueStorage(database_url="postgresql://unit-test")

        with patch("backend.modules.ops.deletion_queue._load_connect", return_value=fake_connect):
            self.assertEqual(storage.requeue_stale(lease_seconds=300), 1)

        query = "\n".join(fake_connect.cursor.executed)
        self.assertIn("SET status = 'pending'", query)
        self.assertIn("AND s.status = 'in_progress'", query)


if __name__ == "__main__":
    unittest.main()
