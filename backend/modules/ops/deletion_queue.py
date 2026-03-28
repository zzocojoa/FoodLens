from __future__ import annotations

import json
import re
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from pathlib import Path
from typing import Protocol
from uuid import uuid4


class DeletionQueueStoreError(Exception):
    pass


class DeletionTarget(StrEnum):
    ACCOUNT = "account"
    DATA = "data"
    REQUEST = "request"


class DeletionStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    FAILED = "failed"


@dataclass(frozen=True)
class DeletionRequest:
    queue_id: str
    created_at: datetime
    target: DeletionTarget
    user_id: str | None = None
    request_id: str | None = None
    reason: str = "user_requested"


@dataclass(frozen=True)
class DeletionStatusSnapshot:
    queue_id: str
    created_at: datetime
    updated_at: datetime
    status: DeletionStatus
    target: DeletionTarget
    user_id: str | None = None
    request_id: str | None = None
    reason: str = "user_requested"
    error: str | None = None


@dataclass(frozen=True)
class DeletionResult:
    queue_id: str
    status: DeletionStatus
    target: DeletionTarget
    error: str | None = None


class DeletionQueueStorage(Protocol):
    def enqueue(self, item: DeletionRequest) -> None:
        ...

    def dequeue(self) -> DeletionRequest | None:
        ...

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        ...

    def size(self) -> int:
        ...

    def save_status(self, snapshot: DeletionStatusSnapshot) -> None:
        ...

    def get_status(self, queue_id: str) -> DeletionStatusSnapshot | None:
        ...

    def get_latest_status_for_user(self, user_id: str) -> DeletionStatusSnapshot | None:
        ...


class InMemoryDeletionQueueStorage:
    def __init__(self) -> None:
        self._queue: deque[DeletionRequest] = deque()
        self._statuses: dict[str, DeletionStatusSnapshot] = {}

    def enqueue(self, item: DeletionRequest) -> None:
        self._queue.append(item)
        self.save_status(
            DeletionStatusSnapshot(
                queue_id=item.queue_id,
                created_at=item.created_at,
                updated_at=item.created_at,
                status=DeletionStatus.PENDING,
                target=item.target,
                user_id=item.user_id,
                request_id=item.request_id,
                reason=item.reason,
            )
        )

    def dequeue(self) -> DeletionRequest | None:
        if not self._queue:
            return None
        return self._queue.popleft()

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        items = list(self._queue)
        target_index = next((index for index, item in enumerate(items) if item.queue_id == queue_id), None)
        if target_index is None:
            return None
        target = items.pop(target_index)
        self._queue = deque(items)
        return target

    def size(self) -> int:
        return len(self._queue)

    def save_status(self, snapshot: DeletionStatusSnapshot) -> None:
        self._statuses[snapshot.queue_id] = snapshot

    def get_status(self, queue_id: str) -> DeletionStatusSnapshot | None:
        return self._statuses.get(queue_id)

    def get_latest_status_for_user(self, user_id: str) -> DeletionStatusSnapshot | None:
        candidates = [item for item in self._statuses.values() if item.user_id == user_id]
        if not candidates:
            return None
        candidates.sort(key=lambda item: item.created_at, reverse=True)
        return candidates[0]


