from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from pathlib import Path
from typing import Callable, Protocol


class RetentionStoreError(Exception):
    pass


class RetentionDataClass(StrEnum):
    ORIGINAL = "original"
    DERIVED = "derived"
    LOG = "log"


@dataclass(frozen=True)
class RetentionPolicyConfig:
    original_ttl_days: int = 30
    derived_ttl_days: int = 90
    log_ttl_days: int = 14

    @classmethod
    def from_env(cls, env_getter) -> "RetentionPolicyConfig":
        def _env_int(name: str, default: int) -> int:
            raw = env_getter(name)
            if raw is None:
                return default
            try:
                return int(raw)
            except ValueError:
                return default

        return cls(
            original_ttl_days=max(0, _env_int("RETENTION_ORIGINAL_TTL_DAYS", 30)),
            derived_ttl_days=max(0, _env_int("RETENTION_DERIVED_TTL_DAYS", 90)),
            log_ttl_days=max(0, _env_int("RETENTION_LOG_TTL_DAYS", 14)),
        )

    def ttl_days(self, data_class: RetentionDataClass) -> int:
        if data_class == RetentionDataClass.ORIGINAL:
            return self.original_ttl_days
        if data_class == RetentionDataClass.DERIVED:
            return self.derived_ttl_days
        return self.log_ttl_days


@dataclass(frozen=True)
class RetentionRecord:
    record_id: str
    data_class: RetentionDataClass
    created_at: datetime
    user_id: str | None = None
    request_id: str | None = None
    storage_key: str | None = None
    object_generation: int | None = None


class RetentionStore(Protocol):
    def add(self, record: RetentionRecord) -> None:
        ...

    def list_records(self, data_class: RetentionDataClass, limit: int) -> list[RetentionRecord]:
        ...

    def remove(self, record_id: str) -> None:
        ...


class InMemoryRetentionStore:
    def __init__(self, records: list[RetentionRecord] | None = None) -> None:
        self._records = list(records or [])

    def add(self, record: RetentionRecord) -> None:
        self._records = [item for item in self._records if item.record_id != record.record_id]
        self._records.append(record)

    def list_records(self, data_class: RetentionDataClass, limit: int) -> list[RetentionRecord]:
        filtered = [r for r in self._records if r.data_class == data_class]
        filtered.sort(key=lambda item: item.created_at)
        return filtered[: max(0, limit)]

    def remove(self, record_id: str) -> None:
        self._records = [record for record in self._records if record.record_id != record_id]


class JsonFileRetentionStore:
    """
    Minimal persistent retention registry.
    File format: JSON array of RetentionRecord-like objects.
    """

    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("[]", encoding="utf-8")

    def _load(self) -> list[RetentionRecord]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        records: list[RetentionRecord] = []
        for item in raw if isinstance(raw, list) else []:
            try:
                records.append(
                    RetentionRecord(
                        record_id=str(item["record_id"]),
                        data_class=RetentionDataClass(str(item["data_class"])),
                        created_at=datetime.fromisoformat(str(item["created_at"])),
                        user_id=item.get("user_id"),
                        request_id=item.get("request_id"),
                        storage_key=item.get("storage_key"),
                        object_generation=_coerce_optional_int(item.get("object_generation")),
                    )
                )
            except Exception:
                continue
        return records

    def _save(self, records: list[RetentionRecord]) -> None:
        payload = [
            {
                "record_id": record.record_id,
                "data_class": record.data_class.value,
                "created_at": record.created_at.isoformat(),
                "user_id": record.user_id,
                "request_id": record.request_id,
                "storage_key": record.storage_key,
                "object_generation": record.object_generation,
            }
            for record in records
        ]
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def add(self, record: RetentionRecord) -> None:
        records = self._load()
        records = [item for item in records if item.record_id != record.record_id]
        records.append(record)
        self._save(records)

    def list_records(self, data_class: RetentionDataClass, limit: int) -> list[RetentionRecord]:
        records = [r for r in self._load() if r.data_class == data_class]
        records.sort(key=lambda item: item.created_at)
        return records[: max(0, limit)]

    def remove(self, record_id: str) -> None:
        records = [record for record in self._load() if record.record_id != record_id]
        self._save(records)


