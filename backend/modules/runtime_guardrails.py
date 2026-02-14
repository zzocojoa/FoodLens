from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Awaitable, Callable
from uuid import uuid4

from fastapi import HTTPException


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


def log_exception(endpoint: str, request_id: str, error: Exception, code: ErrorCode) -> None:
    logger.exception(
        "endpoint=%s request_id=%s code=%s error=%s",
        endpoint,
        request_id,
        code,
        error,
    )


def raise_service_unavailable(service_name: str) -> HTTPException:
    return HTTPException(status_code=503, detail=f"Service unavailable: {service_name}")


def to_http_exception(
    endpoint: str,
    request_id: str,
    error: Exception,
    policy: EndpointErrorPolicy,
) -> HTTPException:
    log_exception(endpoint=endpoint, request_id=request_id, error=error, code=policy.code)
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
) -> Any:
    request_id = new_request_id()
    try:
        return await operation()
    except HTTPException:
        raise
    except Exception as error:
        raise to_http_exception(endpoint, request_id, error, policy) from error