class JsonFileDeletionQueueStorage:
    """
    Minimal persistent queue based on JSON array.
    """

    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text('{"queue":[],"statuses":[]}', encoding="utf-8")

    def _load(self) -> deque[DeletionRequest]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {"queue": [], "statuses": []}
        items: deque[DeletionRequest] = deque()
        queue_items = raw.get("queue") if isinstance(raw, dict) else []
        for item in queue_items if isinstance(queue_items, list) else []:
            try:
                items.append(
                    DeletionRequest(
                        queue_id=str(item["queue_id"]),
                        created_at=datetime.fromisoformat(str(item["created_at"])),
                        target=DeletionTarget(str(item.get("target", DeletionTarget.DATA.value))),
                        user_id=item.get("user_id"),
                        request_id=item.get("request_id"),
                        reason=str(item.get("reason", "user_requested")),
                    )
                )
            except Exception:
                continue
        return items

    def _load_statuses(self) -> dict[str, DeletionStatusSnapshot]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {"queue": [], "statuses": []}
        loaded: dict[str, DeletionStatusSnapshot] = {}
        raw_statuses = raw.get("statuses") if isinstance(raw, dict) else []
        for item in raw_statuses if isinstance(raw_statuses, list) else []:
            try:
                snapshot = DeletionStatusSnapshot(
                    queue_id=str(item["queue_id"]),
                    created_at=datetime.fromisoformat(str(item["created_at"])),
                    updated_at=datetime.fromisoformat(str(item["updated_at"])),
                    status=DeletionStatus(str(item["status"])),
                    target=DeletionTarget(str(item["target"])),
                    user_id=item.get("user_id"),
                    request_id=item.get("request_id"),
                    reason=str(item.get("reason", "user_requested")),
                    error=item.get("error"),
                )
                loaded[snapshot.queue_id] = snapshot
            except Exception:
                continue
        return loaded

    def _save(
        self,
        items: deque[DeletionRequest],
        statuses: dict[str, DeletionStatusSnapshot],
    ) -> None:
        payload = {
            "queue": [
                {
                    "queue_id": item.queue_id,
                    "created_at": item.created_at.isoformat(),
                    "target": item.target.value,
                    "user_id": item.user_id,
                    "request_id": item.request_id,
                    "reason": item.reason,
                }
                for item in items
            ],
            "statuses": [
                {
                    "queue_id": item.queue_id,
                    "created_at": item.created_at.isoformat(),
                    "updated_at": item.updated_at.isoformat(),
                    "status": item.status.value,
                    "target": item.target.value,
                    "user_id": item.user_id,
                    "request_id": item.request_id,
                    "reason": item.reason,
                    "error": item.error,
                }
                for item in sorted(statuses.values(), key=lambda value: value.created_at)
            ],
        }
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def enqueue(self, item: DeletionRequest) -> None:
        items = self._load()
        statuses = self._load_statuses()
        items.append(item)
        statuses[item.queue_id] = DeletionStatusSnapshot(
            queue_id=item.queue_id,
            created_at=item.created_at,
            updated_at=item.created_at,
            status=DeletionStatus.PENDING,
            target=item.target,
            user_id=item.user_id,
            request_id=item.request_id,
            reason=item.reason,
        )
        self._save(items, statuses)

    def dequeue(self) -> DeletionRequest | None:
        items = self._load()
        statuses = self._load_statuses()
        if not items:
            return None
        first = items.popleft()
        self._save(items, statuses)
        return first

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        items = self._load()
        statuses = self._load_statuses()
        target_index = next((index for index, item in enumerate(items) if item.queue_id == queue_id), None)
        if target_index is None:
            return None
        first = list(items)[target_index]
        items = deque([item for item in items if item.queue_id != queue_id])
        self._save(items, statuses)
        return first

    def size(self) -> int:
        return len(self._load())

    def save_status(self, snapshot: DeletionStatusSnapshot) -> None:
        items = self._load()
        statuses = self._load_statuses()
        statuses[snapshot.queue_id] = snapshot
        self._save(items, statuses)

    def get_status(self, queue_id: str) -> DeletionStatusSnapshot | None:
        return self._load_statuses().get(queue_id)

    def get_latest_status_for_user(self, user_id: str) -> DeletionStatusSnapshot | None:
        statuses = [item for item in self._load_statuses().values() if item.user_id == user_id]
        if not statuses:
            return None
        statuses.sort(key=lambda item: item.created_at, reverse=True)
        return statuses[0]


