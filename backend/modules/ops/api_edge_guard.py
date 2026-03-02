from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock
from typing import Deque

from fastapi import HTTPException, Request


DEFAULT_CORS_ORIGINS = (
    "https://foodlens-2-w1xu.onrender.com",
    "http://localhost:8081",
    "http://localhost:3000",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:3000",
)
DEFAULT_CORS_ORIGIN_REGEX = (
    r"^https?://(localhost|127\.0\.0\.1|10\..+|192\.168\..+|172\.(1[6-9]|2\d|3[0-1])\..+)(:\d+)?$"
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
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int


def _parse_csv(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def build_cors_config_from_env() -> AnalysisCorsConfig:
    allow_origins = _parse_csv(os.environ.get("ANALYSIS_CORS_ALLOWED_ORIGINS"))
    if not allow_origins:
        allow_origins = list(DEFAULT_CORS_ORIGINS)

    allow_origin_regex = (os.environ.get("ANALYSIS_CORS_ALLOW_ORIGIN_REGEX") or "").strip()
    if not allow_origin_regex:
        allow_origin_regex = DEFAULT_CORS_ORIGIN_REGEX

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
    return RateLimitSettings(
        enabled=enabled,
        window_seconds=window_seconds,
        endpoint_limits_per_minute={
            "/analyze": analyze_limit,
            "/analyze/label": label_limit,
            "/analyze/smart": smart_limit,
            "/lookup/barcode": barcode_limit,
        },
    )


def extract_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first
    if request.client and request.client.host:
        return request.client.host
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
