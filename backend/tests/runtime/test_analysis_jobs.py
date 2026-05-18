import asyncio
import io
import json
import os
import time
import unittest
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw
from starlette.requests import Request
from starlette.responses import Response

import backend.modules.analysis_jobs as analysis_jobs
from backend.modules.analyst_runtime.router import SmartRouter
from backend.modules.analysis_jobs import (
    AnalysisJobStoreError,
    AnalysisJobWorker,
    InMemoryAnalysisJobStore,
    InMemoryNutritionCacheStore,
    PostgresAnalysisJobStore,
    NutritionEnrichmentService,
    SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE,
    create_analysis_job_payload,
)
from backend.modules.ops.cost_guardrail import CostGuardrailService, InMemoryMonthlyUsageStorage
from backend.modules.ops.data_retention import AnalysisJobsSensitivePayloadRetentionConfig
from backend.modules.ops.data_retention import CleanupJobResult
from backend.modules.ops.data_retention import RetentionDataClass
from backend.modules.ops.api_edge_guard import InMemorySlidingWindowRateLimiter
from backend.modules.ops.api_edge_guard import RateLimitStorageError
from backend.modules.ops.rollout_control import KpiThresholds
from backend.modules.server_bootstrap import decode_upload_to_image


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["ANALYSIS_JOB_BACKEND"] = "memory"
os.environ["ANALYSIS_NUTRITION_CACHE_BACKEND"] = "memory"
import backend.server as server  # noqa: E402
from backend.server import app, resolve_prompt_country_code  # noqa: E402
from backend.server import _analyze_food_job_image_with_policy  # noqa: E402
from backend.server import _analyze_label_image_with_policy  # noqa: E402
from backend.server import _apply_analysis_rate_limit  # noqa: E402
from backend.server import _apply_analysis_rate_limit_sync  # noqa: E402
from backend.server import _run_retention_cleanup_once  # noqa: E402


def _build_image_bytes() -> bytes:
    image = Image.new("RGB", (320, 240), (220, 180, 120))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def _build_high_quality_label_bytes() -> bytes:
    image = Image.new("RGB", (600, 900), (230, 230, 230))
    draw = ImageDraw.Draw(image)
    for index in range(20):
        y = 30 + index * 40
        draw.text((30, y), f"INGREDIENTS LINE {index:02d}", fill=(20, 20, 20))
    for x in range(0, 600, 24):
        draw.line((x, 0, x, 899), fill=(40, 40, 40), width=1)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def _analysis_job_row(job_id: str) -> tuple[object, ...]:
    accepted_at = datetime(2026, 3, 1, 0, 0, 0, tzinfo=timezone.utc)
    updated_at = datetime(2026, 3, 1, 0, 0, 5, tzinfo=timezone.utc)
    return (
        job_id,
        None,
        None,
        "req-analysis-job-postgres",
        "food",
        "queued",
        "None",
        "US",
        "en-US",
        "image/jpeg",
        "YmFzZTY0",
        "sha256",
        accepted_at,
        None,
        updated_at,
        None,
        None,
        0,
        1000,
        {},
        None,
        None,
        None,
        None,
        None,
        None,
    )


def _build_rate_limit_request(headers: dict[str, str], client_host: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/analyze",
            "headers": [
                (key.lower().encode("latin-1"), value.encode("latin-1"))
                for key, value in headers.items()
            ],
            "client": (client_host, 12345),
        }
    )


def _build_upload_limit_request(*, headers: dict[str, str], client_host: str, path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": [
                (key.lower().encode("latin-1"), value.encode("latin-1"))
                for key, value in headers.items()
            ],
            "client": (client_host, 12345),
        }
    )


class _AnalysisRateLimitAuthService:
    def authenticate_access_token(self, *, access_token: str) -> SimpleNamespace:
        return SimpleNamespace(user_id=f"user-{access_token}")


class _FailingAnalysisRateLimiter:
    def evaluate_many(self, *, endpoint: str, subjects: tuple[tuple[str, str], ...], now: float | None) -> None:
        del endpoint, subjects, now
        raise RateLimitStorageError("rate limit store unavailable")


class _ChunkedUploadFile:
    def __init__(self, *, chunks: list[bytes], size: int | None) -> None:
        self._chunks = list(chunks)
        self.size = size
        self.read_calls = 0
        self.read_sizes: list[int] = []
        self.bytes_returned = 0

    async def read(self, size: int) -> bytes:
        self.read_calls += 1
        self.read_sizes.append(size)
        if not self._chunks:
            return b""
        chunk = self._chunks.pop(0)
        if size < 0 or len(chunk) <= size:
            self.bytes_returned += len(chunk)
            return chunk
        self._chunks.insert(0, chunk[size:])
        self.bytes_returned += len(chunk[:size])
        return chunk[:size]

    def remaining_bytes(self) -> int:
        return sum(len(chunk) for chunk in self._chunks)


@contextmanager
def _patched_analysis_rate_limit_state(
    *,
    endpoint_limits_per_minute: dict[str, int],
    auth_service: object | None,
) -> Iterator[None]:
    had_limiter = hasattr(app.state, "analysis_rate_limiter")
    had_auth_service = hasattr(app.state, "auth_service")
    original_limiter = getattr(app.state, "analysis_rate_limiter", None)
    original_auth_service = getattr(app.state, "auth_service", None)
    try:
        app.state.analysis_rate_limiter = InMemorySlidingWindowRateLimiter(
            endpoint_limits_per_minute=endpoint_limits_per_minute,
            window_seconds=60,
        )
        if auth_service is not None:
            app.state.auth_service = auth_service
        yield
    finally:
        if had_limiter:
            app.state.analysis_rate_limiter = original_limiter
        else:
            app.state._state.pop("analysis_rate_limiter", None)
        if had_auth_service:
            app.state.auth_service = original_auth_service
        else:
            app.state._state.pop("auth_service", None)


def _assert_analysis_rate_limit_contract(
    test_case: unittest.TestCase,
    exception: HTTPException,
    endpoint: str,
) -> None:
    test_case.assertEqual(exception.status_code, 429)
    test_case.assertEqual(exception.headers["Retry-After"], "60")
    test_case.assertEqual(exception.detail["code"], "API_RATE_LIMITED")
    test_case.assertEqual(exception.detail["retry_after_seconds"], 60)
    test_case.assertEqual(exception.detail["retry_scope"], endpoint)
    test_case.assertTrue(exception.detail["retryable_by_client"])


class _RecordingCursor:
    def __init__(self, connection: "_RecordingConnection") -> None:
        self.connection = connection

    def execute(self, sql: str, params: tuple[object, ...] | None = None) -> None:
        self.connection.executed_sql.append(sql)
        self.connection.executed_params.append(params)

    def fetchone(self) -> tuple[object, ...] | None:
        if self.connection.fetch_rows:
            return self.connection.fetch_rows.pop(0)
        return self.connection.row

    def fetchall(self) -> list[tuple[object, ...]]:
        if self.connection.fetchall_rows is not None:
            return list(self.connection.fetchall_rows)
        return [("job-postgres-ttl",)] * self.connection.rowcount

    @property
    def rowcount(self) -> int:
        return self.connection.rowcount

    def __enter__(self) -> "_RecordingCursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class _RecordingConnection:
    def __init__(self, row: tuple[object, ...], rowcount: int) -> None:
        self.row = row
        self.rowcount = rowcount
        self.fetch_rows: list[tuple[object, ...] | None] = []
        self.fetchall_rows: list[tuple[object, ...]] | None = None
        self.executed_sql: list[str] = []
        self.executed_params: list[tuple[object, ...] | None] = []
        self.commit_count = 0

    def cursor(self) -> _RecordingCursor:
        return _RecordingCursor(self)

    def commit(self) -> None:
        self.commit_count += 1

    def __enter__(self) -> "_RecordingConnection":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class _RecordingConnect:
    def __init__(self, connection: _RecordingConnection) -> None:
        self.connection = connection
        self.calls: list[tuple[str, dict[str, object]]] = []

    def __call__(self, database_url: str, **kwargs: object) -> _RecordingConnection:
        self.calls.append((database_url, dict(kwargs)))
        return self.connection


class _AsyncJobAnalyst:
    model_name = "gemini-2.0-flash"
    label_model_name = "gemini-2.5-flash"

    def __init__(self) -> None:
        self.label_calls = 0
        self.last_assess_enabled = None

    def analyze_food_job_json(self, *_args, **_kwargs):
        return {
            "foodName": "Bibimbap",
            "foodName_en": "Bibimbap",
            "foodName_ko": "비빔밥",
            "foodOrigin": "korean",
            "safetyStatus": "SAFE",
            "decision_status": "OK",
            "analysis_origin": "food_photo",
            "recommended_action": "eat",
            "uncertainty_reason": "unknown",
            "ingredients": [{"name": "Rice", "bbox": [0, 0, 10, 10], "isAllergen": False}],
            "raw_result": "Safe to eat.",
            "raw_result_en": "Safe to eat.",
            "raw_result_ko": "안전하게 먹을 수 있습니다.",
            "used_model": self.model_name,
            "prompt_version": "food-v3.3.3-schema-safety",
        }

    def analyze_label_json(self, *_args, **_kwargs):
        self.label_calls += 1
        self.last_assess_enabled = _args[4] if len(_args) >= 5 else None
        return {
            "foodName": "Bibimbap Label",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "raw_result": "Safe to eat.",
            "used_model": self.label_model_name,
            "prompt_version": "label-v1.2-2pass-locale-country",
        }


