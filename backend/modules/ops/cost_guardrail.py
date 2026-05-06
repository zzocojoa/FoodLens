from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from threading import Lock
from typing import Protocol


class CostGuardrailAction(StrEnum):
    NORMAL = "normal"
    WARN = "warn"
    DEGRADE = "degrade"
    FALLBACK = "fallback"


@dataclass
class MonthlyUsage:
    period_key: str
    total_cost_usd: float = 0.0
    active_reserved_cost_usd: float = 0.0
    total_tokens: int = 0
    request_count: int = 0
    provider_reported_tokens: int = 0
    provider_reported_thought_tokens: int = 0
    fallback_count: int = 0
    truncated_count: int = 0


@dataclass(frozen=True)
class CostGuardrailDecision:
    action: CostGuardrailAction
    ratio: float
    projected_total_cost_usd: float
    period_key: str


@dataclass(frozen=True)
class CostReservation:
    decision: CostGuardrailDecision
    reservation_key: str
    reserved_cost_usd: float
    accepted: bool


class CostGuardrailStorageError(RuntimeError):
    pass


class MonthlyUsageStorage(Protocol):
    def get(self, period_key: str) -> MonthlyUsage:
        ...

    def put(self, usage: MonthlyUsage) -> None:
        ...

    def reserve(
        self,
        *,
        period_key: str,
        reservation_key: str,
        projected_cost_usd: float,
        monthly_budget_usd: float,
    ) -> CostReservation:
        ...

    def reconcile(
        self,
        *,
        period_key: str,
        reservation_key: str,
        cost_usd: float,
        tokens: int,
        provider_total_tokens: int | None,
        provider_thought_tokens: int | None,
        fallback_used: bool,
        truncated: bool,
        chargeable: bool,
    ) -> MonthlyUsage:
        ...


class InMemoryMonthlyUsageStorage:
    def __init__(self) -> None:
        self._store: dict[str, MonthlyUsage] = {}
        self._reservations: dict[tuple[str, str], _StoredReservation] = {}
        self._lock = Lock()

    def get(self, period_key: str) -> MonthlyUsage:
        with self._lock:
            return self._usage_snapshot(period_key)

    def put(self, usage: MonthlyUsage) -> None:
        with self._lock:
            self._store[usage.period_key] = _copy_usage(usage)

    def reserve(
        self,
        *,
        period_key: str,
        reservation_key: str,
        projected_cost_usd: float,
        monthly_budget_usd: float,
    ) -> CostReservation:
        reserved_cost_usd = _non_negative_float(projected_cost_usd)
        with self._lock:
            existing = self._reservations.get((period_key, reservation_key))
            if existing is not None:
                usage = self._usage_snapshot(period_key)
                return _reservation_from_usage(
                    usage=usage,
                    reservation_key=reservation_key,
                    reserved_cost_usd=existing.reserved_cost_usd,
                    monthly_budget_usd=monthly_budget_usd,
                    accepted=existing.status == "active",
                )

            usage = self._usage_snapshot(period_key)
            projected_total = usage.total_cost_usd + usage.active_reserved_cost_usd + reserved_cost_usd
            if projected_total > monthly_budget_usd:
                decision = _decision_from_projected_total(
                    projected_total_cost_usd=projected_total,
                    monthly_budget_usd=monthly_budget_usd,
                    period_key=period_key,
                    warn_ratio=1.0,
                    degrade_ratio=1.0,
                    fallback_ratio=1.0,
                )
                return CostReservation(
                    decision=decision,
                    reservation_key=reservation_key,
                    reserved_cost_usd=0.0,
                    accepted=False,
                )

            self._reservations[(period_key, reservation_key)] = _StoredReservation(
                reserved_cost_usd=reserved_cost_usd,
                status="active",
            )
            usage_with_reserve = self._usage_snapshot(period_key)
            return _reservation_from_usage(
                usage=usage_with_reserve,
                reservation_key=reservation_key,
                reserved_cost_usd=reserved_cost_usd,
                monthly_budget_usd=monthly_budget_usd,
                accepted=True,
            )

    def reconcile(
        self,
        *,
        period_key: str,
        reservation_key: str,
        cost_usd: float,
        tokens: int,
        provider_total_tokens: int | None,
        provider_thought_tokens: int | None,
        fallback_used: bool,
        truncated: bool,
        chargeable: bool,
    ) -> MonthlyUsage:
        with self._lock:
            reservation = self._reservations.get((period_key, reservation_key))
            if reservation is None:
                raise CostGuardrailStorageError(
                    f"Reservation not found for period_key={period_key}, reservation_key={reservation_key}."
                )
            if reservation.status != "active":
                return self._usage_snapshot(period_key)

            usage = self._usage_snapshot(period_key)
            if chargeable:
                usage.total_cost_usd += _non_negative_float(cost_usd)
                usage.total_tokens += _non_negative_int(tokens)
                usage.request_count += 1
                if provider_total_tokens is not None:
                    usage.provider_reported_tokens += _non_negative_int(provider_total_tokens)
                if provider_thought_tokens is not None:
                    usage.provider_reported_thought_tokens += _non_negative_int(provider_thought_tokens)
                if fallback_used:
                    usage.fallback_count += 1
                if truncated:
                    usage.truncated_count += 1
                self._store[period_key] = usage
                reservation.status = "reconciled"
            else:
                reservation.status = "released"
            return self._usage_snapshot(period_key)

    def _usage_snapshot(self, period_key: str) -> MonthlyUsage:
        usage = self._store.get(period_key)
        if usage is None:
            usage = MonthlyUsage(period_key=period_key)
            self._store[period_key] = usage
        active_reserved_cost_usd = sum(
            reservation.reserved_cost_usd
            for (reservation_period_key, _reservation_key), reservation in self._reservations.items()
            if reservation_period_key == period_key and reservation.status == "active"
        )
        snapshot = _copy_usage(usage)
        snapshot.active_reserved_cost_usd = active_reserved_cost_usd
        return snapshot


