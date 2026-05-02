from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import StrEnum
import re
from threading import Lock
from typing import Protocol
from urllib.parse import urlsplit
from uuid import uuid4

_POSTGRES_IDENTIFIER_MAX_LENGTH = 63


class CostGuardrailAction(StrEnum):
    NORMAL = "normal"
    WARN = "warn"
    DEGRADE = "degrade"
    FALLBACK = "fallback"


@dataclass
class MonthlyUsage:
    period_key: str
    total_cost_usd: float = 0.0
    total_tokens: int = 0
    reserved_cost_usd: float = 0.0
    reserved_tokens: int = 0


@dataclass(frozen=True)
class CostGuardrailDecision:
    action: CostGuardrailAction
    ratio: float
    projected_total_cost_usd: float
    period_key: str


@dataclass(frozen=True)
class CostGuardrailReservation:
    reservation_id: str
    period_key: str
    reserved_cost_usd: float
    reserved_tokens: int
    decision: CostGuardrailDecision
    reserved: bool


@dataclass(frozen=True)
class _ReservationStorageResult:
    usage: MonthlyUsage
    reserved: bool


class MonthlyUsageStorage(Protocol):
    def get(self, period_key: str) -> MonthlyUsage:
        ...

    def put(self, usage: MonthlyUsage) -> None:
        ...

    def increment(self, *, period_key: str, cost_usd: float, tokens: int) -> MonthlyUsage:
        ...

    def adjust(self, *, period_key: str, cost_delta_usd: float, token_delta: int) -> MonthlyUsage:
        ...

    def reserve(
        self,
        *,
        period_key: str,
        reservation_id: str,
        cost_usd: float,
        tokens: int,
        limit_cost_usd: float,
    ) -> _ReservationStorageResult:
        ...

    def release(self, *, reservation_id: str) -> MonthlyUsage:
        ...

    def release_expired(self, *, period_key: str, older_than: datetime) -> MonthlyUsage:
        ...

    def commit(
        self,
        *,
        reservation_id: str,
        cost_usd: float,
        tokens: int,
    ) -> MonthlyUsage:
        ...


class CostGuardrailStoreError(RuntimeError):
    pass


class CostGuardrailReservationError(CostGuardrailStoreError):
    pass


@dataclass(frozen=True)
class _StoredReservation:
    reservation_id: str
    period_key: str
    reserved_cost_usd: float
    reserved_tokens: int
    status: str
    created_at: datetime


