import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.modules.ops.deletion_queue import (
    DeletionQueueConsumer,
    DeletionQueueProducer,
    DeletionStatus,
    InMemoryDeletionQueueStorage,
    JsonFileDeletionQueueStorage,
    NoOpDeletionHandler,
)


class DeletionQueueTests(unittest.TestCase):
    def test_enqueue_dequeue_user_and_request_paths(self) -> None:
        storage = InMemoryDeletionQueueStorage()
        producer = DeletionQueueProducer(storage)

        user_item = producer.enqueue_user_deletion(user_id="user-123")
        request_item = producer.enqueue_request_deletion(request_id="req-456")

        self.assertEqual(storage.size(), 2)

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

        queued = producer.enqueue_request_deletion(request_id="req-cleanup")
        result = consumer.consume_once()

        self.assertIsNotNone(result)
        self.assertEqual(result.queue_id, queued.queue_id)
        self.assertEqual(result.status, DeletionStatus.DONE)
        self.assertEqual(handler.handled, [queued.queue_id])
        self.assertIsNone(consumer.consume_once())

    def test_json_file_queue_storage_persists_across_instances(self) -> None:
        with TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "queue.json")
            storage_a = JsonFileDeletionQueueStorage(path)
            producer = DeletionQueueProducer(storage_a)
            queued = producer.enqueue_user_deletion(user_id="user-persist")

            storage_b = JsonFileDeletionQueueStorage(path)
            self.assertEqual(storage_b.size(), 1)
            popped = storage_b.dequeue()
            self.assertIsNotNone(popped)
            self.assertEqual(popped.queue_id, queued.queue_id)
            self.assertEqual(storage_b.size(), 0)


if __name__ == "__main__":
    unittest.main()