@dataclass
class _StoredReservation:
    reserved_cost_usd: float
    status: str


@dataclass(slots=True)
class PostgresMonthlyUsageStorage:
    database_url: str
    usage_table_name: str = "monthly_usage"
    reservation_table_name: str = "monthly_usage_reservations"

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise CostGuardrailStorageError("DATABASE_URL is required for postgres cost guardrail backend.")
        self.usage_table_name = _sanitize_table_name(self.usage_table_name, fallback="monthly_usage")
        self.reservation_table_name = _sanitize_table_name(
            self.reservation_table_name,
            fallback="monthly_usage_reservations",
        )

    def get(self, period_key: str) -> MonthlyUsage:
        connect = _load_connect()
        database_error = _load_database_error()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                return self._get_usage(conn, period_key)
        except database_error as error:
            raise CostGuardrailStorageError(
                f"Failed to load monthly usage from postgres for period_key={period_key}: {error}"
            ) from error

    def put(self, usage: MonthlyUsage) -> None:
        connect = _load_connect()
        database_error = _load_database_error()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_tables(conn)
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.usage_table_name} "
                            "(period_key,confirmed_cost_usd,total_tokens,request_count,provider_reported_tokens,"
                            "provider_reported_thought_tokens,fallback_count,truncated_count,updated_at) "
                            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW()) "
                            "ON CONFLICT (period_key) DO UPDATE SET "
                            "confirmed_cost_usd=EXCLUDED.confirmed_cost_usd,"
                            "total_tokens=EXCLUDED.total_tokens,"
                            "request_count=EXCLUDED.request_count,"
                            "provider_reported_tokens=EXCLUDED.provider_reported_tokens,"
                            "provider_reported_thought_tokens=EXCLUDED.provider_reported_thought_tokens,"
                            "fallback_count=EXCLUDED.fallback_count,"
                            "truncated_count=EXCLUDED.truncated_count,"
                            "updated_at=NOW()"
                        ),
                        (
                            usage.period_key,
                            _non_negative_float(usage.total_cost_usd),
                            _non_negative_int(usage.total_tokens),
                            _non_negative_int(usage.request_count),
                            _non_negative_int(usage.provider_reported_tokens),
                            _non_negative_int(usage.provider_reported_thought_tokens),
                            _non_negative_int(usage.fallback_count),
                            _non_negative_int(usage.truncated_count),
                        ),
                    )
        except database_error as error:
            raise CostGuardrailStorageError(
                f"Failed to save monthly usage to postgres for period_key={usage.period_key}: {error}"
            ) from error

    def reserve(
        self,
        *,
        period_key: str,
        reservation_key: str,
        projected_cost_usd: float,
        monthly_budget_usd: float,
    ) -> CostReservation:
        reserved_cost_usd = _non_negative_float(projected_cost_usd)
        connect = _load_connect()
        database_error = _load_database_error()
        try:
            with connect(self.database_url) as conn:
                self._ensure_tables(conn)
                self._ensure_usage_row(conn, period_key)
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"SELECT confirmed_cost_usd FROM {self.usage_table_name} WHERE period_key = %s FOR UPDATE",
                        (period_key,),
                    )
                    cursor.execute(
                        (
                            f"SELECT reserved_cost_usd,status FROM {self.reservation_table_name} "
                            "WHERE period_key = %s AND reservation_key = %s"
                        ),
                        (period_key, reservation_key),
                    )
                    existing = cursor.fetchone()
                    if existing is not None:
                        conn.commit()
                        usage = self.get(period_key)
                        return _reservation_from_usage(
                            usage=usage,
                            reservation_key=reservation_key,
                            reserved_cost_usd=float(existing[0]),
                            monthly_budget_usd=monthly_budget_usd,
                            accepted=str(existing[1]) == "active",
                        )

                    usage = self._get_usage(conn, period_key)
                    projected_total = usage.total_cost_usd + usage.active_reserved_cost_usd + reserved_cost_usd
                    if projected_total > monthly_budget_usd:
                        conn.commit()
                        decision = _decision_from_projected_total(
                            projected_total_cost_usd=projected_total,
                            monthly_budget_usd=monthly_budget_usd,
                            period_key=period_key,
                            warn_ratio=1.0,
                            degrade_ratio=1.0,
                            fallback_ratio=1.0,
                        )
                        return CostReservation(
                            decision=decision,
                            reservation_key=reservation_key,
                            reserved_cost_usd=0.0,
                            accepted=False,
                        )

                    cursor.execute(
                        (
                            f"INSERT INTO {self.reservation_table_name} "
                            "(period_key,reservation_key,reserved_cost_usd,status,created_at,updated_at) "
                            "VALUES (%s,%s,%s,'active',NOW(),NOW())"
                        ),
                        (period_key, reservation_key, reserved_cost_usd),
                    )
                conn.commit()
                usage_with_reserve = self.get(period_key)
                return _reservation_from_usage(
                    usage=usage_with_reserve,
                    reservation_key=reservation_key,
                    reserved_cost_usd=reserved_cost_usd,
                    monthly_budget_usd=monthly_budget_usd,
                    accepted=True,
                )
        except database_error as error:
            raise CostGuardrailStorageError(
                "Failed to reserve monthly usage in postgres: "
                f"period_key={period_key}, reservation_key={reservation_key}, projected_cost_usd={projected_cost_usd}: {error}"
            ) from error

    def reconcile(
        self,
        *,
        period_key: str,
        reservation_key: str,
        cost_usd: float,
        tokens: int,
        provider_total_tokens: int | None,
        provider_thought_tokens: int | None,
        fallback_used: bool,
        truncated: bool,
        chargeable: bool,
    ) -> MonthlyUsage:
        connect = _load_connect()
        database_error = _load_database_error()
        try:
            with connect(self.database_url) as conn:
                self._ensure_tables(conn)
                self._ensure_usage_row(conn, period_key)
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"SELECT confirmed_cost_usd FROM {self.usage_table_name} WHERE period_key = %s FOR UPDATE",
                        (period_key,),
                    )
                    cursor.execute(
                        (
                            f"SELECT status FROM {self.reservation_table_name} "
                            "WHERE period_key = %s AND reservation_key = %s FOR UPDATE"
                        ),
                        (period_key, reservation_key),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        raise CostGuardrailStorageError(
                            f"Reservation not found for period_key={period_key}, reservation_key={reservation_key}."
                        )
                    if str(row[0]) != "active":
                        conn.commit()
                        return self.get(period_key)

                    confirmed_cost_usd = _non_negative_float(cost_usd)
                    confirmed_tokens = _non_negative_int(tokens)
                    status = "reconciled" if chargeable else "released"
                    cursor.execute(
                        (
                            f"UPDATE {self.reservation_table_name} "
                            "SET status=%s,confirmed_cost_usd=%s,confirmed_tokens=%s,updated_at=NOW() "
                            "WHERE period_key = %s AND reservation_key = %s"
                        ),
                        (status, confirmed_cost_usd if chargeable else 0.0, confirmed_tokens if chargeable else 0, period_key, reservation_key),
                    )
                    if chargeable:
                        cursor.execute(
                            (
                                f"UPDATE {self.usage_table_name} SET "
                                "confirmed_cost_usd=confirmed_cost_usd + %s,"
                                "total_tokens=total_tokens + %s,"
                                "request_count=request_count + 1,"
                                "provider_reported_tokens=provider_reported_tokens + %s,"
                                "provider_reported_thought_tokens=provider_reported_thought_tokens + %s,"
                                "fallback_count=fallback_count + %s,"
                                "truncated_count=truncated_count + %s,"
                                "updated_at=NOW() "
                                "WHERE period_key = %s"
                            ),
                            (
                                confirmed_cost_usd,
                                confirmed_tokens,
                                _non_negative_int(provider_total_tokens or 0),
                                _non_negative_int(provider_thought_tokens or 0),
                                1 if fallback_used else 0,
                                1 if truncated else 0,
                                period_key,
                            ),
                        )
                conn.commit()
                return self.get(period_key)
        except CostGuardrailStorageError:
            raise
        except database_error as error:
            raise CostGuardrailStorageError(
                "Failed to reconcile monthly usage in postgres: "
                f"period_key={period_key}, reservation_key={reservation_key}, cost_usd={cost_usd}, tokens={tokens}: {error}"
            ) from error

    def _ensure_tables(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.usage_table_name} ("
                    "period_key TEXT PRIMARY KEY,"
                    "confirmed_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,"
                    "total_tokens BIGINT NOT NULL DEFAULT 0,"
                    "request_count BIGINT NOT NULL DEFAULT 0,"
                    "provider_reported_tokens BIGINT NOT NULL DEFAULT 0,"
                    "provider_reported_thought_tokens BIGINT NOT NULL DEFAULT 0,"
                    "fallback_count BIGINT NOT NULL DEFAULT 0,"
                    "truncated_count BIGINT NOT NULL DEFAULT 0,"
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"
                    ")"
                )
            )
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.reservation_table_name} ("
                    "period_key TEXT NOT NULL,"
                    "reservation_key TEXT NOT NULL,"
                    "reserved_cost_usd DOUBLE PRECISION NOT NULL,"
                    "status TEXT NOT NULL,"
                    "confirmed_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,"
                    "confirmed_tokens BIGINT NOT NULL DEFAULT 0,"
                    "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
                    "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
                    "PRIMARY KEY (period_key,reservation_key)"
                    ")"
                )
            )

    def _ensure_usage_row(self, conn: object, period_key: str) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                f"INSERT INTO {self.usage_table_name} (period_key,updated_at) VALUES (%s,NOW()) ON CONFLICT DO NOTHING",
                (period_key,),
            )

    def _get_usage(self, conn: object, period_key: str) -> MonthlyUsage:
        self._ensure_usage_row(conn, period_key)
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"SELECT confirmed_cost_usd,total_tokens,request_count,provider_reported_tokens,"
                    "provider_reported_thought_tokens,fallback_count,truncated_count "
                    f"FROM {self.usage_table_name} WHERE period_key = %s"
                ),
                (period_key,),
            )
            row = cursor.fetchone()
            if row is None:
                raise CostGuardrailStorageError(f"Monthly usage row missing for period_key={period_key}.")
            cursor.execute(
                (
                    f"SELECT COALESCE(SUM(reserved_cost_usd),0) FROM {self.reservation_table_name} "
                    "WHERE period_key = %s AND status = 'active'"
                ),
                (period_key,),
            )
            active_row = cursor.fetchone()
        return MonthlyUsage(
            period_key=period_key,
            total_cost_usd=float(row[0]),
            active_reserved_cost_usd=float(active_row[0]) if active_row is not None else 0.0,
            total_tokens=int(row[1]),
            request_count=int(row[2]),
            provider_reported_tokens=int(row[3]),
            provider_reported_thought_tokens=int(row[4]),
            fallback_count=int(row[5]),
            truncated_count=int(row[6]),
        )