class InMemoryMonthlyUsageStorage:
    def __init__(self) -> None:
        self._store: dict[str, MonthlyUsage] = {}
        self._reservations: dict[str, _StoredReservation] = {}
        self._lock = Lock()

    def get(self, period_key: str) -> MonthlyUsage:
        with self._lock:
            usage = self._store.get(period_key)
            if usage is None:
                usage = MonthlyUsage(period_key=period_key)
                self._store[period_key] = usage
            return _copy_monthly_usage(usage)

    def put(self, usage: MonthlyUsage) -> None:
        with self._lock:
            self._store[usage.period_key] = _copy_monthly_usage(usage)

    def increment(self, *, period_key: str, cost_usd: float, tokens: int) -> MonthlyUsage:
        with self._lock:
            usage = self._store.get(period_key)
            if usage is None:
                usage = MonthlyUsage(period_key=period_key)
                self._store[period_key] = usage
            usage.total_cost_usd += max(0.0, cost_usd)
            usage.total_tokens += max(0, tokens)
            return _copy_monthly_usage(usage)

    def adjust(self, *, period_key: str, cost_delta_usd: float, token_delta: int) -> MonthlyUsage:
        with self._lock:
            usage = self._store.get(period_key)
            if usage is None:
                usage = MonthlyUsage(period_key=period_key)
                self._store[period_key] = usage
            usage.total_cost_usd = max(0.0, usage.total_cost_usd + cost_delta_usd)
            usage.total_tokens = max(0, usage.total_tokens + token_delta)
            return _copy_monthly_usage(usage)

    def reserve(
        self,
        *,
        period_key: str,
        reservation_id: str,
        cost_usd: float,
        tokens: int,
        limit_cost_usd: float,
    ) -> _ReservationStorageResult:
        with self._lock:
            usage = self._store.get(period_key)
            if usage is None:
                usage = MonthlyUsage(period_key=period_key)
                self._store[period_key] = usage
            reserved_cost_usd = max(0.0, cost_usd)
            reserved_tokens = max(0, tokens)
            projected_total_cost_usd = usage.total_cost_usd + usage.reserved_cost_usd + reserved_cost_usd
            if projected_total_cost_usd >= max(0.0, limit_cost_usd):
                return _ReservationStorageResult(usage=_copy_monthly_usage(usage), reserved=False)
            usage.reserved_cost_usd += reserved_cost_usd
            usage.reserved_tokens += reserved_tokens
            self._reservations[reservation_id] = _StoredReservation(
                reservation_id=reservation_id,
                period_key=period_key,
                reserved_cost_usd=reserved_cost_usd,
                reserved_tokens=reserved_tokens,
                status="reserved",
                created_at=datetime.now(timezone.utc),
            )
            return _ReservationStorageResult(usage=_copy_monthly_usage(usage), reserved=True)

    def release(self, *, reservation_id: str) -> MonthlyUsage:
        with self._lock:
            reservation = self._get_active_reservation(reservation_id)
            usage = self._get_reservation_usage(reservation)
            usage.reserved_cost_usd = max(0.0, usage.reserved_cost_usd - reservation.reserved_cost_usd)
            usage.reserved_tokens = max(0, usage.reserved_tokens - reservation.reserved_tokens)
            self._reservations[reservation_id] = _replace_reservation_status(reservation, "released")
            return _copy_monthly_usage(usage)

    def release_expired(self, *, period_key: str, older_than: datetime) -> MonthlyUsage:
        with self._lock:
            usage = self._store.get(period_key)
            if usage is None:
                usage = MonthlyUsage(period_key=period_key)
                self._store[period_key] = usage
            expired_reservations = [
                reservation
                for reservation in self._reservations.values()
                if reservation.period_key == period_key
                and reservation.status == "reserved"
                and reservation.created_at < older_than
            ]
            for reservation in expired_reservations:
                usage.reserved_cost_usd = max(0.0, usage.reserved_cost_usd - reservation.reserved_cost_usd)
                usage.reserved_tokens = max(0, usage.reserved_tokens - reservation.reserved_tokens)
                self._reservations[reservation.reservation_id] = _replace_reservation_status(
                    reservation,
                    "released",
                )
            return _copy_monthly_usage(usage)

    def commit(
        self,
        *,
        reservation_id: str,
        cost_usd: float,
        tokens: int,
    ) -> MonthlyUsage:
        with self._lock:
            reservation = self._get_active_reservation(reservation_id)
            usage = self._get_reservation_usage(reservation)
            usage.reserved_cost_usd = max(0.0, usage.reserved_cost_usd - reservation.reserved_cost_usd)
            usage.reserved_tokens = max(0, usage.reserved_tokens - reservation.reserved_tokens)
            usage.total_cost_usd += max(0.0, cost_usd)
            usage.total_tokens += max(0, tokens)
            self._reservations[reservation_id] = _replace_reservation_status(reservation, "committed")
            return _copy_monthly_usage(usage)

    def _get_active_reservation(self, reservation_id: str) -> _StoredReservation:
        reservation = self._reservations.get(reservation_id)
        if reservation is None or reservation.status != "reserved":
            raise CostGuardrailReservationError(
                f"Cost guardrail reservation is not active: reservation_id={reservation_id}"
            )
        return reservation

    def _get_reservation_usage(self, reservation: _StoredReservation) -> MonthlyUsage:
        usage = self._store.get(reservation.period_key)
        if usage is None:
            raise CostGuardrailReservationError(
                f"Cost guardrail reservation period is missing: reservation_id={reservation.reservation_id}"
            )
        return usage