class _AsyncJob429Analyst(_AsyncJobAnalyst):
    def analyze_label_json(self, *_args, **_kwargs):
        self.label_calls += 1
        self.last_assess_enabled = _args[4] if len(_args) >= 5 else None
        return {
            "foodName": "Unknown",
            "safetyStatus": "CAUTION",
            "ingredients": [],
            "raw_result": "rate limited",
            "used_model": self.label_model_name,
            "prompt_version": "label-v1.2-2pass-locale-country",
            "_label_timings": {"extract_ms": 0, "assess_ms": 0},
            "_label_chargeable": False,
            "_label_error_type": "quota_exhausted_429",
            "_label_partial": True,
        }


class _SmartLabelJobRouter:
    async def route_analysis(
        self,
        *,
        image: Any,
        allergy_info: str,
        iso_country_code: str,
        locale: str | None,
        request_id: str,
        total_started_at: float,
        preprocess_elapsed_ms: int,
        label_analysis_runner: Any,
        food_analysis_runner: Any | None = None,
    ) -> dict[str, Any]:
        result = await label_analysis_runner(
            image,
            allergy_info,
            iso_country_code,
            locale,
            request_id,
            total_started_at,
            preprocess_elapsed_ms,
        )
        result["router_category"] = "NUTRITION_LABEL"
        return result


class _SmartFoodPolicyRunner:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def __call__(
        self,
        image: Any,
        allergy_info: str,
        iso_country_code: str,
        request_id: str,
        total_started_at: float,
        preprocess_elapsed_ms: int,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "image": image,
                "allergy_info": allergy_info,
                "iso_country_code": iso_country_code,
                "request_id": request_id,
                "total_started_at": total_started_at,
                "preprocess_elapsed_ms": preprocess_elapsed_ms,
            }
        )
        return {
            "foodName": "Smart Bibimbap",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "analysis_diagnostics": {
                "origin": "food_photo",
                "fallback_used": False,
                "fallback_reason": None,
                "finish_reason": None,
                "truncated": False,
                "usage_source": "estimated",
            },
        }


class _IdempotencyRecordingJobStore:
    def __init__(self) -> None:
        self.records_by_key: dict[tuple[str, str], dict[str, Any]] = {}
        self.records_by_job_id: dict[str, dict[str, Any]] = {}
        self.create_attempt_count = 0
        self.created_job_count = 0

    def submit_job(
        self,
        *,
        job_id: str,
        user_id: str | None,
        idempotency_key: str | None,
        request_id: str,
        mode: str,
        allergy_info: str,
        iso_country_code: str,
        locale: str | None,
        content_type: str,
        image_base64: str,
        image_sha256: str,
        accepted_at: datetime,
        poll_after_ms: int,
    ) -> dict[str, Any]:
        self.create_attempt_count += 1
        if user_id is not None and idempotency_key is not None:
            existing_record = self.records_by_key.get((user_id, idempotency_key))
            if existing_record is not None:
                reused_record = dict(existing_record)
                reused_record["idempotency_reused"] = True
                return reused_record

        record: dict[str, Any] = {
            "job_id": job_id,
            "request_id": request_id,
            "mode": mode,
            "allergy_info": allergy_info,
            "iso_country_code": iso_country_code,
            "locale": locale,
            "content_type": content_type,
            "image_base64": image_base64,
            "image_sha256": image_sha256,
            "status": "queued",
            "accepted_at": accepted_at,
            "poll_after_ms": poll_after_ms,
            "user_id": user_id,
            "idempotency_key": idempotency_key,
            "idempotency_reused": False,
        }
        self.records_by_job_id[job_id] = record
        if user_id is not None and idempotency_key is not None:
            self.records_by_key[(user_id, idempotency_key)] = record
        self.created_job_count += 1
        return dict(record)


class _TtlScrubRecordingStore:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def scrub_expired_sensitive_payloads(
        self,
        *,
        cutoff_at: datetime,
        scrubbed_at: datetime,
        limit: int,
        dry_run: bool,
    ) -> analysis_jobs.AnalysisJobsSensitivePayloadScrubResult:
        self.calls.append(
            {
                "cutoff_at": cutoff_at,
                "scrubbed_at": scrubbed_at,
                "limit": limit,
                "dry_run": dry_run,
            }
        )
        return analysis_jobs.AnalysisJobsSensitivePayloadScrubResult(
            target_count=3,
            scrubbed_count=0 if dry_run else 3,
            dry_run=dry_run,
            cutoff_at=cutoff_at,
            scrubbed_at=scrubbed_at,
        )


class _RetentionCleanupRecordingJob:
    def __init__(self) -> None:
        self.data_classes: list[RetentionDataClass] = []

    def run_once(
        self,
        *,
        data_class: RetentionDataClass,
        now: datetime,
        limit: int,
    ) -> CleanupJobResult:
        self.data_classes.append(data_class)
        return CleanupJobResult(
            scanned_count=0,
            expired_count=0,
            deleted_count=0,
            data_class=data_class,
        )