class CostGuardrailService:
    def __init__(
        self,
        storage: MonthlyUsageStorage,
        *,
        monthly_budget_usd: float,
        warn_ratio: float = 0.70,
        degrade_ratio: float = 0.85,
        fallback_ratio: float = 1.00,
    ) -> None:
        self.storage = storage
        self.monthly_budget_usd = max(0.0001, monthly_budget_usd)
        self.warn_ratio = warn_ratio
        self.degrade_ratio = degrade_ratio
        self.fallback_ratio = fallback_ratio

    def _period_key(self, now: datetime | None = None) -> str:
        now = now or datetime.now(timezone.utc)
        return f"{now.year:04d}-{now.month:02d}"

    def evaluate(self, projected_cost_usd: float, *, now: datetime | None = None) -> CostGuardrailDecision:
        period_key = self._period_key(now)
        usage = self.storage.get(period_key)
        projected_total = (
            usage.total_cost_usd + usage.active_reserved_cost_usd + _non_negative_float(projected_cost_usd)
        )
        return _decision_from_projected_total(
            projected_total_cost_usd=projected_total,
            monthly_budget_usd=self.monthly_budget_usd,
            period_key=period_key,
            warn_ratio=self.warn_ratio,
            degrade_ratio=self.degrade_ratio,
            fallback_ratio=self.fallback_ratio,
        )

    def record(
        self,
        *,
        cost_usd: float,
        tokens: int,
        now: datetime | None = None,
        provider_total_tokens: int | None = None,
        provider_thought_tokens: int | None = None,
        fallback_used: bool = False,
        truncated: bool = False,
    ) -> MonthlyUsage:
        period_key = self._period_key(now)
        usage = self.storage.get(period_key)
        usage.total_cost_usd += _non_negative_float(cost_usd)
        usage.total_tokens += _non_negative_int(tokens)
        usage.request_count += 1
        if provider_total_tokens is not None:
            usage.provider_reported_tokens += _non_negative_int(provider_total_tokens)
        if provider_thought_tokens is not None:
            usage.provider_reported_thought_tokens += _non_negative_int(provider_thought_tokens)
        if fallback_used:
            usage.fallback_count += 1
        if truncated:
            usage.truncated_count += 1
        self.storage.put(usage)
        return usage

    def reserve(
        self,
        *,
        reservation_key: str,
        projected_cost_usd: float,
        now: datetime | None = None,
    ) -> CostReservation:
        period_key = self._period_key(now)
        reservation = self.storage.reserve(
            period_key=period_key,
            reservation_key=reservation_key,
            projected_cost_usd=projected_cost_usd,
            monthly_budget_usd=self.monthly_budget_usd,
        )
        if not reservation.accepted:
            fallback_projected_total_cost_usd: float = self.monthly_budget_usd * max(self.fallback_ratio, 0.0)
            rejected_projected_total_cost_usd: float = max(
                reservation.decision.projected_total_cost_usd,
                self.monthly_budget_usd,
                fallback_projected_total_cost_usd,
            )
            rejected_decision = _decision_from_projected_total(
                projected_total_cost_usd=rejected_projected_total_cost_usd,
                monthly_budget_usd=self.monthly_budget_usd,
                period_key=period_key,
                warn_ratio=self.warn_ratio,
                degrade_ratio=self.degrade_ratio,
                fallback_ratio=self.fallback_ratio,
            )
            return CostReservation(
                decision=rejected_decision,
                reservation_key=reservation.reservation_key,
                reserved_cost_usd=reservation.reserved_cost_usd,
                accepted=False,
            )
        decision = _decision_from_projected_total(
            projected_total_cost_usd=reservation.decision.projected_total_cost_usd,
            monthly_budget_usd=self.monthly_budget_usd,
            period_key=period_key,
            warn_ratio=self.warn_ratio,
            degrade_ratio=self.degrade_ratio,
            fallback_ratio=self.fallback_ratio,
        )
        return CostReservation(
            decision=decision,
            reservation_key=reservation.reservation_key,
            reserved_cost_usd=reservation.reserved_cost_usd,
            accepted=reservation.accepted,
        )

    def reconcile(
        self,
        *,
        reservation_key: str,
        cost_usd: float,
        tokens: int,
        now: datetime | None = None,
        provider_total_tokens: int | None = None,
        provider_thought_tokens: int | None = None,
        fallback_used: bool = False,
        truncated: bool = False,
        chargeable: bool = True,
    ) -> MonthlyUsage:
        period_key = self._period_key(now)
        return self.storage.reconcile(
            period_key=period_key,
            reservation_key=reservation_key,
            cost_usd=cost_usd,
            tokens=tokens,
            provider_total_tokens=provider_total_tokens,
            provider_thought_tokens=provider_thought_tokens,
            fallback_used=fallback_used,
            truncated=truncated,
            chargeable=chargeable,
        )