@dataclass(slots=True)
class PostgresRetentionStore:
    database_url: str
    table_name: str = "retention_records"

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise RetentionStoreError("DATABASE_URL is required for postgres retention backend.")
        self.table_name = _sanitize_table_name(self.table_name, fallback="retention_records")

    def add(self, record: RetentionRecord) -> None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_table(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} "
                            "(record_id,data_class,created_at,user_id,request_id,storage_key,object_generation,updated_at) "
                            "VALUES (%s,%s,%s::timestamptz,%s,%s,%s,%s,NOW()) "
                            "ON CONFLICT (record_id) DO UPDATE SET "
                            "data_class=EXCLUDED.data_class,"
                            "created_at=EXCLUDED.created_at,"
                            "user_id=EXCLUDED.user_id,"
                            "request_id=EXCLUDED.request_id,"
                            "storage_key=EXCLUDED.storage_key,"
                            "object_generation=EXCLUDED.object_generation,"
                            "updated_at=NOW()"
                        ),
                        (
                            record.record_id,
                            record.data_class.value,
                            record.created_at.isoformat(),
                            record.user_id,
                            record.request_id,
                            record.storage_key,
                            record.object_generation,
                        ),
                    )
        except Exception as error:
            raise RetentionStoreError(f"Failed to add retention record to postgres: {error}") from error

    def list_records(self, data_class: RetentionDataClass, limit: int) -> list[RetentionRecord]:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_table(conn)
                with conn.cursor() as cursor:
                    self._ensure_object_generation_column(conn)
                    cursor.execute(
                        (
                            f"SELECT record_id,data_class,created_at,user_id,request_id,storage_key,object_generation "
                            f"FROM {self.table_name} "
                            "WHERE data_class = %s "
                            "ORDER BY created_at ASC "
                            "LIMIT %s"
                        ),
                        (data_class.value, max(0, limit)),
                    )
                    rows = cursor.fetchall()
            return [_row_to_retention_record(row) for row in rows]
        except Exception as error:
            raise RetentionStoreError(f"Failed to list retention records from postgres: {error}") from error

    def remove(self, record_id: str) -> None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_table(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"DELETE FROM {self.table_name} WHERE record_id = %s",
                        (record_id,),
                    )
        except Exception as error:
            raise RetentionStoreError(f"Failed to remove retention record from postgres: {error}") from error

    def _ensure_table(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.table_name} ("
                    "record_id TEXT PRIMARY KEY,"
                    "data_class TEXT NOT NULL,"
                    "created_at TIMESTAMPTZ NOT NULL,"
                    "user_id TEXT NULL,"
                    "request_id TEXT NULL,"
                    "storage_key TEXT NULL,"
                    "object_generation BIGINT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
                    ")"
                )
            )
            self._ensure_object_generation_column(conn)
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {self.table_name}_class_created_idx "
                f"ON {self.table_name} (data_class, created_at)"
            )

    def _ensure_object_generation_column(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(f"ALTER TABLE {self.table_name} ADD COLUMN IF NOT EXISTS object_generation BIGINT NULL")


class RetentionCleanupAdapter(Protocol):
    def delete_record(self, record: RetentionRecord) -> bool:
        ...


class NoOpRetentionCleanupAdapter:
    def __init__(self) -> None:
        self.deleted_ids: list[str] = []

    def delete_record(self, record: RetentionRecord) -> bool:
        self.deleted_ids.append(record.record_id)
        return True


class CallbackRetentionCleanupAdapter:
    def __init__(self, delete_callback: Callable[[RetentionRecord], bool]) -> None:
        self._delete_callback = delete_callback
        self.deleted_ids: list[str] = []

    def delete_record(self, record: RetentionRecord) -> bool:
        deleted = self._delete_callback(record)
        if deleted:
            self.deleted_ids.append(record.record_id)
        return deleted


class LocalFileRetentionCleanupAdapter:
    """
    Deletes files only under configured root directories.
    `record.storage_key` must be a relative path.
    """

    def __init__(self, allowed_roots: list[str]) -> None:
        self.allowed_roots = [Path(root).resolve() for root in allowed_roots if root]
        self.deleted_ids: list[str] = []

    def _resolve_under_root(self, storage_key: str) -> Path | None:
        rel = Path(storage_key)
        if rel.is_absolute():
            return None
        for root in self.allowed_roots:
            candidate = (root / rel).resolve()
            try:
                candidate.relative_to(root)
            except ValueError:
                continue
            return candidate
        return None

    def delete_record(self, record: RetentionRecord) -> bool:
        if not record.storage_key:
            return False
        target = self._resolve_under_root(record.storage_key)
        if target is None or not target.exists() or not target.is_file():
            return False
        try:
            target.unlink()
            self.deleted_ids.append(record.record_id)
            return True
        except OSError:
            return False


@dataclass(frozen=True)
class CleanupJobResult:
    scanned_count: int
    expired_count: int
    deleted_count: int
    data_class: RetentionDataClass


class RetentionCleanupJob:
    def __init__(self, store: RetentionStore, policy: RetentionPolicyConfig, adapter: RetentionCleanupAdapter) -> None:
        self.store = store
        self.policy = policy
        self.adapter = adapter

    def select_expired(
        self,
        *,
        data_class: RetentionDataClass,
        now: datetime | None = None,
        limit: int = 100,
    ) -> list[RetentionRecord]:
        now = now or datetime.now(timezone.utc)
        ttl_days = self.policy.ttl_days(data_class)
        deadline = now - timedelta(days=ttl_days)
        records = self.store.list_records(data_class=data_class, limit=limit)
        return [record for record in records if record.created_at <= deadline]

    def run_once(
        self,
        *,
        data_class: RetentionDataClass,
        now: datetime | None = None,
        limit: int = 100,
    ) -> CleanupJobResult:
        now = now or datetime.now(timezone.utc)
        scanned = self.store.list_records(data_class=data_class, limit=limit)
        expired = self.select_expired(data_class=data_class, now=now, limit=limit)
        deleted = 0
        for record in expired:
            if self.adapter.delete_record(record):
                self.store.remove(record.record_id)
                deleted += 1

        return CleanupJobResult(
            scanned_count=len(scanned),
            expired_count=len(expired),
            deleted_count=deleted,
            data_class=data_class,
        )


def _row_to_retention_record(row: tuple[object, ...]) -> RetentionRecord:
    return RetentionRecord(
        record_id=str(row[0]),
        data_class=RetentionDataClass(str(row[1])),
        created_at=_coerce_datetime(row[2]),
        user_id=str(row[3]) if row[3] is not None else None,
        request_id=str(row[4]) if row[4] is not None else None,
        storage_key=str(row[5]) if row[5] is not None else None,
        object_generation=_coerce_optional_int(row[6]) if len(row) > 6 else None,
    )


def _coerce_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value))


def _coerce_optional_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _load_connect():
    try:
        from psycopg import connect  # type: ignore
    except Exception as error:
        raise RetentionStoreError(
            "psycopg is required for postgres retention backend. Install backend/requirements.txt."
        ) from error
    return connect


def _sanitize_table_name(raw: str, *, fallback: str) -> str:
    candidate = (raw or "").strip() or fallback
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
        raise RetentionStoreError("Retention table name has invalid format.")
    return candidate
