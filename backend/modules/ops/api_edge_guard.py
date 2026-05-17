from __future__ import annotations

import math
import os
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from ipaddress import ip_address
from threading import Lock
from typing import Deque, TypeAlias

from fastapi import HTTPException, Request

_POSTGRES_IDENTIFIER_MAX_LENGTH = 63
_AUTH_RATE_LIMIT_SUBJECT_INDEX_SUFFIX = "_endpoint_subject_ts_idx"
_AUTH_RATE_LIMIT_TABLE_MAX_LENGTH = _POSTGRES_IDENTIFIER_MAX_LENGTH - len(
    _AUTH_RATE_LIMIT_SUBJECT_INDEX_SUFFIX
)
_AUTH_RATE_LIMIT_SUBJECT_DIGEST_PATTERN: re.Pattern[str] = re.compile(r"^[0-9a-f]{64}$")
_AUTH_RATE_LIMIT_PERSISTED_SUBJECT_SCOPES: frozenset[str] = frozenset(
    {"ip", "email", "device"}
)


@dataclass(frozen=True)
class AnalysisCorsConfig:
    allow_origins: list[str]
    allow_origin_regex: str | None


@dataclass(frozen=True)
class RateLimitSettings:
    enabled: bool
    window_seconds: int
    endpoint_limits_per_minute: dict[str, int]


@dataclass(frozen=True)
class AuthRateLimitSettings:
    enabled: bool
    backend: str
    table_name: str
    window_seconds: int
    endpoint_limits_per_minute: dict[str, int]


@dataclass(frozen=True)
class InflightAdmissionSettings:
    enabled: bool
    retry_after_seconds: int
    endpoint_max_inflight: dict[str, int]


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int


class RateLimitStorageError(Exception):
    pass


RateLimitSubject: TypeAlias = tuple[str, str]
RateLimitSubjects: TypeAlias = tuple[RateLimitSubject, ...]
BlockedRateLimitDecision: TypeAlias = tuple[str, RateLimitDecision]


def _unique_rate_limit_subjects(*, subjects: RateLimitSubjects) -> RateLimitSubjects:
    unique_subjects: list[RateLimitSubject] = []
    seen_subjects: set[str] = set()
    for scope, subject in subjects:
        if subject in seen_subjects:
            continue
        seen_subjects.add(subject)
        unique_subjects.append((scope, subject))
    return tuple(unique_subjects)


def _validate_auth_rate_limit_subject(*, subject: str) -> None:
    subject_scope, separator, digest = subject.partition(":")
    if separator != ":":
        raise RateLimitStorageError(
            "Invalid auth rate limit subject: expected scoped SHA-256 digest."
        )
    if subject_scope not in _AUTH_RATE_LIMIT_PERSISTED_SUBJECT_SCOPES:
        raise RateLimitStorageError(
            "Invalid auth rate limit subject: persisted scope must be ip, email, or device."
        )
    if _AUTH_RATE_LIMIT_SUBJECT_DIGEST_PATTERN.fullmatch(digest) is None:
        raise RateLimitStorageError(
            "Invalid auth rate limit subject: digest must be 64 lowercase hex characters."
        )


def _validate_auth_rate_limit_subjects(*, subjects: RateLimitSubjects) -> None:
    for _scope, subject in subjects:
        _validate_auth_rate_limit_subject(subject=subject)


def _retry_after_seconds(*, oldest_ts: float, window_seconds: int, current_ts: float) -> int:
    return max(1, int(math.ceil(oldest_ts + window_seconds - current_ts)))


def _parse_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _default_public_origins() -> list[str]:
    origins: list[str] = []
    for key in ("AUTH_PUBLIC_BASE_URL", "MEDIA_PUBLIC_BASE_URL"):
        candidate = (os.environ.get(key) or "").strip().rstrip("/")
        if candidate and candidate not in origins:
            origins.append(candidate)
    return origins