def _copy_usage(usage: MonthlyUsage) -> MonthlyUsage:
    return MonthlyUsage(
        period_key=usage.period_key,
        total_cost_usd=usage.total_cost_usd,
        active_reserved_cost_usd=usage.active_reserved_cost_usd,
        total_tokens=usage.total_tokens,
        request_count=usage.request_count,
        provider_reported_tokens=usage.provider_reported_tokens,
        provider_reported_thought_tokens=usage.provider_reported_thought_tokens,
        fallback_count=usage.fallback_count,
        truncated_count=usage.truncated_count,
    )


def _reservation_from_usage(
    *,
    usage: MonthlyUsage,
    reservation_key: str,
    reserved_cost_usd: float,
    monthly_budget_usd: float,
    accepted: bool,
) -> CostReservation:
    projected_total = usage.total_cost_usd + usage.active_reserved_cost_usd
    decision = _decision_from_projected_total(
        projected_total_cost_usd=projected_total,
        monthly_budget_usd=monthly_budget_usd,
        period_key=usage.period_key,
        warn_ratio=0.70,
        degrade_ratio=0.85,
        fallback_ratio=1.00,
    )
    return CostReservation(
        decision=decision,
        reservation_key=reservation_key,
        reserved_cost_usd=reserved_cost_usd,
        accepted=accepted,
    )