@dataclass(slots=True)
class PostgresMonthlyUsageStorage:
    database_url: str
    table_name: str = "label_monthly_usage"
    reservation_table_name: str = ""
    _schema_ready: bool = False
    _schema_lock: Lock = field(default_factory=Lock, init=False, repr=False)

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise CostGuardrailStoreError("DATABASE_URL is required for postgres cost guardrail storage.")
        self.table_name = _sanitize_table_name(self.table_name, fallback="label_monthly_usage")
        self.reservation_table_name = _sanitize_table_name(
            self.reservation_table_name,
            fallback=f"{self.table_name}_reservations",
        )

    def get(self, period_key: str) -> MonthlyUsage:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"SELECT period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens "
                            f"FROM {self.table_name} WHERE period_key = %s"
                        ),
                        (period_key,),
                    )
                    row = cursor.fetchone()
            if row is None:
                return MonthlyUsage(period_key=period_key)
            return _row_to_monthly_usage(row)
        except Exception as error:
            raise CostGuardrailStoreError(
                f"Failed to load cost guardrail usage from postgres: {self._safe_error_message(error)}"
            ) from error

    def put(self, usage: MonthlyUsage) -> None:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} "
                            "(period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens,updated_at) "
                            "VALUES (%s,%s,%s,%s,%s,NOW()) "
                            "ON CONFLICT (period_key) DO UPDATE SET "
                            "total_cost_usd=EXCLUDED.total_cost_usd,"
                            "total_tokens=EXCLUDED.total_tokens,"
                            "reserved_cost_usd=EXCLUDED.reserved_cost_usd,"
                            "reserved_tokens=EXCLUDED.reserved_tokens,"
                            "updated_at=NOW()"
                        ),
                        (
                            usage.period_key,
                            max(0.0, usage.total_cost_usd),
                            max(0, usage.total_tokens),
                            max(0.0, usage.reserved_cost_usd),
                            max(0, usage.reserved_tokens),
                        ),
                    )
        except Exception as error:
            raise CostGuardrailStoreError(
                f"Failed to save cost guardrail usage to postgres: {self._safe_error_message(error)}"
            ) from error

    def increment(self, *, period_key: str, cost_usd: float, tokens: int) -> MonthlyUsage:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} "
                            "(period_key,total_cost_usd,total_tokens,updated_at) "
                            "VALUES (%s,%s,%s,NOW()) "
                            "ON CONFLICT (period_key) DO UPDATE SET "
                            f"total_cost_usd={self.table_name}.total_cost_usd + EXCLUDED.total_cost_usd,"
                            f"total_tokens={self.table_name}.total_tokens + EXCLUDED.total_tokens,"
                            "updated_at=NOW() "
                            "RETURNING period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens"
                        ),
                        (period_key, max(0.0, cost_usd), max(0, tokens)),
                    )
                    row = cursor.fetchone()
            if row is None:
                raise CostGuardrailStoreError("Postgres usage increment did not return a row.")
            return _row_to_monthly_usage(row)
        except CostGuardrailStoreError:
            raise
        except Exception as error:
            raise CostGuardrailStoreError(
                f"Failed to increment cost guardrail usage in postgres: {self._safe_error_message(error)}"
            ) from error

    def adjust(self, *, period_key: str, cost_delta_usd: float, token_delta: int) -> MonthlyUsage:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} "
                            "(period_key,total_cost_usd,total_tokens,updated_at) "
                            "VALUES (%s,GREATEST(0.0,%s),GREATEST(0,%s),NOW()) "
                            "ON CONFLICT (period_key) DO UPDATE SET "
                            f"total_cost_usd=GREATEST(0,{self.table_name}.total_cost_usd + %s),"
                            f"total_tokens=GREATEST(0,{self.table_name}.total_tokens + %s),"
                            "updated_at=NOW() "
                            "RETURNING period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens"
                        ),
                        (period_key, cost_delta_usd, token_delta, cost_delta_usd, token_delta),
                    )
                    row = cursor.fetchone()
            if row is None:
                raise CostGuardrailStoreError("Postgres usage adjustment did not return a row.")
            return _row_to_monthly_usage(row)
        except CostGuardrailStoreError:
            raise
        except Exception as error:
            raise CostGuardrailStoreError(
                f"Failed to adjust cost guardrail usage in postgres: {self._safe_error_message(error)}"
            ) from error

    def reserve(
        self,
        *,
        period_key: str,
        reservation_id: str,
        cost_usd: float,
        tokens: int,
        limit_cost_usd: float,
    ) -> _ReservationStorageResult:
        self.initialize_schema()
        connect = _load_connect()
        reserved_cost_usd = max(0.0, cost_usd)
        reserved_tokens = max(0, tokens)
        try:
            with connect(self.database_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} "
                            "(period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens,updated_at) "
                            "VALUES (%s,0,0,0,0,NOW()) "
                            "ON CONFLICT (period_key) DO NOTHING"
                        ),
                        (period_key,),
                    )
                    cursor.execute(
                        (
                            f"UPDATE {self.table_name} SET "
                            f"reserved_cost_usd={self.table_name}.reserved_cost_usd + %s,"
                            f"reserved_tokens={self.table_name}.reserved_tokens + %s,"
                            "updated_at=NOW() "
                            "WHERE period_key=%s "
                            f"AND {self.table_name}.total_cost_usd + {self.table_name}.reserved_cost_usd + %s < %s "
                            "RETURNING period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens"
                        ),
                        (reserved_cost_usd, reserved_tokens, period_key, reserved_cost_usd, max(0.0, limit_cost_usd)),
                    )
                    usage_row = cursor.fetchone()
                    if usage_row is None:
                        cursor.execute(
                            (
                                f"SELECT period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens "
                                f"FROM {self.table_name} WHERE period_key = %s"
                            ),
                            (period_key,),
                        )
                        current_usage_row = cursor.fetchone()
                        if current_usage_row is None:
                            raise CostGuardrailStoreError(
                                f"Postgres reservation could not load usage: period_key={period_key}"
                            )
                        return _ReservationStorageResult(
                            usage=_row_to_monthly_usage(current_usage_row),
                            reserved=False,
                        )
                    cursor.execute(
                        (
                            f"INSERT INTO {self.reservation_table_name} "
                            "(reservation_id,period_key,reserved_cost_usd,reserved_tokens,status,created_at,updated_at) "
                            "VALUES (%s,%s,%s,%s,'reserved',NOW(),NOW())"
                        ),
                        (reservation_id, period_key, reserved_cost_usd, reserved_tokens),
                    )
            return _ReservationStorageResult(usage=_row_to_monthly_usage(usage_row), reserved=True)
        except CostGuardrailStoreError:
            raise
        except Exception as error:
            raise CostGuardrailStoreError(
                f"Failed to reserve cost guardrail usage in postgres: {self._safe_error_message(error)}"
            ) from error

    def release(self, *, reservation_id: str) -> MonthlyUsage:
        return self._settle_reservation(
            reservation_id=reservation_id,
            target_status="released",
            cost_usd=0.0,
            tokens=0,
            commit_usage=False,
        )

    def release_expired(self, *, period_key: str, older_than: datetime) -> MonthlyUsage:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"WITH expired AS ("
                            f"UPDATE {self.reservation_table_name} SET "
                            "status='released',updated_at=NOW() "
                            "WHERE period_key=%s AND status='reserved' AND created_at < %s "
                            "RETURNING reserved_cost_usd,reserved_tokens"
                            "), totals AS ("
                            "SELECT "
                            "COALESCE(SUM(reserved_cost_usd),0) AS reserved_cost_usd,"
                            "COALESCE(SUM(reserved_tokens),0) AS reserved_tokens "
                            "FROM expired"
                            ") "
                            f"UPDATE {self.table_name} SET "
                            f"reserved_cost_usd=GREATEST(0,{self.table_name}.reserved_cost_usd - totals.reserved_cost_usd),"
                            f"reserved_tokens=GREATEST(0,{self.table_name}.reserved_tokens - totals.reserved_tokens),"
                            "updated_at=NOW() "
                            "FROM totals "
                            f"WHERE {self.table_name}.period_key=%s "
                            f"RETURNING {self.table_name}.period_key,"
                            f"{self.table_name}.total_cost_usd,"
                            f"{self.table_name}.total_tokens,"
                            f"{self.table_name}.reserved_cost_usd,"
                            f"{self.table_name}.reserved_tokens"
                        ),
                        (period_key, older_than, period_key),
                    )
                    usage_row = cursor.fetchone()
            if usage_row is None:
                return MonthlyUsage(period_key=period_key)
            return _row_to_monthly_usage(usage_row)
        except Exception as error:
            raise CostGuardrailStoreError(
                "Failed to release expired cost guardrail reservations in postgres: "
                f"period_key={period_key}; error={self._safe_error_message(error)}"
            ) from error

    def commit(
        self,
        *,
        reservation_id: str,
        cost_usd: float,
        tokens: int,
    ) -> MonthlyUsage:
        return self._settle_reservation(
            reservation_id=reservation_id,
            target_status="committed",
            cost_usd=max(0.0, cost_usd),
            tokens=max(0, tokens),
            commit_usage=True,
        )

    def initialize_schema(self) -> None:
        if self._schema_ready:
            return
        with self._schema_lock:
            if self._schema_ready:
                return
            connect = _load_connect()
            try:
                with connect(self.database_url, autocommit=True) as conn:
                    self._ensure_table(conn)
            except Exception as error:
                raise CostGuardrailStoreError(
                    f"Failed to initialize cost guardrail schema: {self._safe_error_message(error)}"
                ) from error
            self._schema_ready = True

    def _ensure_table(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.table_name} ("
                    "period_key TEXT PRIMARY KEY,"
                    "total_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,"
                    "total_tokens BIGINT NOT NULL DEFAULT 0,"
                    "reserved_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,"
                    "reserved_tokens BIGINT NOT NULL DEFAULT 0,"
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
                    ")"
                )
            )
            cursor.execute(
                f"ALTER TABLE {self.table_name} ADD COLUMN IF NOT EXISTS reserved_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0"
            )
            cursor.execute(
                f"ALTER TABLE {self.table_name} ADD COLUMN IF NOT EXISTS reserved_tokens BIGINT NOT NULL DEFAULT 0"
            )
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.reservation_table_name} ("
                    "reservation_id TEXT PRIMARY KEY,"
                    f"period_key TEXT NOT NULL REFERENCES {self.table_name}(period_key) ON DELETE CASCADE,"
                    "reserved_cost_usd DOUBLE PRECISION NOT NULL,"
                    "reserved_tokens BIGINT NOT NULL,"
                    "status TEXT NOT NULL,"
                    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
                    ")"
                )
            )

    def _settle_reservation(
        self,
        *,
        reservation_id: str,
        target_status: str,
        cost_usd: float,
        tokens: int,
        commit_usage: bool,
    ) -> MonthlyUsage:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"UPDATE {self.reservation_table_name} SET "
                            "status=%s,updated_at=NOW() "
                            "WHERE reservation_id=%s AND status='reserved' "
                            "RETURNING period_key,reserved_cost_usd,reserved_tokens"
                        ),
                        (target_status, reservation_id),
                    )
                    reservation_row = cursor.fetchone()
                    if reservation_row is None:
                        raise CostGuardrailReservationError(
                            f"Cost guardrail reservation is not active: reservation_id={reservation_id}"
                        )
                    period_key = str(reservation_row[0])
                    reserved_cost_usd = float(reservation_row[1])
                    reserved_tokens = int(reservation_row[2])
                    if commit_usage:
                        cursor.execute(
                            (
                                f"UPDATE {self.table_name} SET "
                                f"reserved_cost_usd=GREATEST(0,{self.table_name}.reserved_cost_usd - %s),"
                                f"reserved_tokens=GREATEST(0,{self.table_name}.reserved_tokens - %s),"
                                f"total_cost_usd={self.table_name}.total_cost_usd + %s,"
                                f"total_tokens={self.table_name}.total_tokens + %s,"
                                "updated_at=NOW() "
                                "WHERE period_key=%s "
                                "RETURNING period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens"
                            ),
                            (reserved_cost_usd, reserved_tokens, max(0.0, cost_usd), max(0, tokens), period_key),
                        )
                    else:
                        cursor.execute(
                            (
                                f"UPDATE {self.table_name} SET "
                                f"reserved_cost_usd=GREATEST(0,{self.table_name}.reserved_cost_usd - %s),"
                                f"reserved_tokens=GREATEST(0,{self.table_name}.reserved_tokens - %s),"
                                "updated_at=NOW() "
                                "WHERE period_key=%s "
                                "RETURNING period_key,total_cost_usd,total_tokens,reserved_cost_usd,reserved_tokens"
                            ),
                            (reserved_cost_usd, reserved_tokens, period_key),
                        )
                    usage_row = cursor.fetchone()
            if usage_row is None:
                raise CostGuardrailStoreError(
                    f"Postgres reservation settlement did not return usage: reservation_id={reservation_id}"
                )
            return _row_to_monthly_usage(usage_row)
        except CostGuardrailStoreError:
            raise
        except Exception as error:
            raise CostGuardrailStoreError(
                "Failed to settle cost guardrail reservation in postgres: "
                f"reservation_id={reservation_id}; error={self._safe_error_message(error)}"
            ) from error

    def _safe_error_message(self, error: BaseException) -> str:
        return _redact_database_url_details(str(error), self.database_url)