def build_cors_config_from_env() -> AnalysisCorsConfig:
    allow_origins = _parse_csv(os.environ.get("ANALYSIS_CORS_ALLOWED_ORIGINS"))
    if not allow_origins:
        allow_origins = _default_public_origins()

    allow_origin_regex = (os.environ.get("ANALYSIS_CORS_ALLOW_ORIGIN_REGEX") or "").strip()
    if not allow_origin_regex:
        allow_origin_regex = None

    return AnalysisCorsConfig(
        allow_origins=allow_origins,
        allow_origin_regex=allow_origin_regex,
    )


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return parsed if parsed > 0 else default


def _auth_rate_limit_backend() -> str:
    raw_backend = (os.environ.get("AUTH_RATE_LIMIT_BACKEND") or "auto").strip().lower()
    if raw_backend not in {"auto", "memory", "postgres"}:
        raise RateLimitStorageError(
            "AUTH_RATE_LIMIT_BACKEND must be one of: auto, memory, postgres."
        )
    if raw_backend == "auto":
        return "postgres" if (os.environ.get("DATABASE_URL") or "").strip() else "memory"
    return raw_backend


def _sanitize_identifier_name(raw: str, *, fallback: str, max_length: int) -> str:
    candidate = (raw or "").strip() or fallback
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
        raise RateLimitStorageError(f"Invalid rate limit identifier: {candidate}")
    if len(candidate) > max_length:
        raise RateLimitStorageError(
            "Invalid rate limit identifier: "
            f"{candidate} exceeds {max_length} characters."
        )
    return candidate


def _sanitize_table_name(raw: str, *, fallback: str) -> str:
    return _sanitize_identifier_name(
        raw,
        fallback=fallback,
        max_length=_AUTH_RATE_LIMIT_TABLE_MAX_LENGTH,
    )


def _sanitize_index_name(raw: str, *, fallback: str) -> str:
    return _sanitize_identifier_name(
        raw,
        fallback=fallback,
        max_length=_POSTGRES_IDENTIFIER_MAX_LENGTH,
    )


def build_rate_limit_settings_from_env() -> RateLimitSettings:
    enabled = (os.environ.get("ANALYSIS_RATE_LIMIT_ENABLED", "1").strip() != "0")
    window_seconds = _env_int("ANALYSIS_RATE_LIMIT_WINDOW_SECONDS", 60)
    analyze_limit = _env_int("ANALYSIS_RATE_LIMIT_ANALYZE_PER_MIN", 15)
    label_limit = _env_int("ANALYSIS_RATE_LIMIT_LABEL_PER_MIN", 15)
    smart_limit = _env_int("ANALYSIS_RATE_LIMIT_SMART_PER_MIN", analyze_limit)
    barcode_limit = _env_int("ANALYSIS_RATE_LIMIT_BARCODE_PER_MIN", 30)
    jobs_limit = _env_int("ANALYSIS_RATE_LIMIT_JOBS_PER_MIN", analyze_limit)
    job_status_limit = _env_int("ANALYSIS_RATE_LIMIT_JOB_STATUS_PER_MIN", max(jobs_limit * 4, 60))
    return RateLimitSettings(
        enabled=enabled,
        window_seconds=window_seconds,
        endpoint_limits_per_minute={
            "/analyze": analyze_limit,
            "/analyze/label": label_limit,
            "/analyze/smart": smart_limit,
            "/analyze/jobs": jobs_limit,
            "/analyze/jobs/status": job_status_limit,
            "/lookup/barcode": barcode_limit,
        },
    )


