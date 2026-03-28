import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.modules.ops.deletion_queue import (
    DeletionQueueConsumer,
    DeletionQueueProducer,
    DeletionResult,
    DeletionStatus,
    DeletionTarget,
    InMemoryDeletionQueueStorage,
    JsonFileDeletionQueueStorage,
    NoOpDeletionHandler,
)


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
        consumer = DeletionQueueConsumer(storage, handler)

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

    def test_consumer_persists_failed_status(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)
        handler = _FailedDeletionHandler()
        consumer = DeletionQueueConsumer(storage, handler)

        queued = producer.enqueue_user_deletion(
            user_id="user-failed",
            target=DeletionTarget.ACCOUNT,
            reason="user_requested",
        )
        result = consumer.consume_once()

        self.assertIsNotNone(result)
        self.assertEqual(result.status, DeletionStatus.FAILED)
        self.assertEqual(handler.handled, [queued.queue_id])
        status = storage.get_status(queued.queue_id)
        self.assertIsNotNone(status)
        self.assertEqual(status.status, DeletionStatus.FAILED)
        self.assertEqual(status.error, "deletion failed")

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

            consumer = DeletionQueueConsumer(storage_b, NoOpDeletionHandler())
            result = consumer.consume_queue_id(queued.queue_id)
            self.assertIsNotNone(result)
            self.assertEqual(result.status, DeletionStatus.DONE)

            storage_c = JsonFileDeletionQueueStorage(path)
            done = storage_c.get_status(queued.queue_id)
            self.assertIsNotNone(done)
            self.assertEqual(done.status, DeletionStatus.DONE)
            self.assertEqual(storage_b.size(), 0)


if __name__ == "__main__":
    unittest.main()
