from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Awaitable, Callable
from uuid import uuid4

from fastapi import HTTPException

try:
    import sentry_sdk
except Exception:  # pragma: no cover - sentry is optional in local/dev contexts
    sentry_sdk = None


logger = logging.getLogger("foodlens.runtime")


class ErrorCode(StrEnum):
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"
    IMAGE_DECODE_FAILED = "IMAGE_DECODE_FAILED"
    ANALYZE_FAILED = "ANALYZE_FAILED"
    ANALYZE_LABEL_FAILED = "ANALYZE_LABEL_FAILED"
    ANALYZE_SMART_FAILED = "ANALYZE_SMART_FAILED"
    BARCODE_LOOKUP_FAILED = "BARCODE_LOOKUP_FAILED"


@dataclass(frozen=True)
class EndpointErrorPolicy:
    code: ErrorCode
    status_code: int = 500
    user_message: str = "Internal server error"


def new_request_id() -> str:
    return uuid4().hex[:12]


def log_exception(
    endpoint: str,
    request_id: str,
    error: Exception,
    code: ErrorCode,
    *,
    user_id: str | None = None,
) -> None:
    logger.exception(
        "endpoint=%s request_id=%s code=%s user_id=%s error=%s",
        endpoint,
        request_id,
        code,
        user_id or "unknown",
        error,
    )
    if sentry_sdk is not None:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("endpoint", endpoint)
            scope.set_tag("error_code", str(code))
            scope.set_extra("request_id", request_id)
            if user_id:
                scope.set_user({"id": user_id})
            sentry_sdk.capture_exception(error)


def raise_service_unavailable(service_name: str) -> HTTPException:
    return HTTPException(status_code=503, detail=f"Service unavailable: {service_name}")


def to_http_exception(
    endpoint: str,
    request_id: str,
    error: Exception,
    policy: EndpointErrorPolicy,
    *,
    user_id: str | None = None,
) -> HTTPException:
    log_exception(
        endpoint=endpoint,
        request_id=request_id,
        error=error,
        code=policy.code,
        user_id=user_id,
    )
    return HTTPException(
        status_code=policy.status_code,
        detail=f"{policy.user_message} (code={policy.code}, request_id={request_id})",
    )


async def run_in_threadpool(func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
    return await asyncio.to_thread(func, *args, **kwargs)


async def run_with_error_policy(
    endpoint: str,
    policy: EndpointErrorPolicy,
    operation: Callable[[], Awaitable[Any]],
    *,
    request_id: str | None = None,
    user_id: str | None = None,
) -> Any:
    resolved_request_id = request_id or new_request_id()
    try:
        return await operation()
    except HTTPException:
        raise
    except Exception as error:
        raise to_http_exception(
            endpoint,
            resolved_request_id,
            error,
            policy,
            user_id=user_id,
        ) from error