@dataclass(slots=True)
class PostgresDeletionQueueStorage:
    database_url: str
    queue_table_name: str = "deletion_queue"
    status_table_name: str = "deletion_statuses"

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise DeletionQueueStoreError("DATABASE_URL is required for postgres deletion queue backend.")
        self.queue_table_name = _sanitize_table_name(self.queue_table_name, fallback="deletion_queue")
        self.status_table_name = _sanitize_table_name(self.status_table_name, fallback="deletion_statuses")

    def enqueue(self, item: DeletionRequest) -> None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.queue_table_name} "
                            "(queue_id,created_at,target,user_id,request_id,reason,dequeued_at) "
                            "VALUES (%s,%s::timestamptz,%s,%s,%s,%s,NULL) "
                            "ON CONFLICT (queue_id) DO NOTHING"
                        ),
                        (
                            item.queue_id,
                            item.created_at.isoformat(),
                            item.target.value,
                            item.user_id,
                            item.request_id,
                            item.reason,
                        ),
                    )
                self.save_status(
                    DeletionStatusSnapshot(
                        queue_id=item.queue_id,
                        created_at=item.created_at,
                        updated_at=item.created_at,
                        status=DeletionStatus.PENDING,
                        target=item.target,
                        user_id=item.user_id,
                        request_id=item.request_id,
                        reason=item.reason,
                    )
                )
        except Exception as error:
            raise DeletionQueueStoreError(f"Failed to enqueue deletion item in postgres: {error}") from error

    def dequeue(self) -> DeletionRequest | None:
        connect = _load_connect()
        try:
            with connect(self.database_url) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"SELECT queue_id,created_at,target,user_id,request_id,reason "
                            f"FROM {self.queue_table_name} "
                            "WHERE dequeued_at IS NULL "
                            "ORDER BY created_at ASC "
                            "LIMIT 1 "
                            "FOR UPDATE SKIP LOCKED"
                        )
                    )
                    row = cursor.fetchone()
                    if row is None:
                        conn.commit()
                        return None
                    cursor.execute(
                        f"UPDATE {self.queue_table_name} SET dequeued_at = NOW() WHERE queue_id = %s",
                        (str(row[0]),),
                    )
                conn.commit()
            return _row_to_request(row)
        except Exception as error:
            raise DeletionQueueStoreError(f"Failed to dequeue deletion item from postgres: {error}") from error

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        connect = _load_connect()
        try:
            with connect(self.database_url) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"SELECT queue_id,created_at,target,user_id,request_id,reason "
                            f"FROM {self.queue_table_name} "
                            "WHERE queue_id = %s AND dequeued_at IS NULL "
                            "FOR UPDATE SKIP LOCKED"
                        ),
                        (queue_id,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        conn.commit()
                        return None
                    cursor.execute(
                        f"UPDATE {self.queue_table_name} SET dequeued_at = NOW() WHERE queue_id = %s",
                        (queue_id,),
                    )
                conn.commit()
            return _row_to_request(row)
        except Exception as error:
            raise DeletionQueueStoreError(
                f"Failed to dequeue deletion item by queue_id from postgres: {error}"
            ) from error

    def size(self) -> int:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"SELECT COUNT(*) FROM {self.queue_table_name} WHERE dequeued_at IS NULL"
                    )
                    row = cursor.fetchone()
            return int(row[0]) if row is not None else 0
        except Exception as error:
            raise DeletionQueueStoreError(f"Failed to count deletion queue rows in postgres: {error}") from error

    def save_status(self, snapshot: DeletionStatusSnapshot) -> None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.status_table_name} "
                            "(queue_id,created_at,updated_at,status,target,user_id,request_id,reason,error) "
                            "VALUES (%s,%s::timestamptz,%s::timestamptz,%s,%s,%s,%s,%s,%s) "
                            "ON CONFLICT (queue_id) DO UPDATE SET "
                            "updated_at=EXCLUDED.updated_at,"
                            "status=EXCLUDED.status,"
                            "target=EXCLUDED.target,"
                            "user_id=EXCLUDED.user_id,"
                            "request_id=EXCLUDED.request_id,"
                            "reason=EXCLUDED.reason,"
                            "error=EXCLUDED.error"
                        ),
                        (
                            snapshot.queue_id,
                            snapshot.created_at.isoformat(),
                            snapshot.updated_at.isoformat(),
                            snapshot.status.value,
                            snapshot.target.value,
                            snapshot.user_id,
                            snapshot.request_id,
                            snapshot.reason,
                            snapshot.error,
                        ),
                    )
        except Exception as error:
            raise DeletionQueueStoreError(f"Failed to save deletion status in postgres: {error}") from error

    def get_status(self, queue_id: str) -> DeletionStatusSnapshot | None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"SELECT queue_id,created_at,updated_at,status,target,user_id,request_id,reason,error "
                            f"FROM {self.status_table_name} "
                            "WHERE queue_id = %s"
                        ),
                        (queue_id,),
                    )
                    row = cursor.fetchone()
            if row is None:
                return None
            return _row_to_status(row)
        except Exception as error:
            raise DeletionQueueStoreError(f"Failed to load deletion status from postgres: {error}") from error

    def get_latest_status_for_user(self, user_id: str) -> DeletionStatusSnapshot | None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"SELECT queue_id,created_at,updated_at,status,target,user_id,request_id,reason,error "
                            f"FROM {self.status_table_name} "
                            "WHERE user_id = %s "
                            "ORDER BY created_at DESC "
                            "LIMIT 1"
                        ),
                        (user_id,),
                    )
                    row = cursor.fetchone()
            if row is None:
                return None
            return _row_to_status(row)
        except Exception as error:
            raise DeletionQueueStoreError(
                f"Failed to load latest deletion status from postgres: {error}"
            ) from error

    def _ensure_tables(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.queue_table_name} ("
                    "queue_id TEXT PRIMARY KEY,"
                    "created_at TIMESTAMPTZ NOT NULL,"
                    "target TEXT NOT NULL,"
                    "user_id TEXT NULL,"
                    "request_id TEXT NULL,"
                    "reason TEXT NOT NULL,"
                    "dequeued_at TIMESTAMPTZ NULL"
                    ")"
                )
            )
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.status_table_name} ("
                    "queue_id TEXT PRIMARY KEY,"
                    "created_at TIMESTAMPTZ NOT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL,"
                    "status TEXT NOT NULL,"
                    "target TEXT NOT NULL,"
                    "user_id TEXT NULL,"
                    "request_id TEXT NULL,"
                    "reason TEXT NOT NULL,"
                    "error TEXT NULL"
                    ")"
                )
            )
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {self.queue_table_name}_created_idx "
                f"ON {self.queue_table_name} (created_at)"
            )
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {self.status_table_name}_user_created_idx "
                f"ON {self.status_table_name} (user_id, created_at)"
            )


