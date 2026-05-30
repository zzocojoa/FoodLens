from __future__ import annotations

import json
import re
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
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
    retry_count: int = 0
    next_attempt_at: datetime | None = None


@dataclass(frozen=True)
class DeletionResult:
    queue_id: str
    status: DeletionStatus
    target: DeletionTarget
    error: str | None = None
    request_id: str | None = None


@dataclass(frozen=True)
class DeletionRetryPolicy:
    max_attempts: int
    base_delay_seconds: int
    max_delay_seconds: int


DEFAULT_DELETION_RETRY_POLICY = DeletionRetryPolicy(
    max_attempts=5,
    base_delay_seconds=60,
    max_delay_seconds=3600,
)


class DeletionQueueStorage(Protocol):
    def enqueue(self, item: DeletionRequest) -> None:
        ...

    def dequeue(self) -> DeletionRequest | None:
        ...

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        ...

    def complete(self, queue_id: str) -> None:
        ...

    def requeue_stale(self, *, lease_seconds: int) -> int:
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
        for item in self._queue:
            if self._is_claimable(item.queue_id):
                self._claim(item)
                return item
        return None

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        for item in self._queue:
            if item.queue_id == queue_id and self._is_claimable(item.queue_id):
                self._claim(item)
                return item
        return None

    def complete(self, queue_id: str) -> None:
        self._queue = deque(item for item in self._queue if item.queue_id != queue_id)

    def requeue_stale(self, *, lease_seconds: int) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(1, lease_seconds))
        recovered = 0
        for item in list(self._queue):
            snapshot = self._statuses.get(item.queue_id)
            if snapshot is None or snapshot.status != DeletionStatus.IN_PROGRESS or snapshot.updated_at > cutoff:
                continue
            self._statuses[item.queue_id] = DeletionStatusSnapshot(
                queue_id=snapshot.queue_id,
                created_at=snapshot.created_at,
                updated_at=datetime.now(timezone.utc),
                status=DeletionStatus.PENDING,
                target=snapshot.target,
                user_id=snapshot.user_id,
                request_id=snapshot.request_id,
                reason=snapshot.reason,
                error="stale lease requeued",
            )
            recovered += 1
        return recovered

    def size(self) -> int:
        return len([item for item in self._queue if self._is_claimable(item.queue_id)])

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

    def _is_claimable(self, queue_id: str) -> bool:
        snapshot = self._statuses.get(queue_id)
        return _snapshot_is_claimable(snapshot=snapshot, now=datetime.now(timezone.utc))

    def _claim(self, item: DeletionRequest) -> None:
        self.save_status(_in_progress_snapshot(item, self._statuses.get(item.queue_id)))


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
                    retry_count=_coerce_non_negative_int(item.get("retry_count")),
                    next_attempt_at=_coerce_optional_datetime(item.get("next_attempt_at")),
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
                    "retry_count": item.retry_count,
                    "next_attempt_at": item.next_attempt_at.isoformat() if item.next_attempt_at is not None else None,
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
        first = next((item for item in items if self._is_claimable(item=item, statuses=statuses)), None)
        if first is None:
            return None
        statuses[first.queue_id] = _in_progress_snapshot(first, statuses.get(first.queue_id))
        self._save(items, statuses)
        return first

    def dequeue_by_queue_id(self, queue_id: str) -> DeletionRequest | None:
        items = self._load()
        statuses = self._load_statuses()
        first = next(
            (item for item in items if item.queue_id == queue_id and self._is_claimable(item=item, statuses=statuses)),
            None,
        )
        if first is None:
            return None
        statuses[first.queue_id] = _in_progress_snapshot(first, statuses.get(first.queue_id))
        self._save(items, statuses)
        return first

    def complete(self, queue_id: str) -> None:
        items = deque(item for item in self._load() if item.queue_id != queue_id)
        self._save(items, self._load_statuses())

    def requeue_stale(self, *, lease_seconds: int) -> int:
        items = self._load()
        statuses = self._load_statuses()
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(1, lease_seconds))
        recovered = 0
        for item in items:
            snapshot = statuses.get(item.queue_id)
            if snapshot is None or snapshot.status != DeletionStatus.IN_PROGRESS or snapshot.updated_at > cutoff:
                continue
            statuses[item.queue_id] = DeletionStatusSnapshot(
                queue_id=snapshot.queue_id,
                created_at=snapshot.created_at,
                updated_at=datetime.now(timezone.utc),
                status=DeletionStatus.PENDING,
                target=snapshot.target,
                user_id=snapshot.user_id,
                request_id=snapshot.request_id,
                reason=snapshot.reason,
                error="stale lease requeued",
                retry_count=snapshot.retry_count,
                next_attempt_at=None,
            )
            recovered += 1
        if recovered > 0:
            self._save(items, statuses)
        return recovered

    def size(self) -> int:
        statuses = self._load_statuses()
        return len([item for item in self._load() if self._is_claimable(item=item, statuses=statuses)])

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

    @staticmethod
    def _is_claimable(
        *,
        item: DeletionRequest,
        statuses: dict[str, DeletionStatusSnapshot],
    ) -> bool:
        snapshot = statuses.get(item.queue_id)
        return _snapshot_is_claimable(snapshot=snapshot, now=datetime.now(timezone.utc))


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
                            "SELECT q.queue_id,q.created_at,q.target,q.user_id,q.request_id,q.reason "
                            f"FROM {self.queue_table_name} q "
                            f"LEFT JOIN {self.status_table_name} s ON s.queue_id = q.queue_id "
                            "WHERE q.dequeued_at IS NULL "
                            "AND COALESCE(s.status, 'pending') = 'pending' "
                            "AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= NOW()) "
                            "ORDER BY q.created_at ASC "
                            "LIMIT 1 "
                            "FOR UPDATE OF q SKIP LOCKED"
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
                            "SELECT q.queue_id,q.created_at,q.target,q.user_id,q.request_id,q.reason "
                            f"FROM {self.queue_table_name} q "
                            f"LEFT JOIN {self.status_table_name} s ON s.queue_id = q.queue_id "
                            "WHERE q.queue_id = %s AND q.dequeued_at IS NULL "
                            "AND COALESCE(s.status, 'pending') = 'pending' "
                            "AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= NOW()) "
                            "FOR UPDATE OF q SKIP LOCKED"
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

    def complete(self, queue_id: str) -> None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"DELETE FROM {self.queue_table_name} WHERE queue_id = %s",
                        (queue_id,),
                    )
        except Exception as error:
            raise DeletionQueueStoreError(f"Failed to complete deletion queue row in postgres: {error}") from error

    def requeue_stale(self, *, lease_seconds: int) -> int:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            "WITH stale AS ("
                            f"UPDATE {self.queue_table_name} q "
                            "SET dequeued_at = NULL "
                            "WHERE q.dequeued_at IS NOT NULL "
                            "AND q.dequeued_at <= NOW() - (%s || ' seconds')::interval "
                            f"AND NOT EXISTS ("
                            f"SELECT 1 FROM {self.status_table_name} terminal "
                            "WHERE terminal.queue_id = q.queue_id "
                            "AND terminal.status IN ('done','failed')"
                            ") "
                            "RETURNING q.queue_id"
                            "), status_updates AS ("
                            f"UPDATE {self.status_table_name} s "
                            "SET status = 'pending', updated_at = NOW(), error = 'stale lease requeued', "
                            "next_attempt_at = NULL "
                            "FROM stale "
                            "WHERE s.queue_id = stale.queue_id "
                            "AND s.status = 'in_progress' "
                            "RETURNING s.queue_id"
                            ") "
                            "SELECT COUNT(*) FROM stale"
                        ),
                        (str(max(1, lease_seconds)),),
                    )
                    row = cursor.fetchone()
                    recovered = int(row[0]) if row is not None else 0
            return recovered
        except Exception as error:
            raise DeletionQueueStoreError(f"Failed to requeue stale deletion rows in postgres: {error}") from error

    def size(self) -> int:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"SELECT COUNT(*) FROM {self.queue_table_name} q "
                            f"LEFT JOIN {self.status_table_name} s ON s.queue_id = q.queue_id "
                            "WHERE q.dequeued_at IS NULL "
                            "AND COALESCE(s.status, 'pending') = 'pending' "
                            "AND (s.next_attempt_at IS NULL OR s.next_attempt_at <= NOW())"
                        )
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
                            "(queue_id,created_at,updated_at,status,target,user_id,request_id,reason,error,"
                            "retry_count,next_attempt_at) "
                            "VALUES (%s,%s::timestamptz,%s::timestamptz,%s,%s,%s,%s,%s,%s,%s,%s::timestamptz) "
                            "ON CONFLICT (queue_id) DO UPDATE SET "
                            "updated_at=EXCLUDED.updated_at,"
                            "status=EXCLUDED.status,"
                            "target=EXCLUDED.target,"
                            "user_id=EXCLUDED.user_id,"
                            "request_id=EXCLUDED.request_id,"
                            "reason=EXCLUDED.reason,"
                            "error=EXCLUDED.error,"
                            "retry_count=EXCLUDED.retry_count,"
                            "next_attempt_at=EXCLUDED.next_attempt_at"
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
                            snapshot.retry_count,
                            snapshot.next_attempt_at.isoformat() if snapshot.next_attempt_at is not None else None,
                        ),
                    )
                    if snapshot.status == DeletionStatus.PENDING:
                        cursor.execute(
                            f"UPDATE {self.queue_table_name} SET dequeued_at = NULL WHERE queue_id = %s",
                            (snapshot.queue_id,),
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
                            f"SELECT queue_id,created_at,updated_at,status,target,user_id,request_id,reason,error,"
                            "retry_count,next_attempt_at "
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
                            f"SELECT queue_id,created_at,updated_at,status,target,user_id,request_id,reason,error,"
                            "retry_count,next_attempt_at "
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
                    "error TEXT NULL,"
                    "retry_count INTEGER NOT NULL DEFAULT 0,"
                    "next_attempt_at TIMESTAMPTZ NULL"
                    ")"
                )
            )
            cursor.execute(
                f"ALTER TABLE {self.status_table_name} "
                "ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0"
            )
            cursor.execute(
                f"ALTER TABLE {self.status_table_name} "
                "ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL"
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

    def complete(self, queue_id: str) -> None:
        _ = queue_id

    def requeue_stale(self, *, lease_seconds: int) -> int:
        _ = lease_seconds
        return 0

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
    def __init__(
        self,
        storage: DeletionQueueStorage,
        handler: DeletionHandler,
        retry_policy: DeletionRetryPolicy,
    ) -> None:
        if retry_policy.max_attempts < 1:
            raise ValueError("Deletion retry max_attempts must be at least 1.")
        if retry_policy.base_delay_seconds < 1:
            raise ValueError("Deletion retry base_delay_seconds must be at least 1.")
        if retry_policy.max_delay_seconds < retry_policy.base_delay_seconds:
            raise ValueError("Deletion retry max_delay_seconds must be greater than or equal to base_delay_seconds.")
        self.storage = storage
        self.handler = handler
        self.retry_policy = retry_policy

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
        previous_snapshot = self.storage.get_status(item.queue_id)
        in_progress_snapshot = _in_progress_snapshot(item, previous_snapshot)
        self.storage.save_status(in_progress_snapshot)
        result = self.handler.handle(item)
        if result.status == DeletionStatus.DONE:
            self.storage.save_status(
                DeletionStatusSnapshot(
                    queue_id=item.queue_id,
                    created_at=item.created_at,
                    updated_at=datetime.now(timezone.utc),
                    status=DeletionStatus.DONE,
                    target=item.target,
                    user_id=item.user_id,
                    request_id=item.request_id,
                    reason=item.reason,
                    error=result.error,
                    retry_count=in_progress_snapshot.retry_count,
                    next_attempt_at=None,
                )
            )
            self.storage.complete(item.queue_id)
            return _deletion_result_with_request_id(result=result, request_id=item.request_id)
        if result.status == DeletionStatus.FAILED:
            retry_count = in_progress_snapshot.retry_count + 1
            now = datetime.now(timezone.utc)
            if retry_count >= self.retry_policy.max_attempts:
                self.storage.save_status(
                    DeletionStatusSnapshot(
                        queue_id=item.queue_id,
                        created_at=item.created_at,
                        updated_at=now,
                        status=DeletionStatus.FAILED,
                        target=item.target,
                        user_id=item.user_id,
                        request_id=item.request_id,
                        reason=item.reason,
                        error=result.error,
                        retry_count=retry_count,
                        next_attempt_at=None,
                    )
                )
                self.storage.complete(item.queue_id)
                return _deletion_result_with_request_id(result=result, request_id=item.request_id)
            self.storage.save_status(
                DeletionStatusSnapshot(
                    queue_id=item.queue_id,
                    created_at=item.created_at,
                    updated_at=now,
                    status=DeletionStatus.PENDING,
                    target=item.target,
                    user_id=item.user_id,
                    request_id=item.request_id,
                    reason=item.reason,
                    error=result.error,
                    retry_count=retry_count,
                    next_attempt_at=_next_retry_attempt_at(
                        now=now,
                        retry_count=retry_count,
                        retry_policy=self.retry_policy,
                    ),
                )
            )
            return DeletionResult(
                queue_id=item.queue_id,
                status=DeletionStatus.PENDING,
                target=item.target,
                error=result.error,
                request_id=item.request_id,
            )
        raise ValueError(f"Unsupported deletion handler status: {result.status.value}")

    def requeue_stale(self, *, lease_seconds: int) -> int:
        return self.storage.requeue_stale(lease_seconds=lease_seconds)


def _row_to_request(row: tuple[object, ...]) -> DeletionRequest:
    return DeletionRequest(
        queue_id=str(row[0]),
        created_at=_coerce_datetime(row[1]),
        target=DeletionTarget(str(row[2])),
        user_id=str(row[3]) if row[3] is not None else None,
        request_id=str(row[4]) if row[4] is not None else None,
        reason=str(row[5]),
    )


def _deletion_result_with_request_id(*, result: DeletionResult, request_id: str | None) -> DeletionResult:
    return DeletionResult(
        queue_id=result.queue_id,
        status=result.status,
        target=result.target,
        error=result.error,
        request_id=request_id,
    )


def _in_progress_snapshot(
    item: DeletionRequest,
    previous_snapshot: DeletionStatusSnapshot | None,
) -> DeletionStatusSnapshot:
    return DeletionStatusSnapshot(
        queue_id=item.queue_id,
        created_at=item.created_at,
        updated_at=datetime.now(timezone.utc),
        status=DeletionStatus.IN_PROGRESS,
        target=item.target,
        user_id=item.user_id,
        request_id=item.request_id,
        reason=item.reason,
        error=previous_snapshot.error if previous_snapshot is not None else None,
        retry_count=previous_snapshot.retry_count if previous_snapshot is not None else 0,
        next_attempt_at=None,
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
        retry_count=_coerce_non_negative_int(row[9] if len(row) > 9 else None),
        next_attempt_at=_coerce_optional_datetime(row[10] if len(row) > 10 else None),
    )


def _coerce_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value))


def _coerce_optional_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    return _coerce_datetime(value)


def _coerce_non_negative_int(value: object) -> int:
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, str) and value.isdigit():
        return max(0, int(value))
    return 0


def _snapshot_is_claimable(
    *,
    snapshot: DeletionStatusSnapshot | None,
    now: datetime,
) -> bool:
    if snapshot is None:
        return True
    if snapshot.status != DeletionStatus.PENDING:
        return False
    return snapshot.next_attempt_at is None or snapshot.next_attempt_at <= now


def _next_retry_attempt_at(
    *,
    now: datetime,
    retry_count: int,
    retry_policy: DeletionRetryPolicy,
) -> datetime:
    exponent = max(0, retry_count - 1)
    delay_seconds = min(
        retry_policy.max_delay_seconds,
        retry_policy.base_delay_seconds * (2**exponent),
    )
    return now + timedelta(seconds=delay_seconds)


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
