from __future__ import annotations

import json
from pathlib import Path
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Protocol


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


class RetentionStore(Protocol):
    def list_records(self, data_class: RetentionDataClass, limit: int) -> list[RetentionRecord]:
        ...


class InMemoryRetentionStore:
    def __init__(self, records: list[RetentionRecord] | None = None) -> None:
        self._records = list(records or [])

    def add(self, record: RetentionRecord) -> None:
        self._records.append(record)

    def list_records(self, data_class: RetentionDataClass, limit: int) -> list[RetentionRecord]:
        filtered = [r for r in self._records if r.data_class == data_class]
        filtered.sort(key=lambda item: item.created_at)
        return filtered[: max(0, limit)]


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
            }
            for record in records
        ]
        self.path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def add(self, record: RetentionRecord) -> None:
        records = self._load()
        records.append(record)
        self._save(records)

    def list_records(self, data_class: RetentionDataClass, limit: int) -> list[RetentionRecord]:
        records = [r for r in self._load() if r.data_class == data_class]
        records.sort(key=lambda item: item.created_at)
        return records[: max(0, limit)]


class RetentionCleanupAdapter(Protocol):
    def delete_record(self, record: RetentionRecord) -> bool:
        ...


class NoOpRetentionCleanupAdapter:
    def __init__(self) -> None:
        self.deleted_ids: list[str] = []

    def delete_record(self, record: RetentionRecord) -> bool:
        self.deleted_ids.append(record.record_id)
        return True


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
                deleted += 1

        return CleanupJobResult(
            scanned_count=len(scanned),
            expired_count=len(expired),
            deleted_count=deleted,
            data_class=data_class,
        )