class NoOpDeletionQueueStorage:
    def enqueue(self, item: DeletionRequest) -> None:
        _ = item

    def dequeue(self) -> DeletionRequest | None:
        return None

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        _ = queue_id
        return None

    def size(self) -> int:
        return 0

    def save_status(self, snapshot: DeletionStatusSnapshot) -> None:
        _ = snapshot

    def get_status(self, queue_id: str) -> DeletionStatusSnapshot | None:
        _ = queue_id
        return None

    def get_latest_status_for_user(self, user_id: str) -> DeletionStatusSnapshot | None:
        _ = user_id
        return None


class DeletionQueueProducer:
    def __init__(self, storage: DeletionQueueStorage) -> None:
        self.storage = storage

    def enqueue_user_deletion(
        self,
        *,
        user_id: str,
        target: DeletionTarget,
        reason: str,
        request_id: str | None = None,
    ) -> DeletionRequest:
        request = DeletionRequest(
            queue_id=uuid4().hex,
            created_at=datetime.now(timezone.utc),
            target=target,
            user_id=user_id,
            request_id=request_id,
            reason=reason,
        )
        self.storage.enqueue(request)
        return request

    def enqueue_request_deletion(self, *, request_id: str, reason: str) -> DeletionRequest:
        request = DeletionRequest(
            queue_id=uuid4().hex,
            created_at=datetime.now(timezone.utc),
            target=DeletionTarget.REQUEST,
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
        return DeletionResult(queue_id=item.queue_id, status=DeletionStatus.DONE, target=item.target)


class DeletionQueueConsumer:
    def __init__(self, storage: DeletionQueueStorage, handler: DeletionHandler) -> None:
        self.storage = storage
        self.handler = handler

    def consume_once(self) -> DeletionResult | None:
        item = self.storage.dequeue()
        if item is None:
            return None
        return self._process_item(item)

    def consume_queue_id(self, queue_id: str) -> DeletionResult | None:
        item = self.storage.dequeue_by_queue_id(queue_id)
        if item is None:
            return None
        return self._process_item(item)

    def _process_item(self, item: DeletionRequest) -> DeletionResult:
        self.storage.save_status(
            DeletionStatusSnapshot(
                queue_id=item.queue_id,
                created_at=item.created_at,
                updated_at=datetime.now(timezone.utc),
                status=DeletionStatus.IN_PROGRESS,
                target=item.target,
                user_id=item.user_id,
                request_id=item.request_id,
                reason=item.reason,
            )
        )
        result = self.handler.handle(item)
        self.storage.save_status(
            DeletionStatusSnapshot(
                queue_id=item.queue_id,
                created_at=item.created_at,
                updated_at=datetime.now(timezone.utc),
                status=result.status,
                target=item.target,
                user_id=item.user_id,
                request_id=item.request_id,
                reason=item.reason,
                error=result.error,
            )
        )
        return result


def _row_to_request(row: tuple[object, ...]) -> DeletionRequest:
    return DeletionRequest(
        queue_id=str(row[0]),
        created_at=_coerce_datetime(row[1]),
        target=DeletionTarget(str(row[2])),
        user_id=str(row[3]) if row[3] is not None else None,
        request_id=str(row[4]) if row[4] is not None else None,
        reason=str(row[5]),
    )


def _row_to_status(row: tuple[object, ...]) -> DeletionStatusSnapshot:
    return DeletionStatusSnapshot(
        queue_id=str(row[0]),
        created_at=_coerce_datetime(row[1]),
        updated_at=_coerce_datetime(row[2]),
        status=DeletionStatus(str(row[3])),
        target=DeletionTarget(str(row[4])),
        user_id=str(row[5]) if row[5] is not None else None,
        request_id=str(row[6]) if row[6] is not None else None,
        reason=str(row[7]),
        error=str(row[8]) if row[8] is not None else None,
    )


def _coerce_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value))


def _load_connect():
    try:
        from psycopg import connect  # type: ignore
    except Exception as error:
        raise DeletionQueueStoreError(
            "psycopg is required for postgres deletion queue backend. Install backend/requirements.txt."
        ) from error
    return connect


def _sanitize_table_name(raw: str, *, fallback: str) -> str:
    candidate = (raw or "").strip() or fallback
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
        raise DeletionQueueStoreError("Deletion queue table name has invalid format.")
    return candidate