class AnalysisJobRuntimeTests(unittest.TestCase):
    def test_upload_content_length_precheck_rejects_before_read(self) -> None:
        max_upload_bytes = 128 * 1024
        request = _build_rate_limit_request(
            headers={
                "content-length": str(server._upload_content_length_limit(max_upload_bytes) + 1),
                "x-request-id": "req-analysis-upload-content-length",
            },
            client_host="127.0.0.1",
        )

        with self.assertRaises(HTTPException) as captured:
            server._raise_if_upload_content_length_too_large(
                request=request,
                max_upload_bytes=max_upload_bytes,
                request_id="req-analysis-upload-content-length",
                too_large_exception_factory=server._analysis_upload_too_large_http_exception,
            )

        self.assertEqual(captured.exception.status_code, 413)
        self.assertEqual(captured.exception.detail["code"], "IMAGE_DECODE_FAILED")
        self.assertEqual(captured.exception.detail["request_id"], "req-analysis-upload-content-length")

    def test_upload_content_length_middleware_rejects_before_call_next(self) -> None:
        async def raise_if_called(_request: Request) -> Response:
            raise AssertionError("call_next should not be called for oversized uploads")

        cases = (
            ("/analyze", "IMAGE_DECODE_FAILED"),
            ("/analyze/jobs", "IMAGE_DECODE_FAILED"),
            ("/analyze/label", "IMAGE_DECODE_FAILED"),
            ("/analyze/smart", "IMAGE_DECODE_FAILED"),
            ("/me/media/upload", "MEDIA_FILE_TOO_LARGE"),
        )

        for path, expected_code in cases:
            with self.subTest(path=path):
                upload_limit = server._upload_limit_for_request_path(path)
                self.assertIsNotNone(upload_limit)
                assert upload_limit is not None
                max_upload_bytes = upload_limit[0]
                request = _build_upload_limit_request(
                    path=path,
                    headers={
                        "content-length": str(server._upload_content_length_limit(max_upload_bytes) + 1),
                        "x-request-id": f"req-upload-content-length-{path.strip('/').replace('/', '-')}",
                    },
                    client_host="127.0.0.1",
                )

                response = asyncio.run(
                    server._reject_oversized_upload_by_content_length(
                        request,
                        raise_if_called,
                    )
                )
                body = json.loads(response.body)

                self.assertEqual(response.status_code, 413)
                self.assertEqual(body["detail"]["code"], expected_code)

    def test_upload_middleware_rejects_missing_content_length_chunked_body(self) -> None:
        messages = [
            {"type": "http.request", "body": b"a" * 10_000, "more_body": True},
            {"type": "http.request", "body": b"b" * 7_000, "more_body": True},
            {"type": "http.request", "body": b"", "more_body": False},
        ]

        async def receive() -> dict[str, Any]:
            return messages.pop(0)

        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/analyze",
                "headers": [(b"x-request-id", b"req-upload-chunked-too-large")],
                "client": ("127.0.0.1", 12345),
            },
            receive=receive,
        )

        async def consume_request_body(next_request: Request) -> Response:
            async for _chunk in next_request.stream():
                pass
            return Response(status_code=204)

        with patch("backend.server._analysis_job_max_upload_bytes", return_value=8):
            response = asyncio.run(
                server._reject_oversized_upload_by_content_length(
                    request,
                    consume_request_body,
                )
            )

        body = json.loads(response.body)

        self.assertEqual(response.status_code, 413)
        self.assertEqual(body["detail"]["code"], "IMAGE_DECODE_FAILED")
        self.assertEqual(body["detail"]["request_id"], "req-upload-chunked-too-large")
        self.assertEqual(len(messages), 1)

    def test_upload_content_length_middleware_keeps_cors_headers(self) -> None:
        origin = "https://client.example.com"
        cors_app = FastAPI()
        cors_app.middleware("http")(server._reject_oversized_upload_by_content_length)

        @cors_app.post("/analyze")
        async def _unreachable_analyze_route() -> dict[str, str]:
            raise AssertionError("route should not run for oversized uploads")

        cors_app.add_middleware(
            CORSMiddleware,
            allow_origins=[origin],
            allow_credentials=True,
            allow_methods=["POST"],
            allow_headers=["Content-Type", "X-Request-Id"],
        )

        with TestClient(cors_app) as client:
            with patch("backend.server._analysis_job_max_upload_bytes", return_value=8):
                response = client.post(
                    "/analyze",
                    content=b"x" * (server.UPLOAD_CONTENT_LENGTH_OVERHEAD_BYTES + 64),
                    headers={
                        "Content-Type": "application/octet-stream",
                        "Origin": origin,
                        "X-Request-Id": "req-upload-cors-too-large",
                    },
                )

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.headers.get("access-control-allow-origin"), origin)
        self.assertEqual(response.json()["detail"]["code"], "IMAGE_DECODE_FAILED")

    def test_receive_wrapper_rejects_chunked_body_at_boundary(self) -> None:
        messages = [
            {"type": "http.request", "body": b"a" * 5, "more_body": True},
            {"type": "http.request", "body": b"b" * 6, "more_body": True},
        ]

        async def receive() -> dict[str, Any]:
            return messages.pop(0)

        wrapped_receive = server._wrap_receive_with_upload_limit(
            receive=receive,
            max_body_bytes=10,
            too_large_exception=server._analysis_upload_too_large_http_exception(
                10,
                "req-analysis-upload-chunked-boundary",
            ),
        )

        first_message = asyncio.run(wrapped_receive())
        self.assertEqual(first_message["body"], b"a" * 5)
        with self.assertRaises(server.UploadBodyTooLargeError) as captured:
            asyncio.run(wrapped_receive())

        self.assertEqual(captured.exception.http_exception.status_code, 413)
        self.assertEqual(captured.exception.http_exception.detail["code"], "IMAGE_DECODE_FAILED")

    def test_chunked_upload_read_stops_when_limit_is_exceeded(self) -> None:
        file = _ChunkedUploadFile(
            chunks=[
                b"a" * server.UPLOAD_READ_CHUNK_BYTES,
                b"b" * server.UPLOAD_READ_CHUNK_BYTES,
                b"c" * server.UPLOAD_READ_CHUNK_BYTES,
            ],
            size=None,
        )
        max_upload_bytes = server.UPLOAD_READ_CHUNK_BYTES + 8

        with self.assertRaises(HTTPException) as captured:
            asyncio.run(
                server._read_upload_bytes_with_limit(
                    file=file,
                    max_upload_bytes=max_upload_bytes,
                    too_large_exception=server._analysis_upload_too_large_http_exception(
                        max_upload_bytes,
                        "req-analysis-upload-chunked",
                    ),
                )
            )

        self.assertEqual(captured.exception.status_code, 413)
        self.assertEqual(captured.exception.detail["code"], "IMAGE_DECODE_FAILED")
        self.assertEqual(file.read_calls, 2)
        self.assertEqual(file.read_sizes, [server.UPLOAD_READ_CHUNK_BYTES, server.UPLOAD_READ_CHUNK_BYTES])
        self.assertEqual(file.bytes_returned, server.UPLOAD_READ_CHUNK_BYTES * 2)
        self.assertGreater(file.remaining_bytes(), 0)

    def test_chunked_upload_read_accepts_exact_limit(self) -> None:
        file = _ChunkedUploadFile(chunks=[b"a" * 5, b"b" * 5], size=10)

        contents = asyncio.run(
            server._read_upload_bytes_with_limit(
                file=file,
                max_upload_bytes=10,
                too_large_exception=server._analysis_upload_too_large_http_exception(
                    10,
                    "req-analysis-upload-exact-limit",
                ),
            )
        )

        self.assertEqual(contents, b"aaaaabbbbb")
        self.assertEqual(file.read_calls, 3)

    def test_chunked_upload_read_rejects_known_oversize_without_reading(self) -> None:
        file = _ChunkedUploadFile(chunks=[b"a" * 5], size=11)

        with self.assertRaises(HTTPException) as captured:
            asyncio.run(
                server._read_upload_bytes_with_limit(
                    file=file,
                    max_upload_bytes=10,
                    too_large_exception=server._analysis_upload_too_large_http_exception(
                        10,
                        "req-analysis-upload-known-size",
                    ),
                )
            )

        self.assertEqual(captured.exception.status_code, 413)
        self.assertEqual(captured.exception.detail["code"], "IMAGE_DECODE_FAILED")
        self.assertEqual(file.read_calls, 0)

    def test_submit_job_rejects_oversize_upload_before_store_submit(self) -> None:
        def raise_if_called(**_kwargs: object) -> None:
            raise AssertionError("submit_job should not be called for oversized uploads")

        with TestClient(app) as client:
            original_store = app.state.analysis_job_store
            app.state.analysis_job_store = SimpleNamespace(submit_job=raise_if_called)
            try:
                with patch("backend.server._analysis_job_max_upload_bytes", return_value=8):
                    response = client.post(
                        "/analyze/jobs",
                        files={"file": ("large.jpg", b"x" * 9, "image/jpeg")},
                        data={"allergy_info": "None", "locale": "ko-KR", "mode": "food"},
                        headers={"X-Request-Id": "req-analysis-job-upload-too-large"},
                    )
            finally:
                app.state.analysis_job_store = original_store

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["detail"]["code"], "IMAGE_DECODE_FAILED")
        self.assertEqual(response.json()["detail"]["request_id"], "req-analysis-job-upload-too-large")

    def test_analysis_routes_reject_oversize_uploads(self) -> None:
        endpoints = (
            ("/analyze", "req-analysis-upload-too-large"),
            ("/analyze/label", "req-analysis-label-upload-too-large"),
            ("/analyze/smart", "req-analysis-smart-upload-too-large"),
        )

        with TestClient(app) as client:
            with patch("backend.server._analysis_job_max_upload_bytes", return_value=8):
                with patch(
                    "backend.server.decode_upload_to_image",
                    side_effect=AssertionError("decode should not run for oversized uploads"),
                ):
                    for endpoint, request_id in endpoints:
                        with self.subTest(endpoint=endpoint):
                            response = client.post(
                                endpoint,
                                files={"file": ("large.jpg", b"x" * 9, "image/jpeg")},
                                data={"allergy_info": "None", "locale": "ko-KR"},
                                headers={"X-Request-Id": request_id},
                            )

                        self.assertEqual(response.status_code, 413)
                        self.assertEqual(response.json()["detail"]["code"], "IMAGE_DECODE_FAILED")
                        self.assertEqual(response.json()["detail"]["request_id"], request_id)

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_submit_job_route_blocks_unauthenticated_device_rotation_by_ip(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        with TestClient(app) as client:
            with _patched_analysis_rate_limit_state(
                endpoint_limits_per_minute={"/analyze/jobs": 1},
                auth_service=None,
            ):
                first = client.post(
                    "/analyze/jobs",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={"allergy_info": "None", "locale": "ko-KR", "mode": "food"},
                    headers={
                        "X-Device-Id": "device-a",
                        "X-Forwarded-For": "8.8.8.8",
                        "X-Request-Id": "req-analysis-job-rate-route-1",
                    },
                )
                second = client.post(
                    "/analyze/jobs",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={"allergy_info": "None", "locale": "ko-KR", "mode": "food"},
                    headers={
                        "X-Device-Id": "device-b",
                        "X-Forwarded-For": "8.8.8.8",
                        "X-Request-Id": "req-analysis-job-rate-route-2",
                    },
                )

        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.headers["Retry-After"], "60")
        self.assertEqual(second.json()["detail"]["code"], "API_RATE_LIMITED")
        self.assertEqual(second.json()["detail"]["retry_after_seconds"], 60)
        self.assertEqual(second.json()["detail"]["retry_scope"], "/analyze/jobs")
        self.assertTrue(second.json()["detail"]["retryable_by_client"])

    def test_job_status_route_blocks_unauthenticated_device_rotation_by_ip(self) -> None:
        with TestClient(app) as client:
            with _patched_analysis_rate_limit_state(
                endpoint_limits_per_minute={"/analyze/jobs/status": 1},
                auth_service=None,
            ):
                first = client.get(
                    "/analyze/jobs/missing-route-rate-job",
                    headers={
                        "X-Device-Id": "device-a",
                        "X-Forwarded-For": "8.8.8.8",
                        "X-Request-Id": "req-analysis-job-status-rate-route-1",
                    },
                )
                second = client.get(
                    "/analyze/jobs/another-missing-route-rate-job",
                    headers={
                        "X-Device-Id": "device-b",
                        "X-Forwarded-For": "8.8.8.8",
                        "X-Request-Id": "req-analysis-job-status-rate-route-2",
                    },
                )

        self.assertNotEqual(first.status_code, 429)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.headers["Retry-After"], "60")
        self.assertEqual(second.json()["detail"]["code"], "API_RATE_LIMITED")
        self.assertEqual(second.json()["detail"]["retry_after_seconds"], 60)
        self.assertEqual(second.json()["detail"]["retry_scope"], "/analyze/jobs/status")
        self.assertTrue(second.json()["detail"]["retryable_by_client"])

    def test_analysis_rate_limit_storage_error_maps_to_retryable_503(self) -> None:
        had_limiter = hasattr(app.state, "analysis_rate_limiter")
        original_limiter = getattr(app.state, "analysis_rate_limiter", None)
        try:
            app.state.analysis_rate_limiter = _FailingAnalysisRateLimiter()
            request = _build_rate_limit_request(
                headers={"X-Device-Id": "device-a", "X-Forwarded-For": "8.8.8.8"},
                client_host="10.0.0.1",
            )
            with self.assertRaises(HTTPException) as captured:
                asyncio.run(
                    _apply_analysis_rate_limit(
                        request=request,
                        endpoint="/analyze",
                        request_id="req-analysis-rate-storage-error",
                    )
                )
        finally:
            if had_limiter:
                app.state.analysis_rate_limiter = original_limiter
            else:
                app.state._state.pop("analysis_rate_limiter", None)

        self.assertEqual(captured.exception.status_code, 503)
        self.assertEqual(captured.exception.headers["Retry-After"], "5")
        self.assertEqual(
            captured.exception.detail["code"],
            "API_RATE_LIMIT_STORAGE_UNAVAILABLE",
        )
        self.assertEqual(captured.exception.detail["retry_after_seconds"], 5)
        self.assertEqual(captured.exception.detail["retry_scope"], "/analyze")
        self.assertTrue(captured.exception.detail["retryable_by_client"])

    def test_analysis_rate_limit_blocks_unauthenticated_device_rotation_by_ip(self) -> None:
        with _patched_analysis_rate_limit_state(
            endpoint_limits_per_minute={"/analyze": 1},
            auth_service=None,
        ):
            first_request = _build_rate_limit_request(
                headers={"X-Device-Id": "device-a", "X-Forwarded-For": "8.8.8.8"},
                client_host="10.0.0.1",
            )
            second_request = _build_rate_limit_request(
                headers={"X-Device-Id": "device-b", "X-Forwarded-For": "8.8.8.8"},
                client_host="10.0.0.1",
            )

            _apply_analysis_rate_limit_sync(
                request=first_request,
                endpoint="/analyze",
                request_id="req-analysis-rate-ip-1",
            )
            with self.assertRaises(HTTPException) as captured:
                _apply_analysis_rate_limit_sync(
                    request=second_request,
                    endpoint="/analyze",
                    request_id="req-analysis-rate-ip-2",
                )
        _assert_analysis_rate_limit_contract(self, captured.exception, "/analyze")

    def test_analysis_rate_limit_blocks_unauthenticated_ip_rotation_by_device(self) -> None:
        with _patched_analysis_rate_limit_state(
            endpoint_limits_per_minute={"/analyze": 1},
            auth_service=None,
        ):
            first_request = _build_rate_limit_request(
                headers={"X-Device-Id": "device-a", "X-Forwarded-For": "8.8.8.8"},
                client_host="10.0.0.1",
            )
            second_request = _build_rate_limit_request(
                headers={"X-Device-Id": "device-a", "X-Forwarded-For": "1.1.1.1"},
                client_host="10.0.0.2",
            )

            _apply_analysis_rate_limit_sync(
                request=first_request,
                endpoint="/analyze",
                request_id="req-analysis-rate-device-1",
            )
            with self.assertRaises(HTTPException) as captured:
                _apply_analysis_rate_limit_sync(
                    request=second_request,
                    endpoint="/analyze",
                    request_id="req-analysis-rate-device-2",
                )
        _assert_analysis_rate_limit_contract(self, captured.exception, "/analyze")

    def test_analysis_rate_limit_blocks_authenticated_rotation_by_user(self) -> None:
        with _patched_analysis_rate_limit_state(
            endpoint_limits_per_minute={"/lookup/barcode": 1},
            auth_service=_AnalysisRateLimitAuthService(),
        ):
            first_request = _build_rate_limit_request(
                headers={
                    "Authorization": "Bearer analysis-token",
                    "X-Device-Id": "device-a",
                    "X-Forwarded-For": "8.8.8.8",
                },
                client_host="10.0.0.1",
            )
            second_request = _build_rate_limit_request(
                headers={
                    "Authorization": "Bearer analysis-token",
                    "X-Device-Id": "device-b",
                    "X-Forwarded-For": "1.1.1.1",
                },
                client_host="10.0.0.2",
            )

            _apply_analysis_rate_limit_sync(
                request=first_request,
                endpoint="/lookup/barcode",
                request_id="req-analysis-rate-user-1",
            )
            with self.assertRaises(HTTPException) as captured:
                _apply_analysis_rate_limit_sync(
                    request=second_request,
                    endpoint="/lookup/barcode",
                    request_id="req-analysis-rate-user-2",
                )
        _assert_analysis_rate_limit_contract(self, captured.exception, "/lookup/barcode")

    def test_analysis_rate_limit_blocks_authenticated_ip_reuse_across_users(self) -> None:
        with _patched_analysis_rate_limit_state(
            endpoint_limits_per_minute={"/analyze/label": 1},
            auth_service=_AnalysisRateLimitAuthService(),
        ):
            first_request = _build_rate_limit_request(
                headers={
                    "Authorization": "Bearer analysis-token-a",
                    "X-Device-Id": "device-a",
                    "X-Forwarded-For": "8.8.8.8",
                },
                client_host="10.0.0.1",
            )
            second_request = _build_rate_limit_request(
                headers={
                    "Authorization": "Bearer analysis-token-b",
                    "X-Device-Id": "device-b",
                    "X-Forwarded-For": "8.8.8.8",
                },
                client_host="10.0.0.1",
            )

            _apply_analysis_rate_limit_sync(
                request=first_request,
                endpoint="/analyze/label",
                request_id="req-analysis-rate-auth-ip-1",
            )
            with self.assertRaises(HTTPException) as captured:
                _apply_analysis_rate_limit_sync(
                    request=second_request,
                    endpoint="/analyze/label",
                    request_id="req-analysis-rate-auth-ip-2",
                )
        _assert_analysis_rate_limit_contract(self, captured.exception, "/analyze/label")

    def test_analysis_rate_limit_blocks_authenticated_device_reuse_across_users(self) -> None:
        with _patched_analysis_rate_limit_state(
            endpoint_limits_per_minute={"/analyze/smart": 1},
            auth_service=_AnalysisRateLimitAuthService(),
        ):
            first_request = _build_rate_limit_request(
                headers={
                    "Authorization": "Bearer analysis-token-a",
                    "X-Device-Id": "device-a",
                    "X-Forwarded-For": "8.8.8.8",
                },
                client_host="10.0.0.1",
            )
            second_request = _build_rate_limit_request(
                headers={
                    "Authorization": "Bearer analysis-token-b",
                    "X-Device-Id": "device-a",
                    "X-Forwarded-For": "1.1.1.1",
                },
                client_host="10.0.0.2",
            )

            _apply_analysis_rate_limit_sync(
                request=first_request,
                endpoint="/analyze/smart",
                request_id="req-analysis-rate-auth-device-1",
            )
            with self.assertRaises(HTTPException) as captured:
                _apply_analysis_rate_limit_sync(
                    request=second_request,
                    endpoint="/analyze/smart",
                    request_id="req-analysis-rate-auth-device-2",
                )
        _assert_analysis_rate_limit_contract(self, captured.exception, "/analyze/smart")

    def test_retention_pass_invokes_analysis_jobs_ttl_scrub_without_pii_logs(self) -> None:
        store = _TtlScrubRecordingStore()
        retention_job = _RetentionCleanupRecordingJob()
        app.state.retention_cleanup_job = retention_job
        app.state.analysis_jobs_ttl_scrub_store = store
        app.state.analysis_jobs_sensitive_payload_retention_config = AnalysisJobsSensitivePayloadRetentionConfig(
            enabled=True,
            dry_run=True,
            ttl_days=30,
            batch_size=77,
        )

        with self.assertLogs("foodlens.api", level="INFO") as captured:
            asyncio.run(_run_retention_cleanup_once())

        self.assertEqual(
            retention_job.data_classes,
            [RetentionDataClass.ORIGINAL, RetentionDataClass.DERIVED, RetentionDataClass.LOG],
        )
        self.assertEqual(len(store.calls), 1)
        self.assertEqual(store.calls[0]["limit"], 77)
        self.assertTrue(store.calls[0]["dry_run"])
        self.assertGreaterEqual((store.calls[0]["scrubbed_at"] - store.calls[0]["cutoff_at"]).days, 30)
        log_output = "\n".join(captured.output)
        self.assertIn("target_count=3", log_output)
        self.assertIn("scrubbed_count=0", log_output)
        self.assertNotIn("user-", log_output)
        self.assertNotIn("image_base64", log_output)
        self.assertNotIn("peanut", log_output)

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_poll_ttl_scrubbed_job_returns_gone(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        accepted_at = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        with TestClient(app) as client:
            store = app.state.analysis_job_store
            store.submit_job(
                job_id="job-ttl-gone",
                user_id="user-ttl-gone",
                idempotency_key="ttl-gone-key",
                request_id="req-ttl-gone",
                mode="food",
                allergy_info="peanut",
                iso_country_code="US",
                locale="en-US",
                content_type="image/jpeg",
                image_base64="Z29uZQ==",
                image_sha256="gone-sha256",
                accepted_at=accepted_at,
                poll_after_ms=1000,
            )
            store.scrub_expired_sensitive_payloads(
                cutoff_at=datetime(2026, 4, 16, 12, 0, 0, tzinfo=timezone.utc),
                scrubbed_at=datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc),
                limit=100,
                dry_run=False,
            )

            response = client.get("/analyze/jobs/job-ttl-gone", headers={"X-Request-Id": "req-ttl-gone-poll"})

        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()["detail"]["code"], "ANALYSIS_JOB_GONE")

    def test_analysis_job_poll_openapi_documents_privacy_gone_response(self) -> None:
        route = app.openapi()["paths"]["/analyze/jobs/{job_id}"]["get"]

        self.assertIn("410", route["responses"])
        self.assertEqual(
            route["responses"]["410"]["content"]["application/json"]["example"]["detail"]["code"],
            "ANALYSIS_JOB_GONE",
        )

    def _build_worker(self) -> AnalysisJobWorker:
        return AnalysisJobWorker(
            store=app.state.analysis_job_store,
            nutrition_service=NutritionEnrichmentService(
                cache_store=InMemoryNutritionCacheStore(),
                lookup_func=lambda _name, _origin: {
                    "calories": 150.0,
                    "protein": 3.0,
                    "carbs": 20.0,
                    "fat": 4.0,
                    "fiber": 1.0,
                    "sodium": 10.0,
                    "sugar": 2.0,
                    "servingSize": "100g",
                    "dataSource": "TestCache",
                },
                budget_seconds=0.5,
                max_parallelism=1,
            ),
            get_analyst=lambda: app.state.analyst,
            get_smart_router=lambda: app.state.smart_router,
            analyze_label_with_policy=_analyze_label_image_with_policy,
            analyze_food_with_policy=_analyze_food_job_image_with_policy,
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            lease_seconds=60,
            poll_interval_seconds=0.1,
            worker_id="worker-test",
        )

    def _process_next_job_with_worker(self) -> None:
        worker = self._build_worker()
        claimed_job = worker.store.claim_next_job(
            worker_id=worker.worker_id,
            lease_seconds=worker.lease_seconds,
            now=datetime.now(timezone.utc),
        )
        self.assertIsNotNone(claimed_job)
        asyncio.run(worker._process_job(claimed_job))

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_submit_job_returns_202_and_poll_completes(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        with TestClient(app) as client:
            app.state.analyst = _AsyncJobAnalyst()

            submit = client.post(
                "/analyze/jobs",
                files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR", "mode": "food"},
                headers={"X-Request-Id": "req-analysis-job-1"},
            )

            self.assertEqual(submit.status_code, 202)
            payload = submit.json()
            self.assertEqual(payload["status"], "queued")
            self.assertIn("job_id", payload)

            self._process_next_job_with_worker()

            polled = client.get(
                f"/analyze/jobs/{payload['job_id']}",
                headers={"X-Request-Id": "req-analysis-job-poll"},
            )

        self.assertEqual(polled.status_code, 200)
        terminal_payload = polled.json()
        self.assertEqual(terminal_payload["status"], "completed")
        self.assertEqual(terminal_payload["request_id"], "req-analysis-job-1")
        self.assertEqual(terminal_payload["foodName"], "Bibimbap")
        self.assertEqual(terminal_payload["foodName_en"], "Bibimbap")
        self.assertEqual(terminal_payload["foodName_ko"], "비빔밥")
        self.assertEqual(terminal_payload["decision_status"], "OK")
        self.assertEqual(terminal_payload["analysis_origin"], "food_photo")
        self.assertEqual(terminal_payload["recommended_action"], "eat")
        self.assertEqual(terminal_payload["uncertainty_reason"], "unknown")
        self.assertEqual(terminal_payload["used_model"], "gemini-2.0-flash")
        self.assertEqual(terminal_payload["prompt_version"], "food-v3.3.3-schema-safety")
        self.assertEqual(
            terminal_payload["analysis_diagnostics"],
            {
                "origin": "food_photo",
                "fallback_used": False,
                "fallback_reason": None,
                "finish_reason": None,
                "truncated": False,
                "usage_source": "estimated",
            },
        )
        self.assertIn("latency_ms_by_stage", terminal_payload)
        self.assertEqual(terminal_payload["nutrition"]["dataSource"], "TestCache")

    def test_smart_real_food_route_marks_food_diagnostics_as_smart_route(self) -> None:
        smart_router = SmartRouter.__new__(SmartRouter)
        smart_router.analyst = SimpleNamespace(
            analyze_food_json=lambda *_args: self.fail("Smart food route bypassed policy runner")
        )
        smart_router.router_model = SimpleNamespace(
            generate_content=lambda *_args, **_kwargs: SimpleNamespace(
                text='{"category":"REAL_FOOD","confidence":0.99}'
            )
        )
        food_runner = _SmartFoodPolicyRunner()

        result = asyncio.run(
            smart_router.route_analysis(
                image=Image.new("RGB", (64, 64), (120, 80, 40)),
                allergy_info="peanut",
                iso_country_code="KR",
                locale="ko-KR",
                request_id="req-smart-food-policy",
                total_started_at=time.perf_counter(),
                preprocess_elapsed_ms=7,
                label_analysis_runner=None,
                food_analysis_runner=food_runner,
            )
        )

        self.assertEqual(len(food_runner.calls), 1)
        self.assertEqual(food_runner.calls[0]["allergy_info"], "peanut")
        self.assertEqual(food_runner.calls[0]["iso_country_code"], "KR")
        self.assertEqual(food_runner.calls[0]["request_id"], "req-smart-food-policy")
        self.assertEqual(food_runner.calls[0]["preprocess_elapsed_ms"], 7)
        self.assertEqual(result["router_category"], "REAL_FOOD")
        self.assertEqual(result["analysis_diagnostics"]["origin"], "smart_route")

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_submit_job_reuses_client_idempotency_key(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        store = _IdempotencyRecordingJobStore()
        with TestClient(app) as client:
            original_store = app.state.analysis_job_store
            app.state.analysis_job_store = store
            try:
                first = client.post(
                    "/analyze/jobs",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={
                        "allergy_info": "None",
                        "locale": "ko-KR",
                        "mode": "food",
                        "idempotency_key": " duplicate-analysis-key ",
                    },
                    headers={
                        "X-Device-Id": "job-idempotency-device",
                        "X-Request-Id": "req-analysis-job-idempotency-1",
                    },
                )
                second = client.post(
                    "/analyze/jobs",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={
                        "allergy_info": "None",
                        "locale": "ko-KR",
                        "mode": "food",
                        "idempotency_key": "ignored-form-key",
                    },
                    headers={
                        "Idempotency-Key": "duplicate-analysis-key",
                        "X-Device-Id": "job-idempotency-device",
                        "X-Request-Id": "req-analysis-job-idempotency-2",
                    },
                )
            finally:
                app.state.analysis_job_store = original_store

        first_payload = first.json()
        second_payload = second.json()
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 202)
        self.assertEqual(first_payload["job_id"], second_payload["job_id"])
        self.assertFalse(first_payload["idempotency_reused"])
        self.assertTrue(second_payload["idempotency_reused"])
        self.assertEqual(store.create_attempt_count, 2)
        self.assertEqual(store.created_job_count, 1)
        self.assertEqual(len(store.records_by_key), 1)
        self.assertEqual(next(iter(store.records_by_key))[1], "duplicate-analysis-key")

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_submit_job_authenticated_request_sets_user_id_without_idempotency_key(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        store = _IdempotencyRecordingJobStore()
        with TestClient(app) as client:
            original_store = app.state.analysis_job_store
            app.state.analysis_job_store = store
            try:
                with patch(
                    "backend.server._resolve_rate_limit_subject",
                    return_value=("user:usr_analysis_job", "usr_analysis_job"),
                ):
                    response = client.post(
                        "/analyze/jobs",
                        files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                        data={
                            "allergy_info": "None",
                            "locale": "ko-KR",
                            "mode": "food",
                        },
                        headers={
                            "Authorization": "Bearer token-user-owned",
                            "X-Request-Id": "req-analysis-job-auth-owner",
                        },
                    )
            finally:
                app.state.analysis_job_store = original_store

        payload = response.json()
        self.assertEqual(response.status_code, 202)
        self.assertEqual(store.records_by_job_id[payload["job_id"]]["user_id"], "usr_analysis_job")
        self.assertIsNone(store.records_by_job_id[payload["job_id"]]["idempotency_key"])

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_submit_job_empty_idempotency_key_preserves_new_job_behavior(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        store = _IdempotencyRecordingJobStore()
        with TestClient(app) as client:
            original_store = app.state.analysis_job_store
            app.state.analysis_job_store = store
            try:
                first = client.post(
                    "/analyze/jobs",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={
                        "allergy_info": "None",
                        "locale": "ko-KR",
                        "mode": "food",
                        "idempotency_key": " ",
                    },
                    headers={
                        "Idempotency-Key": " ",
                        "X-Request-Id": "req-analysis-job-empty-idempotency-1",
                    },
                )
                second = client.post(
                    "/analyze/jobs",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={
                        "allergy_info": "None",
                        "locale": "ko-KR",
                        "mode": "food",
                        "idempotency_key": "",
                    },
                    headers={
                        "Idempotency-Key": "",
                        "X-Request-Id": "req-analysis-job-empty-idempotency-2",
                    },
                )
            finally:
                app.state.analysis_job_store = original_store

        first_payload = first.json()
        second_payload = second.json()
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 202)
        self.assertNotEqual(first_payload["job_id"], second_payload["job_id"])
        self.assertFalse(first_payload["idempotency_reused"])
        self.assertFalse(second_payload["idempotency_reused"])
        self.assertEqual(store.create_attempt_count, 2)
        self.assertEqual(store.created_job_count, 2)
        self.assertEqual(store.records_by_key, {})

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_label_job_degrades_through_shared_cost_gate(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=0.85, tokens=1000)
        analyst = _AsyncJobAnalyst()

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE": "0.012",
                    "LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE": "900",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            submit = client.post(
                "/analyze/jobs",
                files={"file": ("label.jpg", _build_high_quality_label_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR", "mode": "label"},
                headers={"X-Request-Id": "req-analysis-job-label-degrade"},
            )
            self.assertEqual(submit.status_code, 202)
            self._process_next_job_with_worker()
            polled = client.get(f"/analyze/jobs/{submit.json()['job_id']}")

        usage = storage.get(service._period_key())
        self.assertEqual(polled.status_code, 200)
        self.assertEqual(polled.json()["status"], "completed")
        self.assertEqual(analyst.label_calls, 1)
        self.assertFalse(analyst.last_assess_enabled)
        self.assertAlmostEqual(usage.total_cost_usd, 0.862)
        self.assertEqual(usage.total_tokens, 1900)

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_smart_label_job_uses_shared_cost_gate_fallback(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=1.0)
        service.record(cost_usd=1.0, tokens=1000)
        analyst = _AsyncJobAnalyst()

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.smart_router = _SmartLabelJobRouter()
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            submit = client.post(
                "/analyze/jobs",
                files={"file": ("label.jpg", _build_high_quality_label_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR", "mode": "smart"},
                headers={"X-Request-Id": "req-analysis-job-smart-label-fallback"},
            )
            self.assertEqual(submit.status_code, 202)
            self._process_next_job_with_worker()
            polled = client.get(f"/analyze/jobs/{submit.json()['job_id']}")

        usage = storage.get(service._period_key())
        payload = polled.json()
        self.assertEqual(polled.status_code, 200)
        self.assertEqual(payload["status"], "fallback_completed")
        self.assertFalse("latency_ms" in payload)
        self.assertEqual(payload["fallback_reason"], "budget_fallback")
        self.assertEqual(analyst.label_calls, 0)
        self.assertEqual(usage.total_cost_usd, 1.0)
        self.assertEqual(usage.total_tokens, 1000)

    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.start", return_value=None)
    @patch("backend.modules.analysis_jobs.AnalysisJobWorker.stop", return_value=None)
    def test_label_job_quota_429_is_fallback_completed_and_non_chargeable(
        self,
        _worker_stop: object,
        _worker_start: object,
    ) -> None:
        storage = InMemoryMonthlyUsageStorage()
        service = CostGuardrailService(storage, monthly_budget_usd=100.0)
        analyst = _AsyncJob429Analyst()

        with (
            patch.dict(
                os.environ,
                {
                    "LABEL_COST_GUARDRAIL_ENABLED": "1",
                    "LABEL_ESTIMATED_COST_USD_PER_REQUEST": "0.02",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            app.state.analyst = analyst
            app.state.label_cost_guardrail = service
            app.state.label_rollout_kpi_thresholds = KpiThresholds()
            submit = client.post(
                "/analyze/jobs",
                files={"file": ("label.jpg", _build_high_quality_label_bytes(), "image/jpeg")},
                data={"allergy_info": "None", "locale": "ko-KR", "mode": "label"},
                headers={"X-Request-Id": "req-analysis-job-label-429"},
            )
            self.assertEqual(submit.status_code, 202)
            self._process_next_job_with_worker()
            polled = client.get(f"/analyze/jobs/{submit.json()['job_id']}")

        usage = storage.get(service._period_key())
        payload = polled.json()
        self.assertEqual(polled.status_code, 200)
        self.assertEqual(payload["status"], "fallback_completed")
        self.assertEqual(payload["fallback_reason"], "quota_exhausted_429")
        self.assertEqual(analyst.label_calls, 1)
        self.assertEqual(usage.total_cost_usd, 0.0)
        self.assertEqual(usage.total_tokens, 0)
        self.assertNotIn("_label_partial", payload)
        self.assertNotIn("_label_error_type", payload)

    def test_submit_job_returns_503_when_store_submit_job_fails(self) -> None:
        def raise_store_error(**_kwargs: object) -> None:
            raise AnalysisJobStoreError("db unavailable")

        with TestClient(app) as client:
            original_store = app.state.analysis_job_store
            app.state.analysis_job_store = SimpleNamespace(submit_job=raise_store_error)
            try:
                with self.assertLogs("foodlens.api", level="ERROR") as captured:
                    response = client.post(
                        "/analyze/jobs",
                        files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                        data={"allergy_info": "None", "locale": "ko-KR", "mode": "food"},
                        headers={"X-Request-Id": "req-analysis-job-store-fail"},
                    )
            finally:
                app.state.analysis_job_store = original_store

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["request_id"], "req-analysis-job-store-fail")
        self.assertEqual(response.json()["detail"]["code"], "ANALYZE_FAILED")
        self.assertIn("submit failed", "\n".join(captured.output))

    @patch("backend.server._analysis_job_remote_worker_readiness", return_value=(False, None))
    def test_submit_job_returns_503_when_remote_worker_heartbeat_is_missing(
        self,
        _analysis_job_remote_worker_readiness: object,
    ) -> None:
        with TestClient(app) as client:
            with self.assertLogs("foodlens.api", level="ERROR") as captured:
                response = client.post(
                    "/analyze/jobs",
                    files={"file": ("food.jpg", _build_image_bytes(), "image/jpeg")},
                    data={"allergy_info": "None", "locale": "ko-KR", "mode": "food"},
                    headers={"X-Request-Id": "req-analysis-job-worker-missing"},
                )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers["Retry-After"], "15")
        self.assertEqual(response.json()["detail"]["request_id"], "req-analysis-job-worker-missing")
        self.assertEqual(response.json()["detail"]["code"], "SERVICE_UNAVAILABLE")
        self.assertIn("submit blocked", "\n".join(captured.output))

    def test_get_job_status_returns_503_when_store_get_job_fails(self) -> None:
        def raise_store_error(*, job_id: str) -> None:
            del job_id
            raise AnalysisJobStoreError("db unavailable")

        with TestClient(app) as client:
            original_store = app.state.analysis_job_store
            app.state.analysis_job_store = SimpleNamespace(get_job=raise_store_error)
            try:
                with self.assertLogs("foodlens.api", level="ERROR") as captured:
                    response = client.get(
                        "/analyze/jobs/job_test_store_fail",
                        headers={"X-Request-Id": "req-analysis-job-poll-store-fail"},
                    )
            finally:
                app.state.analysis_job_store = original_store

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["request_id"], "req-analysis-job-poll-store-fail")
        self.assertEqual(response.json()["detail"]["code"], "ANALYZE_FAILED")
        self.assertIn("poll failed", "\n".join(captured.output))

    def test_nutrition_service_returns_unavailable_when_budget_is_exceeded(self) -> None:
        service = NutritionEnrichmentService(
            cache_store=InMemoryNutritionCacheStore(),
            lookup_func=lambda _name, _origin: time.sleep(0.1) or None,
            budget_seconds=0.01,
            max_parallelism=1,
        )

        result = asyncio.run(
            service.enrich(
                result={
                    "foodName": "Slow Dish",
                    "foodOrigin": "unknown",
                    "safetyStatus": "SAFE",
                    "ingredients": [{"name": "Ingredient A", "bbox": [0, 0, 1, 1], "isAllergen": False}],
                }
            )
        )

        self.assertEqual(result.fallback_reason, "nutrition_unavailable")
        self.assertEqual(result.result["nutrition"]["dataSource"], "Unavailable")

    def test_in_memory_job_store_reclaims_expired_lease(self) -> None:
        store = InMemoryAnalysisJobStore()
        payload = create_analysis_job_payload(
            request_id="req-analysis-job-store",
            mode="food",
            allergy_info="None",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=b"abc",
            image_sha256="hash",
            poll_after_ms=1000,
        )
        store.create_job(
            job_id=payload.job_id,
            request_id=payload.request_id,
            mode=payload.mode,
            allergy_info=payload.allergy_info,
            iso_country_code=payload.iso_country_code,
            locale=payload.locale,
            content_type=payload.content_type,
            image_base64=payload.image_base64,
            image_sha256=payload.image_sha256,
            accepted_at=payload.accepted_at,
            poll_after_ms=payload.poll_after_ms,
        )

        first = store.claim_next_job(
            worker_id="worker-a",
            lease_seconds=60,
            now=payload.accepted_at,
        )
        assert first is not None
        store.update_job(
            job_id=payload.job_id,
            updates={"lease_expires_at": payload.accepted_at},
        )

        second = store.claim_next_job(
            worker_id="worker-b",
            lease_seconds=60,
            now=payload.accepted_at,
        )

        assert second is not None
        self.assertEqual(second["worker_id"], "worker-b")

    def test_in_memory_job_store_scrubs_user_jobs(self) -> None:
        store = InMemoryAnalysisJobStore()
        scrubbed_at = datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc)
        deleted_payload = create_analysis_job_payload(
            request_id="req-analysis-job-delete-user",
            mode="food",
            allergy_info="peanut, shellfish",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=b"user-image",
            image_sha256="user-image-sha256",
            poll_after_ms=1000,
        )
        retained_payload = create_analysis_job_payload(
            request_id="req-analysis-job-retain-user",
            mode="food",
            allergy_info="sesame",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=b"other-user-image",
            image_sha256="other-user-image-sha256",
            poll_after_ms=1000,
        )
        deleted_record: dict[str, Any] = store.submit_job(
            job_id=deleted_payload.job_id,
            user_id=" user-delete ",
            idempotency_key="delete-key",
            request_id=deleted_payload.request_id,
            mode=deleted_payload.mode,
            allergy_info=deleted_payload.allergy_info,
            iso_country_code=deleted_payload.iso_country_code,
            locale=deleted_payload.locale,
            content_type=deleted_payload.content_type,
            image_base64=deleted_payload.image_base64,
            image_sha256=deleted_payload.image_sha256,
            accepted_at=deleted_payload.accepted_at,
            poll_after_ms=deleted_payload.poll_after_ms,
        )
        retained_record: dict[str, Any] = store.submit_job(
            job_id=retained_payload.job_id,
            user_id="user-retain",
            idempotency_key="retain-key",
            request_id=retained_payload.request_id,
            mode=retained_payload.mode,
            allergy_info=retained_payload.allergy_info,
            iso_country_code=retained_payload.iso_country_code,
            locale=retained_payload.locale,
            content_type=retained_payload.content_type,
            image_base64=retained_payload.image_base64,
            image_sha256=retained_payload.image_sha256,
            accepted_at=retained_payload.accepted_at,
            poll_after_ms=retained_payload.poll_after_ms,
        )
        store.update_job(
            job_id=deleted_payload.job_id,
            updates={
                "status": "completed",
                "result_json": {
                    "foodName": "Private Meal",
                    "ingredients": [{"name": "Peanut", "isAllergen": True}],
                },
                "updated_at": deleted_payload.accepted_at,
            },
        )

        scrubbed_count = store.scrub_jobs_for_user(user_id=" user-delete ", scrubbed_at=scrubbed_at)

        scrubbed_record: dict[str, Any] | None = store.get_job(job_id=deleted_payload.job_id)
        retained_after_scrub: dict[str, Any] | None = store.get_job(job_id=retained_payload.job_id)
        self.assertEqual(scrubbed_count, 1)
        assert scrubbed_record is not None
        self.assertIsNone(scrubbed_record["user_id"])
        self.assertIsNone(scrubbed_record["idempotency_key"])
        self.assertEqual(scrubbed_record["status"], "failed")
        self.assertEqual(scrubbed_record["allergy_info"], "")
        self.assertEqual(scrubbed_record["image_base64"], "")
        self.assertEqual(scrubbed_record["image_sha256"], "")
        self.assertIsNone(scrubbed_record["result_json"])
        self.assertIsNone(scrubbed_record["lease_expires_at"])
        self.assertIsNone(scrubbed_record["worker_id"])
        self.assertEqual(scrubbed_record["updated_at"], scrubbed_at)
        self.assertEqual(scrubbed_record["error_code"], "USER_DATA_DELETED")
        assert retained_after_scrub is not None
        self.assertEqual(retained_after_scrub["user_id"], retained_record["user_id"])
        self.assertEqual(retained_after_scrub["allergy_info"], retained_record["allergy_info"])
        self.assertEqual(retained_after_scrub["image_base64"], retained_record["image_base64"])
        self.assertEqual(retained_after_scrub["image_sha256"], retained_record["image_sha256"])
        self.assertEqual(deleted_record["allergy_info"], "peanut, shellfish")

    def test_in_memory_job_store_ttl_scrubs_expired_sensitive_payloads(self) -> None:
        store = InMemoryAnalysisJobStore()
        now = datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc)
        old_at = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        fresh_at = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
        old_record = store.submit_job(
            job_id="job-old-sensitive",
            user_id="user-old",
            idempotency_key="old-key",
            request_id="req-old-sensitive",
            mode="food",
            allergy_info="peanut",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_base64="b2xkLWltYWdl",
            image_sha256="old-sha256",
            accepted_at=old_at,
            poll_after_ms=1000,
        )
        fresh_record = store.submit_job(
            job_id="job-fresh-sensitive",
            user_id="user-fresh",
            idempotency_key="fresh-key",
            request_id="req-fresh-sensitive",
            mode="food",
            allergy_info="shellfish",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_base64="ZnJlc2gtaW1hZ2U=",
            image_sha256="fresh-sha256",
            accepted_at=fresh_at,
            poll_after_ms=1000,
        )
        store.update_job(
            job_id="job-old-sensitive",
            updates={
                "status": "completed",
                "result_json": {"foodName": "Private Old Meal"},
                "updated_at": old_at,
            },
        )
        store.update_job(
            job_id="job-fresh-sensitive",
            updates={
                "status": "completed",
                "result_json": {"foodName": "Private Fresh Meal"},
                "updated_at": fresh_at,
            },
        )

        result = store.scrub_expired_sensitive_payloads(
            cutoff_at=datetime(2026, 4, 16, 12, 0, 0, tzinfo=timezone.utc),
            scrubbed_at=now,
            limit=100,
            dry_run=False,
        )

        scrubbed_record = store.get_job(job_id="job-old-sensitive")
        retained_record = store.get_job(job_id="job-fresh-sensitive")
        self.assertEqual(result.target_count, 1)
        self.assertEqual(result.scrubbed_count, 1)
        assert scrubbed_record is not None
        assert retained_record is not None
        self.assertIsNone(scrubbed_record["user_id"])
        self.assertIsNone(scrubbed_record["idempotency_key"])
        self.assertEqual(scrubbed_record["status"], "failed")
        self.assertEqual(scrubbed_record["allergy_info"], "")
        self.assertEqual(scrubbed_record["image_base64"], "")
        self.assertEqual(scrubbed_record["image_sha256"], "")
        self.assertIsNone(scrubbed_record["result_json"])
        self.assertEqual(scrubbed_record["error_code"], SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE)
        self.assertEqual(scrubbed_record["updated_at"], now)
        self.assertEqual(retained_record["user_id"], fresh_record["user_id"])
        self.assertEqual(retained_record["idempotency_key"], fresh_record["idempotency_key"])
        self.assertEqual(retained_record["allergy_info"], fresh_record["allergy_info"])
        self.assertEqual(retained_record["image_base64"], fresh_record["image_base64"])
        self.assertEqual(retained_record["image_sha256"], fresh_record["image_sha256"])
        self.assertEqual(retained_record["result_json"], {"foodName": "Private Fresh Meal"})
        self.assertEqual(old_record["allergy_info"], "peanut")

    def test_in_memory_job_store_ttl_skips_active_worker_lease(self) -> None:
        store = InMemoryAnalysisJobStore()
        accepted_at = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        scrubbed_at = datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc)
        store.submit_job(
            job_id="job-active-ttl-sensitive",
            user_id="user-active",
            idempotency_key="active-key",
            request_id="req-active-ttl-sensitive",
            mode="food",
            allergy_info="peanut",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_base64="YWN0aXZlLWltYWdl",
            image_sha256="active-sha256",
            accepted_at=accepted_at,
            poll_after_ms=1000,
        )
        claimed = store.claim_next_job(
            worker_id="worker-active",
            lease_seconds=120,
            now=scrubbed_at,
        )

        result = store.scrub_expired_sensitive_payloads(
            cutoff_at=datetime(2026, 4, 16, 12, 0, 0, tzinfo=timezone.utc),
            scrubbed_at=scrubbed_at,
            limit=100,
            dry_run=False,
        )

        retained_record = store.get_job(job_id="job-active-ttl-sensitive")
        self.assertEqual(result.target_count, 0)
        self.assertEqual(result.scrubbed_count, 0)
        assert claimed is not None
        assert retained_record is not None
        self.assertEqual(retained_record["worker_id"], "worker-active")
        self.assertEqual(retained_record["allergy_info"], "peanut")
        self.assertEqual(retained_record["image_base64"], "YWN0aXZlLWltYWdl")
        self.assertIsNone(retained_record["error_code"])

    def test_in_memory_job_store_ttl_dry_run_does_not_mutate_jobs(self) -> None:
        store = InMemoryAnalysisJobStore()
        accepted_at = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        store.submit_job(
            job_id="job-ttl-dry-run",
            user_id="user-dry-run",
            idempotency_key="dry-run-key",
            request_id="req-ttl-dry-run",
            mode="food",
            allergy_info="milk",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_base64="ZHJ5LXJ1bg==",
            image_sha256="dry-run-sha256",
            accepted_at=accepted_at,
            poll_after_ms=1000,
        )
        store.update_job(
            job_id="job-ttl-dry-run",
            updates={
                "status": "completed",
                "result_json": {"foodName": "Private Dry Run Meal"},
                "updated_at": accepted_at,
            },
        )
        before = store.get_job(job_id="job-ttl-dry-run")

        result = store.scrub_expired_sensitive_payloads(
            cutoff_at=datetime(2026, 4, 16, 12, 0, 0, tzinfo=timezone.utc),
            scrubbed_at=datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc),
            limit=100,
            dry_run=True,
        )
        after = store.get_job(job_id="job-ttl-dry-run")

        self.assertEqual(result.target_count, 1)
        self.assertEqual(result.scrubbed_count, 0)
        self.assertEqual(after, before)

    def test_in_memory_job_store_rejects_resurrecting_ttl_scrubbed_payloads(self) -> None:
        store = InMemoryAnalysisJobStore()
        accepted_at = datetime(2026, 4, 1, 12, 0, 0, tzinfo=timezone.utc)
        scrubbed_at = datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc)
        store.submit_job(
            job_id="job-ttl-race",
            user_id="user-ttl-race",
            idempotency_key="ttl-race-key",
            request_id="req-ttl-race",
            mode="food",
            allergy_info="peanut",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_base64="cmFjZQ==",
            image_sha256="race-sha256",
            accepted_at=accepted_at,
            poll_after_ms=1000,
        )
        store.scrub_expired_sensitive_payloads(
            cutoff_at=datetime(2026, 4, 16, 12, 0, 0, tzinfo=timezone.utc),
            scrubbed_at=scrubbed_at,
            limit=100,
            dry_run=False,
        )

        update_result = store.update_job(
            job_id="job-ttl-race",
            updates={
                "status": "completed",
                "result_json": {"foodName": "Private Race Meal"},
                "allergy_info": "peanut",
                "image_base64": "cmVzdXJyZWN0ZWQ=",
            },
        )

        self.assertEqual(update_result["status"], "failed")
        self.assertEqual(update_result["error_code"], SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE)
        self.assertEqual(update_result["allergy_info"], "")
        self.assertEqual(update_result["image_base64"], "")
        self.assertIsNone(update_result["result_json"])

    def test_in_memory_job_store_rejects_resurrecting_scrubbed_user_data(self) -> None:
        store = InMemoryAnalysisJobStore()
        scrubbed_at = datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc)
        payload = create_analysis_job_payload(
            request_id="req-analysis-job-scrub-race",
            mode="food",
            allergy_info="peanut",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=b"user-image",
            image_sha256="user-image-sha256",
            poll_after_ms=1000,
        )
        store.submit_job(
            job_id=payload.job_id,
            user_id="user-delete",
            idempotency_key=None,
            request_id=payload.request_id,
            mode=payload.mode,
            allergy_info=payload.allergy_info,
            iso_country_code=payload.iso_country_code,
            locale=payload.locale,
            content_type=payload.content_type,
            image_base64=payload.image_base64,
            image_sha256=payload.image_sha256,
            accepted_at=payload.accepted_at,
            poll_after_ms=payload.poll_after_ms,
        )

        store.scrub_jobs_for_user(user_id="user-delete", scrubbed_at=scrubbed_at)
        update_result = store.update_job(
            job_id=payload.job_id,
            updates={
                "status": "completed",
                "result_json": {"foodName": "Private Meal", "ingredients": [{"name": "Peanut"}]},
                "allergy_info": "peanut",
                "image_base64": payload.image_base64,
            },
        )

        self.assertEqual(update_result["status"], "failed")
        self.assertEqual(update_result["error_code"], "USER_DATA_DELETED")
        self.assertEqual(update_result["allergy_info"], "")
        self.assertEqual(update_result["image_base64"], "")
        self.assertIsNone(update_result["result_json"])

    def test_postgres_analysis_job_store_scrubs_user_jobs(self) -> None:
        row = _analysis_job_row("job_postgres_scrub")
        connection = _RecordingConnection(row=row, rowcount=2)
        connect = _RecordingConnect(connection)
        scrubbed_at = datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc)

        with patch.object(analysis_jobs, "_load_connect", return_value=connect):
            store = PostgresAnalysisJobStore(database_url="postgresql://example", table_name="analysis_jobs")
            scrubbed_count = store.scrub_jobs_for_user(user_id=" user-postgres ", scrubbed_at=scrubbed_at)

        scrub_statements = [
            sql for sql in connection.executed_sql if sql.startswith("UPDATE analysis_jobs SET user_id = NULL")
        ]
        self.assertEqual(scrubbed_count, 2)
        self.assertEqual(len(scrub_statements), 1)
        self.assertIn("idempotency_key = NULL", scrub_statements[0])
        self.assertIn("allergy_info = ''", scrub_statements[0])
        self.assertIn("image_base64 = ''", scrub_statements[0])
        self.assertIn("image_sha256 = ''", scrub_statements[0])
        self.assertIn("result_json = NULL", scrub_statements[0])
        self.assertIn("WHERE user_id = %s", scrub_statements[0])
        self.assertEqual(
            connection.executed_params[-1],
            ("2026-05-16T12:00:00Z", "USER_DATA_DELETED", "user-postgres"),
        )

    def test_postgres_analysis_job_store_ttl_scrubs_expired_sensitive_payloads(self) -> None:
        row = _analysis_job_row("job_postgres_ttl_scrub")
        connection = _RecordingConnection(row=row, rowcount=2)
        connection.fetchall_rows = [("job-postgres-ttl-1",), ("job-postgres-ttl-2",)]
        connect = _RecordingConnect(connection)
        cutoff_at = datetime(2026, 4, 16, 12, 0, 0, tzinfo=timezone.utc)
        scrubbed_at = datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc)

        with patch.object(analysis_jobs, "_load_connect", return_value=connect):
            store = PostgresAnalysisJobStore(database_url="postgresql://example", table_name="analysis_jobs")
            result = store.scrub_expired_sensitive_payloads(
                cutoff_at=cutoff_at,
                scrubbed_at=scrubbed_at,
                limit=50,
                dry_run=False,
            )

        ttl_statements = [
            sql for sql in connection.executed_sql if sql.startswith("WITH candidate AS")
        ]
        self.assertEqual(result.target_count, 2)
        self.assertEqual(result.scrubbed_count, 2)
        self.assertEqual(len(ttl_statements), 1)
        self.assertIn("accepted_at <= %s::timestamptz", ttl_statements[0])
        self.assertIn(
            "worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= %s::timestamptz",
            ttl_statements[0],
        )
        self.assertIn("COALESCE(error_code, '') NOT IN (%s, %s)", ttl_statements[0])
        self.assertIn("FOR UPDATE SKIP LOCKED", ttl_statements[0])
        self.assertIn("LIMIT %s", ttl_statements[0])
        self.assertIn("user_id = NULL", ttl_statements[0])
        self.assertIn("idempotency_key = NULL", ttl_statements[0])
        self.assertIn("allergy_info = ''", ttl_statements[0])
        self.assertIn("image_base64 = ''", ttl_statements[0])
        self.assertIn("image_sha256 = ''", ttl_statements[0])
        self.assertIn("result_json = NULL", ttl_statements[0])
        self.assertEqual(
            connection.executed_params[-1],
            (
                "2026-04-16T12:00:00Z",
                "2026-05-16T12:00:00Z",
                "USER_DATA_DELETED",
                SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE,
                50,
                "2026-05-16T12:00:00Z",
                SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE,
            ),
        )

    def test_postgres_analysis_job_store_ttl_dry_run_uses_select_without_update(self) -> None:
        row = _analysis_job_row("job_postgres_ttl_dry_run")
        connection = _RecordingConnection(row=row, rowcount=1)
        connection.fetchall_rows = [("job-postgres-ttl-dry-run",)]
        connect = _RecordingConnect(connection)

        with patch.object(analysis_jobs, "_load_connect", return_value=connect):
            store = PostgresAnalysisJobStore(database_url="postgresql://example", table_name="analysis_jobs")
            result = store.scrub_expired_sensitive_payloads(
                cutoff_at=datetime(2026, 4, 16, 12, 0, 0, tzinfo=timezone.utc),
                scrubbed_at=datetime(2026, 5, 16, 12, 0, 0, tzinfo=timezone.utc),
                limit=25,
                dry_run=True,
            )

        self.assertEqual(result.target_count, 1)
        self.assertEqual(result.scrubbed_count, 0)
        dry_run_statements = [sql for sql in connection.executed_sql if sql.startswith("SELECT job_id FROM analysis_jobs")]
        self.assertEqual(len(dry_run_statements), 1)
        self.assertIn(
            "worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= %s::timestamptz",
            dry_run_statements[0],
        )
        self.assertFalse(any(sql.startswith("WITH candidate AS") for sql in connection.executed_sql))
        self.assertFalse(any(sql.startswith("UPDATE analysis_jobs") for sql in connection.executed_sql))

    def test_postgres_analysis_job_store_rejects_invalid_update_column(self) -> None:
        with patch.object(analysis_jobs, "_load_connect") as load_connect:
            store = PostgresAnalysisJobStore(database_url="postgresql://example", table_name="analysis_jobs")
            with self.assertRaises(AnalysisJobStoreError) as captured:
                store.update_job(
                    job_id="job_postgres_invalid_update",
                    updates={"status = 'completed'": "ignored"},
                )

        self.assertIn("Invalid analysis job update columns", str(captured.exception))
        self.assertIn("status = 'completed'", str(captured.exception))
        load_connect.assert_not_called()

    def test_postgres_analysis_job_store_returns_scrubbed_record_when_update_races_deletion(self) -> None:
        scrubbed_row_parts = list(_analysis_job_row("job_postgres_scrubbed_update"))
        scrubbed_row_parts[1] = None
        scrubbed_row_parts[2] = None
        scrubbed_row_parts[5] = "failed"
        scrubbed_row_parts[6] = ""
        scrubbed_row_parts[10] = ""
        scrubbed_row_parts[11] = ""
        scrubbed_row_parts[23] = "USER_DATA_DELETED"
        scrubbed_row_parts[25] = None
        scrubbed_row = tuple(scrubbed_row_parts)
        connection = _RecordingConnection(row=scrubbed_row, rowcount=0)
        connection.fetch_rows = [None, scrubbed_row]
        connect = _RecordingConnect(connection)

        with patch.object(analysis_jobs, "_load_connect", return_value=connect):
            store = PostgresAnalysisJobStore(database_url="postgresql://example", table_name="analysis_jobs")
            update_result = store.update_job(
                job_id="job_postgres_scrubbed_update",
                updates={
                    "status": "completed",
                    "allergy_info": "peanut",
                    "image_base64": "cGVhbnV0LWltYWdl",
                    "result_json": {"foodName": "Private Meal"},
                },
            )

        self.assertEqual(update_result["status"], "failed")
        self.assertEqual(update_result["error_code"], "USER_DATA_DELETED")
        self.assertEqual(update_result["allergy_info"], "")
        self.assertEqual(update_result["image_base64"], "")
        self.assertIsNone(update_result["result_json"])
        self.assertTrue(any("COALESCE(error_code, '') NOT IN (%s, %s)" in sql for sql in connection.executed_sql))

    def test_postgres_analysis_job_store_initializes_schema_once(self) -> None:
        row = _analysis_job_row("job_postgres_1")
        connection = _RecordingConnection(row=row, rowcount=1)
        connect = _RecordingConnect(connection)

        with patch.object(analysis_jobs, "_load_connect", return_value=connect):
            store = PostgresAnalysisJobStore(database_url="postgresql://example", table_name="analysis_jobs")

            payload = create_analysis_job_payload(
                request_id="req-analysis-job-postgres",
                mode="food",
                allergy_info="None",
                iso_country_code="US",
                locale="en-US",
                content_type="image/jpeg",
                image_bytes=b"abc",
                image_sha256="sha256",
                poll_after_ms=1000,
            )
            store.create_job(
                job_id=payload.job_id,
                request_id=payload.request_id,
                mode=payload.mode,
                allergy_info=payload.allergy_info,
                iso_country_code=payload.iso_country_code,
                locale=payload.locale,
                content_type=payload.content_type,
                image_base64=payload.image_base64,
                image_sha256=payload.image_sha256,
                accepted_at=payload.accepted_at,
                poll_after_ms=payload.poll_after_ms,
            )
            self.assertIsNotNone(store.get_job(job_id=payload.job_id))
            self.assertIsNotNone(
                store.claim_next_job(
                    worker_id="worker-1",
                    lease_seconds=60,
                    now=payload.accepted_at,
                )
            )
            self.assertIsNotNone(
                store.update_job(
                    job_id=payload.job_id,
                    updates={"status": "completed", "updated_at": payload.accepted_at},
                )
            )

        create_table_statements = [
            sql for sql in connection.executed_sql if "CREATE TABLE IF NOT EXISTS analysis_jobs" in sql
        ]
        insert_statements = [sql for sql in connection.executed_sql if sql.startswith("INSERT INTO analysis_jobs")]
        self.assertEqual(len(create_table_statements), 1)
        self.assertEqual(connect.calls[0][1], {"autocommit": True})
        self.assertEqual(len(insert_statements), 1)
        self.assertIn("%s,%s::jsonb,NULL,NULL,NULL,NULL,NULL,NULL)", insert_statements[0])
        self.assertTrue(any(sql.startswith("SELECT job_id") for sql in connection.executed_sql))
        self.assertTrue(any(sql.startswith("WITH candidate AS") for sql in connection.executed_sql))
        self.assertTrue(any(sql.startswith("UPDATE analysis_jobs SET") for sql in connection.executed_sql))
        self.assertTrue(any("COALESCE(error_code, '') NOT IN (%s, %s)" in sql for sql in connection.executed_sql))


if __name__ == "__main__":
    unittest.main()