def _decision_from_projected_total(
    *,
    projected_total_cost_usd: float,
    monthly_budget_usd: float,
    period_key: str,
    warn_ratio: float,
    degrade_ratio: float,
    fallback_ratio: float,
) -> CostGuardrailDecision:
    budget = max(0.0001, monthly_budget_usd)
    ratio = projected_total_cost_usd / budget
    if ratio >= fallback_ratio:
        action = CostGuardrailAction.FALLBACK
    elif ratio >= degrade_ratio:
        action = CostGuardrailAction.DEGRADE
    elif ratio >= warn_ratio:
        action = CostGuardrailAction.WARN
    else:
        action = CostGuardrailAction.NORMAL
    return CostGuardrailDecision(
        action=action,
        ratio=ratio,
        projected_total_cost_usd=projected_total_cost_usd,
        period_key=period_key,
    )


def _non_negative_float(value: float) -> float:
    return max(0.0, value)


def _non_negative_int(value: int) -> int:
    return max(0, value)


def _sanitize_table_name(raw: str, *, fallback: str) -> str:
    candidate = raw.strip() or fallback
    first_character = candidate[0]
    if not ("A" <= first_character <= "Z" or "a" <= first_character <= "z" or first_character == "_"):
        return fallback
    for character in candidate:
        if "A" <= character <= "Z" or "a" <= character <= "z" or "0" <= character <= "9" or character == "_":
            continue
        return fallback
    return candidate


def _load_connect():
    try:
        from psycopg import connect  # type: ignore
    except ImportError as error:
        raise CostGuardrailStorageError(
            "psycopg is required for postgres cost guardrail backend. Install backend/requirements.txt."
        ) from error
    return connect


def _load_database_error():
    try:
        from psycopg import Error  # type: ignore
    except ImportError as error:
        raise CostGuardrailStorageError(
            "psycopg is required for postgres cost guardrail backend. Install backend/requirements.txt."
        ) from error
    return Error
