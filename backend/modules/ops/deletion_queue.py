from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from typing import Protocol
from uuid import uuid4


class DeletionStatus(StrEnum):
    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"


@dataclass(frozen=True)
class DeletionRequest:
    queue_id: str
    created_at: datetime
    user_id: str | None = None
    request_id: str | None = None
    reason: str = "user_requested"


@dataclass(frozen=True)
class DeletionResult:
    queue_id: str
    status: DeletionStatus
    error: str | None = None


class DeletionQueueStorage(Protocol):
    def enqueue(self, item: DeletionRequest) -> None:
        ...

    def dequeue(self) -> DeletionRequest | None:
        ...

    def size(self) -> int:
        ...


class InMemoryDeletionQueueStorage:
    def __init__(self) -> None:
        self._queue: deque[DeletionRequest] = deque()

    def enqueue(self, item: DeletionRequest) -> None:
        self._queue.append(item)

    def dequeue(self) -> DeletionRequest | None:
        if not self._queue:
            return None
        return self._queue.popleft()

    def size(self) -> int:
        return len(self._queue)


class JsonFileDeletionQueueStorage:
    """
    Minimal persistent queue based on JSON array.
    """

    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("[]", encoding="utf-8")

    def _load(self) -> deque[DeletionRequest]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = []
        items: deque[DeletionRequest] = deque()
        for item in raw if isinstance(raw, list) else []:
            try:
                items.append(
                    DeletionRequest(
                        queue_id=str(item["queue_id"]),
                        created_at=datetime.fromisoformat(str(item["created_at"])),
                        user_id=item.get("user_id"),
                        request_id=item.get("request_id"),
                        reason=str(item.get("reason", "user_requested")),
                    )
                )
            except Exception:
                continue
        return items

    def _save(self, items: deque[DeletionRequest]) -> None:
        payload = [
            {
                "queue_id": item.queue_id,
                "created_at": item.created_at.isoformat(),
                "user_id": item.user_id,
                "request_id": item.request_id,
                "reason": item.reason,
            }
            for item in items
        ]
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def enqueue(self, item: DeletionRequest) -> None:
        items = self._load()
        items.append(item)
        self._save(items)

    def dequeue(self) -> DeletionRequest | None:
        items = self._load()
        if not items:
            return None
        first = items.popleft()
        self._save(items)
        return first

    def size(self) -> int:
        return len(self._load())


class NoOpDeletionQueueStorage:
    def enqueue(self, item: DeletionRequest) -> None:
        _ = item

    def dequeue(self) -> DeletionRequest | None:
        return None

    def size(self) -> int:
        return 0


class DeletionQueueProducer:
    def __init__(self, storage: DeletionQueueStorage) -> None:
        self.storage = storage

    def enqueue_user_deletion(self, *, user_id: str, reason: str = "user_requested") -> DeletionRequest:
        request = DeletionRequest(
            queue_id=uuid4().hex,
            created_at=datetime.now(timezone.utc),
            user_id=user_id,
            reason=reason,
        )
        self.storage.enqueue(request)
        return request

    def enqueue_request_deletion(self, *, request_id: str, reason: str = "request_cleanup") -> DeletionRequest:
        request = DeletionRequest(
            queue_id=uuid4().hex,
            created_at=datetime.now(timezone.utc),
            request_id=request_id,
            reason=reason,
        )
        self.storage.enqueue(request)
        return request


class DeletionHandler(Protocol):
    def handle(self, item: DeletionRequest) -> DeletionResult:
        ...


class NoOpDeletionHandler:
    def __init__(self) -> None:
        self.handled: list[str] = []

    def handle(self, item: DeletionRequest) -> DeletionResult:
        self.handled.append(item.queue_id)
        return DeletionResult(queue_id=item.queue_id, status=DeletionStatus.DONE)


class DeletionQueueConsumer:
    def __init__(self, storage: DeletionQueueStorage, handler: DeletionHandler) -> None:
        self.storage = storage
        self.handler = handler

    def consume_once(self) -> DeletionResult | None:
        item = self.storage.dequeue()
        if item is None:
            return None
        return self.handler.handle(item)
