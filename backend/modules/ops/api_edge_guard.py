from __future__ import annotations

import os
import time
from ipaddress import ip_address
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from typing import Deque

from fastapi import HTTPException, Request


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
    window_seconds = _env_int("AUTH_RATE_LIMIT_WINDOW_SECONDS", 60)
    login_limit = _env_int("AUTH_RATE_LIMIT_LOGIN_PER_MIN", 5)
    signup_limit = _env_int("AUTH_RATE_LIMIT_SIGNUP_PER_MIN", 3)
    verification_request_limit = _env_int("AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN", 3)
    password_reset_request_limit = _env_int("AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN", 3)
    return AuthRateLimitSettings(
        enabled=enabled,
        window_seconds=window_seconds,
        endpoint_limits_per_minute={
            "/auth/email/login": login_limit,
            "/auth/email/signup": signup_limit,
            "/auth/email/verification/request": verification_request_limit,
            "/auth/email/password/reset/request": password_reset_request_limit,
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

            retry_after_seconds = max(1, int(bucket[0] + self._window_seconds - current_ts))
            return RateLimitDecision(allowed=False, retry_after_seconds=retry_after_seconds)


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