def build_auth_rate_limit_settings_from_env() -> AuthRateLimitSettings:
    enabled = (os.environ.get("AUTH_RATE_LIMIT_ENABLED", "1").strip() != "0")
    if enabled:
        backend = _auth_rate_limit_backend()
        table_name = _sanitize_table_name(
            os.environ.get("AUTH_RATE_LIMIT_TABLE", ""),
            fallback="auth_rate_limit_events",
        )
    else:
        backend = "memory"
        table_name = "auth_rate_limit_events"
    window_seconds = _env_int("AUTH_RATE_LIMIT_WINDOW_SECONDS", 60)
    login_limit = _env_int("AUTH_RATE_LIMIT_LOGIN_PER_MIN", 5)
    signup_limit = _env_int("AUTH_RATE_LIMIT_SIGNUP_PER_MIN", 3)
    verification_request_limit = _env_int("AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN", 3)
    password_reset_request_limit = _env_int("AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN", 3)
    oauth_login_limit = _env_int("AUTH_RATE_LIMIT_OAUTH_LOGIN_PER_MIN", 10)
    oauth_start_limit = _env_int("AUTH_RATE_LIMIT_OAUTH_START_PER_MIN", 30)
    oauth_callback_limit = _env_int("AUTH_RATE_LIMIT_OAUTH_CALLBACK_PER_MIN", 30)
    return AuthRateLimitSettings(
        enabled=enabled,
        backend=backend,
        table_name=table_name,
        window_seconds=window_seconds,
        endpoint_limits_per_minute={
            "/auth/email/login": login_limit,
            "/auth/email/signup": signup_limit,
            "/auth/email/verification/request": verification_request_limit,
            "/auth/email/password/reset/request": password_reset_request_limit,
            "/auth/google": oauth_login_limit,
            "/auth/kakao": oauth_login_limit,
            "/auth/google/start": oauth_start_limit,
            "/auth/kakao/start": oauth_start_limit,
            "/auth/google/callback": oauth_callback_limit,
            "/auth/kakao/callback": oauth_callback_limit,
        },
    )


def build_inflight_admission_settings_from_env() -> InflightAdmissionSettings:
    enabled = (os.environ.get("ANALYSIS_INFLIGHT_GUARD_ENABLED", "1").strip() != "0")
    retry_after_seconds = _env_int("ANALYSIS_INFLIGHT_RETRY_AFTER_SECONDS", 2)
    analyze_max = _env_int("ANALYSIS_INFLIGHT_MAX_ANALYZE", 3)
    label_max = _env_int("ANALYSIS_INFLIGHT_MAX_LABEL", 3)
    smart_max = _env_int("ANALYSIS_INFLIGHT_MAX_SMART", analyze_max)
    barcode_max = _env_int("ANALYSIS_INFLIGHT_MAX_BARCODE", 6)
    jobs_max = _env_int("ANALYSIS_INFLIGHT_MAX_JOBS", analyze_max)
    return InflightAdmissionSettings(
        enabled=enabled,
        retry_after_seconds=retry_after_seconds,
        endpoint_max_inflight={
            "/analyze": analyze_max,
            "/analyze/label": label_max,
            "/analyze/smart": smart_max,
            "/analyze/jobs": jobs_max,
            "/lookup/barcode": barcode_max,
        },
    )


def _normalize_ip(candidate: str | None) -> str | None:
    if not candidate:
        return None

    value = candidate.strip().strip('"').strip("'")
    if not value:
        return None

    if value.startswith("[") and "]" in value:
        value = value[1 : value.index("]")]
    elif value.count(":") == 1 and "." in value:
        value = value.split(":", 1)[0]

    try:
        return ip_address(value).compressed
    except ValueError:
        return None


def _select_client_ip(candidates: list[str]) -> str | None:
    fallback: str | None = None
    for candidate in candidates:
        normalized = _normalize_ip(candidate)
        if not normalized:
            continue
        if fallback is None:
            fallback = normalized
        parsed = ip_address(normalized)
        if parsed.is_global:
            return normalized
    return fallback


def _extract_forwarded_for_candidates(forwarded_header: str | None) -> list[str]:
    if not forwarded_header:
        return []
    candidates: list[str] = []
    for item in forwarded_header.split(","):
        for part in item.split(";"):
            token = part.strip()
            if token.lower().startswith("for="):
                candidates.append(token[4:].strip())
    return candidates