class CostGuardrailService:
    """
    사전 평가는 호출 후 기록과 분리되어 있다.
    저장소 오류는 명시적으로 발생시켜 호출자가 차단으로 처리해야 한다.
    """

    def __init__(
        self,
        storage: MonthlyUsageStorage,
        *,
        monthly_budget_usd: float,
        warn_ratio: float = 0.70,
        degrade_ratio: float = 0.85,
        fallback_ratio: float = 1.00,
        reservation_ttl_seconds: int = 900,
    ) -> None:
        self.storage = storage
        self.monthly_budget_usd = max(0.0001, monthly_budget_usd)
        self.warn_ratio = warn_ratio
        self.degrade_ratio = degrade_ratio
        self.fallback_ratio = fallback_ratio
        self.reservation_ttl_seconds = max(0, reservation_ttl_seconds)

    def _period_key(self, now: datetime | None = None) -> str:
        now = now or datetime.now(timezone.utc)
        return f"{now.year:04d}-{now.month:02d}"

    def evaluate(self, projected_cost_usd: float, *, now: datetime | None = None) -> CostGuardrailDecision:
        period_key = self._period_key(now)
        usage = self.storage.get(period_key)
        projected_total = usage.total_cost_usd + usage.reserved_cost_usd + max(0.0, projected_cost_usd)
        return self._build_decision(projected_total=projected_total, period_key=period_key)

    def record(self, *, cost_usd: float, tokens: int, now: datetime | None = None) -> MonthlyUsage:
        period_key = self._period_key(now)
        return self.storage.increment(period_key=period_key, cost_usd=cost_usd, tokens=tokens)

    def reserve(self, *, cost_usd: float, tokens: int, now: datetime | None = None) -> CostGuardrailReservation:
        now_value = now or datetime.now(timezone.utc)
        period_key = self._period_key(now_value)
        if self.reservation_ttl_seconds > 0:
            self.storage.release_expired(
                period_key=period_key,
                older_than=now_value - timedelta(seconds=self.reservation_ttl_seconds),
            )
        reservation_id = uuid4().hex
        reserved_cost_usd = max(0.0, cost_usd)
        reserved_tokens = max(0, tokens)
        result = self.storage.reserve(
            period_key=period_key,
            reservation_id=reservation_id,
            cost_usd=reserved_cost_usd,
            tokens=reserved_tokens,
            limit_cost_usd=self.monthly_budget_usd * self.fallback_ratio,
        )
        projected_total = result.usage.total_cost_usd + result.usage.reserved_cost_usd
        if not result.reserved:
            projected_total += reserved_cost_usd
        decision = self._build_decision(projected_total=projected_total, period_key=period_key)
        if not result.reserved:
            decision = CostGuardrailDecision(
                action=CostGuardrailAction.FALLBACK,
                ratio=decision.ratio,
                projected_total_cost_usd=decision.projected_total_cost_usd,
                period_key=decision.period_key,
            )
        return CostGuardrailReservation(
            reservation_id=reservation_id,
            period_key=period_key,
            reserved_cost_usd=reserved_cost_usd,
            reserved_tokens=reserved_tokens,
            decision=decision,
            reserved=result.reserved,
        )

    def commit(
        self,
        reservation: CostGuardrailReservation,
        *,
        cost_usd: float,
        tokens: int,
    ) -> MonthlyUsage:
        if not reservation.reserved:
            return self.storage.get(reservation.period_key)
        return self.storage.commit(
            reservation_id=reservation.reservation_id,
            cost_usd=cost_usd,
            tokens=tokens,
        )

    def release(self, reservation: CostGuardrailReservation) -> MonthlyUsage:
        if not reservation.reserved:
            return self.storage.get(reservation.period_key)
        return self.storage.release(reservation_id=reservation.reservation_id)

    def _build_decision(self, *, projected_total: float, period_key: str) -> CostGuardrailDecision:
        ratio = projected_total / self.monthly_budget_usd

        if ratio >= self.fallback_ratio:
            action = CostGuardrailAction.FALLBACK
        elif ratio >= self.degrade_ratio:
            action = CostGuardrailAction.DEGRADE
        elif ratio >= self.warn_ratio:
            action = CostGuardrailAction.WARN
        else:
            action = CostGuardrailAction.NORMAL

        return CostGuardrailDecision(
            action=action,
            ratio=ratio,
            projected_total_cost_usd=projected_total,
            period_key=period_key,
        )