def extract_client_ip(request: Request) -> str:
    prioritized_headers = (
        "CF-Connecting-IP",
        "True-Client-IP",
        "Fly-Client-IP",
        "X-Real-IP",
    )
    for header_name in prioritized_headers:
        selected = _select_client_ip([request.headers.get(header_name) or ""])
        if selected:
            return selected

    x_forwarded_for = request.headers.get("X-Forwarded-For")
    selected_forwarded_for = _select_client_ip(x_forwarded_for.split(",") if x_forwarded_for else [])
    if selected_forwarded_for:
        return selected_forwarded_for

    selected_forwarded = _select_client_ip(
        _extract_forwarded_for_candidates(request.headers.get("Forwarded"))
    )
    if selected_forwarded:
        return selected_forwarded

    if request.client and request.client.host:
        selected_client_host = _select_client_ip([request.client.host])
        if selected_client_host:
            return selected_client_host
    return "unknown"


def build_rate_limit_subject(
    *,
    user_id: str | None,
    device_id: str | None,
    client_ip: str,
) -> str:
    if user_id:
        return f"user:{user_id}"
    if device_id:
        return f"device:{device_id}"
    return f"ip:{client_ip}"


class InMemorySlidingWindowRateLimiter:
    """
    Thread-safe sliding-window rate limiter.
    """

    def __init__(
        self,
        *,
        endpoint_limits_per_minute: dict[str, int],
        window_seconds: int = 60,
    ) -> None:
        self._endpoint_limits = dict(endpoint_limits_per_minute)
        self._window_seconds = max(1, int(window_seconds))
        self._events: dict[tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def evaluate(self, *, endpoint: str, subject: str, now: float | None = None) -> RateLimitDecision:
        limit = self._endpoint_limits.get(endpoint)
        if limit is None or limit <= 0:
            return RateLimitDecision(allowed=True, retry_after_seconds=0)

        current_ts = float(time.time() if now is None else now)
        cutoff = current_ts - self._window_seconds
        key = (endpoint, subject)

        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()

            if len(bucket) < limit:
                bucket.append(current_ts)
                return RateLimitDecision(allowed=True, retry_after_seconds=0)

            retry_after_seconds = _retry_after_seconds(
                oldest_ts=bucket[0],
                window_seconds=self._window_seconds,
                current_ts=current_ts,
            )
            return RateLimitDecision(allowed=False, retry_after_seconds=retry_after_seconds)

    def evaluate_many(
        self,
        *,
        endpoint: str,
        subjects: RateLimitSubjects,
        now: float | None,
    ) -> BlockedRateLimitDecision | None:
        limit = self._endpoint_limits.get(endpoint)
        if limit is None or limit <= 0 or not subjects:
            return None

        current_ts = float(time.time() if now is None else now)
        cutoff = current_ts - self._window_seconds
        unique_subjects = _unique_rate_limit_subjects(subjects=subjects)

        with self._lock:
            for scope, subject in unique_subjects:
                bucket = self._events[(endpoint, subject)]
                while bucket and bucket[0] <= cutoff:
                    bucket.popleft()
                if len(bucket) >= limit:
                    retry_after_seconds = _retry_after_seconds(
                        oldest_ts=bucket[0],
                        window_seconds=self._window_seconds,
                        current_ts=current_ts,
                    )
                    return scope, RateLimitDecision(
                        allowed=False,
                        retry_after_seconds=retry_after_seconds,
                    )

            for _scope, subject in unique_subjects:
                self._events[(endpoint, subject)].append(current_ts)
            return None


class PostgresSlidingWindowRateLimiter:
    """
    API 인스턴스가 공유하는 PostgreSQL 기반 sliding-window rate limiter.
    """

    def __init__(
        self,
        *,
        database_url: str,
        endpoint_limits_per_minute: dict[str, int],
        table_name: str,
        window_seconds: int,
    ) -> None:
        normalized_database_url = database_url.strip()
        if not normalized_database_url:
            raise RateLimitStorageError("DATABASE_URL is required for postgres auth rate limiting.")
        self._database_url = normalized_database_url
        self._endpoint_limits = dict(endpoint_limits_per_minute)
        self._table_name = _sanitize_table_name(table_name, fallback="auth_rate_limit_events")
        self._event_ts_index_name = _sanitize_index_name(
            f"{self._table_name}_event_ts_idx",
            fallback="auth_rate_limit_events_event_ts_idx",
        )
        self._subject_index_name = _sanitize_index_name(
            f"{self._table_name}{_AUTH_RATE_LIMIT_SUBJECT_INDEX_SUFFIX}",
            fallback="auth_rate_limit_events_endpoint_subject_ts_idx",
        )
        self._window_seconds = max(1, int(window_seconds))
        self._ensure_lock = Lock()
        self._table_ensured = False

    def evaluate(self, *, endpoint: str, subject: str, now: float | None = None) -> RateLimitDecision:
        blocked = self.evaluate_many(
            endpoint=endpoint,
            subjects=(("subject", subject),),
            now=now,
        )
        if blocked is None:
            return RateLimitDecision(allowed=True, retry_after_seconds=0)
        return blocked[1]

    def evaluate_many(
        self,
        *,
        endpoint: str,
        subjects: RateLimitSubjects,
        now: float | None,
    ) -> BlockedRateLimitDecision | None:
        limit = self._endpoint_limits.get(endpoint)
        if limit is None or limit <= 0 or not subjects:
            return None

        unique_subjects = _unique_rate_limit_subjects(subjects=subjects)
        _validate_auth_rate_limit_subjects(subjects=unique_subjects)
        current_ts = None if now is None else float(now)
        connect = _load_connect()
        database_error = _load_database_error()
        try:
            self._ensure_table(connect=connect)
            with connect(self._database_url) as conn:
                with conn.cursor() as cursor:
                    if current_ts is None:
                        cursor.execute("SELECT EXTRACT(EPOCH FROM clock_timestamp())")
                        clock_row = cursor.fetchone()
                        if clock_row is None or clock_row[0] is None:
                            raise RateLimitStorageError(
                                "Failed to read postgres clock for auth rate limiting."
                            )
                        current_ts = float(clock_row[0])
                    cutoff_ts = current_ts - self._window_seconds
                    for _scope, subject in sorted(unique_subjects, key=lambda item: item[1]):
                        cursor.execute(
                            "SELECT pg_advisory_xact_lock(hashtext(%s), hashtext(%s))",
                            (endpoint, subject),
                        )
                    cursor.execute(
                        f"DELETE FROM {self._table_name} WHERE event_ts <= to_timestamp(%s)",
                        (cutoff_ts,),
                    )
                    for scope, subject in unique_subjects:
                        cursor.execute(
                            (
                                f"SELECT COUNT(*), EXTRACT(EPOCH FROM MIN(event_ts)) "
                                f"FROM {self._table_name} "
                                "WHERE endpoint = %s AND subject = %s "
                                "AND event_ts > to_timestamp(%s)"
                            ),
                            (endpoint, subject, cutoff_ts),
                        )
                        row = cursor.fetchone()
                        event_count = int(row[0] or 0) if row is not None else 0
                        oldest_ts = float(row[1]) if row is not None and row[1] is not None else current_ts
                        if event_count < limit:
                            continue
                        retry_after_seconds = _retry_after_seconds(
                            oldest_ts=oldest_ts,
                            window_seconds=self._window_seconds,
                            current_ts=current_ts,
                        )
                        return scope, RateLimitDecision(
                            allowed=False,
                            retry_after_seconds=retry_after_seconds,
                        )
                    for _scope, subject in unique_subjects:
                        cursor.execute(
                            (
                                f"INSERT INTO {self._table_name} "
                                "(endpoint,subject,event_ts) VALUES (%s,%s,to_timestamp(%s))"
                            ),
                            (endpoint, subject, current_ts),
                        )
                    return None
        except database_error as error:
            raise RateLimitStorageError(
                f"Failed to evaluate postgres auth rate limit endpoint={endpoint}: {error}"
            ) from error

    def _ensure_table(self, *, connect) -> None:
        if self._table_ensured:
            return
        with self._ensure_lock:
            if self._table_ensured:
                return
            database_error = _load_database_error()
            try:
                with connect(self._database_url, autocommit=True) as conn:
                    with conn.cursor() as cursor:
                        cursor.execute(
                            (
                                f"CREATE TABLE IF NOT EXISTS {self._table_name} ("
                                "id BIGSERIAL PRIMARY KEY,"
                                "endpoint TEXT NOT NULL,"
                                "subject TEXT NOT NULL,"
                                "event_ts TIMESTAMPTZ NOT NULL"
                                ")"
                            )
                        )
                        cursor.execute(
                            (
                                f"CREATE INDEX IF NOT EXISTS {self._subject_index_name} "
                                f"ON {self._table_name} (endpoint, subject, event_ts)"
                            )
                        )
                        cursor.execute(
                            (
                                f"CREATE INDEX IF NOT EXISTS {self._event_ts_index_name} "
                                f"ON {self._table_name} (event_ts)"
                            )
                        )
                self._table_ensured = True
            except database_error as error:
                raise RateLimitStorageError(
                    f"Failed to initialize postgres auth rate limit table={self._table_name}: {error}"
                ) from error


class InMemoryEndpointAdmissionLimiter:
    """
    Thread-safe in-flight admission control.
    """

    def __init__(self, *, endpoint_max_inflight: dict[str, int]) -> None:
        self._endpoint_max_inflight = {
            endpoint: max(1, int(limit))
            for endpoint, limit in endpoint_max_inflight.items()
            if int(limit) > 0
        }
        self._inflight: dict[str, int] = defaultdict(int)
        self._lock = Lock()

    def try_acquire(self, *, endpoint: str) -> bool:
        limit = self._endpoint_max_inflight.get(endpoint)
        if limit is None:
            return True

        with self._lock:
            current = self._inflight[endpoint]
            if current >= limit:
                return False
            self._inflight[endpoint] = current + 1
            return True

    def release(self, *, endpoint: str) -> None:
        if endpoint not in self._endpoint_max_inflight:
            return

        with self._lock:
            current = self._inflight.get(endpoint, 0)
            if current <= 1:
                self._inflight.pop(endpoint, None)
                return
            self._inflight[endpoint] = current - 1

    def inflight_count(self, *, endpoint: str) -> int:
        with self._lock:
            return int(self._inflight.get(endpoint, 0))


def build_rate_limit_http_exception(
    *,
    request_id: str,
    retry_after_seconds: int,
    code: str = "API_RATE_LIMITED",
    message: str = "Too many requests. Please retry shortly.",
) -> HTTPException:
    retry_after_seconds = max(1, int(retry_after_seconds))
    return HTTPException(
        status_code=429,
        detail={
            "message": message,
            "code": code,
            "request_id": request_id,
            "retry_after_seconds": retry_after_seconds,
        },
        headers={"Retry-After": str(retry_after_seconds)},
    )


def _load_connect():
    try:
        from psycopg import connect  # type: ignore
    except ImportError as error:
        raise RateLimitStorageError(
            "psycopg is required for postgres auth rate limiting. Install backend/requirements.txt."
        ) from error
    return connect


def _load_database_error():
    try:
        from psycopg import Error  # type: ignore
    except ImportError as error:
        raise RateLimitStorageError(
            "psycopg is required for postgres auth rate limiting. Install backend/requirements.txt."
        ) from error
    return Error