def _load_connect():
    try:
        from psycopg import connect  # type: ignore
    except Exception as error:
        raise CostGuardrailStoreError(
            "psycopg is required for postgres cost guardrail storage. Install backend/requirements.txt."
        ) from error
    return connect


def _sanitize_table_name(raw: str, *, fallback: str) -> str:
    candidate = ((raw or "").strip() or fallback).lower()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
        raise CostGuardrailStoreError("Cost guardrail table name has invalid format.")
    if len(candidate) > _POSTGRES_IDENTIFIER_MAX_LENGTH:
        raise CostGuardrailStoreError("Cost guardrail table name exceeds postgres identifier length.")
    return candidate


def _redact_database_url_details(message: str, database_url: str) -> str:
    safe_message = message.replace(database_url, "[REDACTED_DATABASE_URL]")
    try:
        parsed_url = urlsplit(database_url)
    except ValueError:
        return safe_message
    redaction_values = [
        parsed_url.netloc,
        parsed_url.hostname or "",
        parsed_url.username or "",
        parsed_url.password or "",
    ]
    for value in redaction_values:
        if value:
            safe_message = safe_message.replace(value, "[REDACTED_DATABASE_URL_DETAIL]")
    return safe_message


def _row_to_monthly_usage(row: tuple[object, ...]) -> MonthlyUsage:
    return MonthlyUsage(
        period_key=str(row[0]),
        total_cost_usd=float(row[1]),
        total_tokens=int(row[2]),
        reserved_cost_usd=float(row[3]) if len(row) >= 4 else 0.0,
        reserved_tokens=int(row[4]) if len(row) >= 5 else 0,
    )


def _copy_monthly_usage(usage: MonthlyUsage) -> MonthlyUsage:
    return MonthlyUsage(
        period_key=usage.period_key,
        total_cost_usd=usage.total_cost_usd,
        total_tokens=usage.total_tokens,
        reserved_cost_usd=usage.reserved_cost_usd,
        reserved_tokens=usage.reserved_tokens,
    )


def _replace_reservation_status(reservation: _StoredReservation, status: str) -> _StoredReservation:
    return _StoredReservation(
        reservation_id=reservation.reservation_id,
        period_key=reservation.period_key,
        reserved_cost_usd=reservation.reserved_cost_usd,
        reserved_tokens=reservation.reserved_tokens,
        status=status,
        created_at=reservation.created_at,
    )
