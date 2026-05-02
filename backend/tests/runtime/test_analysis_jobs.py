import asyncio
import io
import os
import time
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

import backend.modules.analysis_jobs as analysis_jobs
from backend.modules.analysis_jobs import (
    AnalysisJobStoreError,
    AnalysisJobWorker,
    InMemoryAnalysisJobStore,
    InMemoryNutritionCacheStore,
    PostgresAnalysisJobStore,
    NutritionEnrichmentService,
    create_analysis_job_payload,
)
from backend.modules.server_bootstrap import decode_upload_to_image


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["ANALYSIS_JOB_BACKEND"] = "memory"
os.environ["ANALYSIS_NUTRITION_CACHE_BACKEND"] = "memory"
from backend.server import app, resolve_prompt_country_code  # noqa: E402


def _build_image_bytes() -> bytes:
    image = Image.new("RGB", (320, 240), (220, 180, 120))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def _analysis_job_row(job_id: str) -> tuple[object, ...]:
    accepted_at = datetime(2026, 3, 1, 0, 0, 0, tzinfo=timezone.utc)
    updated_at = datetime(2026, 3, 1, 0, 0, 5, tzinfo=timezone.utc)
    return (
        job_id,
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


class _RecordingCursor:
    def __init__(self, connection: "_RecordingConnection") -> None:
        self.connection = connection

    def execute(self, sql: str, params: tuple[object, ...] | None = None) -> None:
        self.connection.executed_sql.append(sql)
        self.connection.executed_params.append(params)

    def fetchone(self) -> tuple[object, ...] | None:
        return self.connection.row

    def __enter__(self) -> "_RecordingCursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class _RecordingConnection:
    def __init__(self, row: tuple[object, ...]) -> None:
        self.row = row
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
    label_model_name = "gemini-2.5-pro"

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
            "prompt_version": "food-v3.2-context-engineered",
        }

    def analyze_label_json(self, *_args, **_kwargs):
        return {
            "foodName": "Bibimbap Label",
            "safetyStatus": "SAFE",
            "ingredients": [],
            "raw_result": "Safe to eat.",
            "used_model": self.label_model_name,
            "prompt_version": "label-v1.2-2pass-locale-country",
        }


class AnalysisJobRuntimeTests(unittest.TestCase):
    def _build_worker(self) -> AnalysisJobWorker:
        def build_unexpected_label_handler(_request_id: str, _started_at: float, _preprocess_ms: int):
            async def handler(_image, _allergy_info: str, _iso_country_code: str, _locale: str | None):
                raise AssertionError("label handler should not be used for food jobs")

            return handler

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
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            build_label_analysis_handler=build_unexpected_label_handler,
            build_smart_analysis_handler=lambda _request_id, _started_at, _preprocess_ms: None,
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

    def test_label_job_uses_runtime_label_handler_when_available(self) -> None:
        store = InMemoryAnalysisJobStore()
        payload = create_analysis_job_payload(
            request_id="req-analysis-job-label-handler",
            mode="label",
            allergy_info="None",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=_build_image_bytes(),
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
        handler_calls: list[tuple[str, str | None]] = []

        def build_handler(
            _request_id: str,
            _started_at: float,
            _preprocess_ms: int,
        ):
            async def handler(_image, _allergy_info: str, iso_country_code: str, locale: str | None):
                handler_calls.append((iso_country_code, locale))
                return {
                    "foodName": "Guarded Label",
                    "safetyStatus": "SAFE",
                    "ingredients": [],
                    "raw_result": "ok",
                    "used_model": "gemini-2.5-flash",
                    "prompt_version": "label-v1.2-2pass-locale-country",
                }

            return handler

        worker = AnalysisJobWorker(
            store=store,
            nutrition_service=NutritionEnrichmentService(
                cache_store=InMemoryNutritionCacheStore(),
                lookup_func=lambda _name, _origin: None,
                budget_seconds=0.5,
                max_parallelism=1,
            ),
            get_analyst=lambda: _AsyncJobAnalyst(),
            get_smart_router=lambda: app.state.smart_router,
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            build_label_analysis_handler=build_handler,
            build_smart_analysis_handler=lambda _request_id, _started_at, _preprocess_ms: None,
            lease_seconds=60,
            poll_interval_seconds=0.1,
            worker_id="worker-label-handler",
        )
        claimed_job = store.claim_next_job(
            worker_id=worker.worker_id,
            lease_seconds=worker.lease_seconds,
            now=datetime.now(timezone.utc),
        )
        self.assertIsNotNone(claimed_job)

        asyncio.run(worker._process_job(claimed_job))
        completed = store.get_job(job_id=payload.job_id)

        self.assertEqual(handler_calls, [("US", "en-US")])
        self.assertIsNotNone(completed)
        assert completed is not None
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["result_json"]["foodName"], "Guarded Label")

    def test_label_job_fails_closed_without_runtime_label_handler(self) -> None:
        store = InMemoryAnalysisJobStore()
        payload = create_analysis_job_payload(
            request_id="req-analysis-job-label-missing-handler",
            mode="label",
            allergy_info="None",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=_build_image_bytes(),
            image_sha256="hash-missing-handler",
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

        worker = AnalysisJobWorker(
            store=store,
            nutrition_service=NutritionEnrichmentService(
                cache_store=InMemoryNutritionCacheStore(),
                lookup_func=lambda _name, _origin: None,
                budget_seconds=0.5,
                max_parallelism=1,
            ),
            get_analyst=lambda: _AsyncJobAnalyst(),
            get_smart_router=lambda: app.state.smart_router,
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            build_label_analysis_handler=lambda _request_id, _started_at, _preprocess_ms: None,
            build_smart_analysis_handler=lambda _request_id, _started_at, _preprocess_ms: None,
            lease_seconds=60,
            poll_interval_seconds=0.1,
            worker_id="worker-label-missing-handler",
        )
        claimed_job = store.claim_next_job(
            worker_id=worker.worker_id,
            lease_seconds=worker.lease_seconds,
            now=datetime.now(timezone.utc),
        )
        self.assertIsNotNone(claimed_job)

        asyncio.run(worker._process_job(claimed_job))
        completed = store.get_job(job_id=payload.job_id)

        self.assertIsNotNone(completed)
        assert completed is not None
        self.assertEqual(completed["status"], "failed")
        self.assertEqual(completed["error_code"], "ANALYSIS_JOB_FAILED")
        self.assertIn("build_label_analysis_handler must return a handler", completed["error_message"])

    def test_smart_job_passes_runtime_label_handler_to_router(self) -> None:
        class SmartRouterWithLabelHandler:
            def __init__(self) -> None:
                self.received_handler = None

            async def route_analysis(self, **kwargs):
                self.received_handler = kwargs.get("label_analysis_handler")
                result = await self.received_handler(
                    kwargs["image"],
                    kwargs["allergy_info"],
                    kwargs["iso_country_code"],
                    kwargs["locale"],
                )
                result["router_category"] = "NUTRITION_LABEL"
                return result

        store = InMemoryAnalysisJobStore()
        payload = create_analysis_job_payload(
            request_id="req-analysis-job-smart-handler",
            mode="smart",
            allergy_info="None",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=_build_image_bytes(),
            image_sha256="hash-smart",
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
        router = SmartRouterWithLabelHandler()
        handler_calls: list[tuple[str, str | None]] = []

        def build_handler(
            _request_id: str,
            _started_at: float,
            _preprocess_ms: int,
        ):
            async def handler(_image, _allergy_info: str, iso_country_code: str, locale: str | None):
                handler_calls.append((iso_country_code, locale))
                return {
                    "foodName": "Smart Guarded Label",
                    "safetyStatus": "SAFE",
                    "ingredients": [],
                    "raw_result": "ok",
                    "used_model": "gemini-2.5-flash",
                    "prompt_version": "label-v1.2-2pass-locale-country",
                }

            return handler

        worker = AnalysisJobWorker(
            store=store,
            nutrition_service=NutritionEnrichmentService(
                cache_store=InMemoryNutritionCacheStore(),
                lookup_func=lambda _name, _origin: None,
                budget_seconds=0.5,
                max_parallelism=1,
            ),
            get_analyst=lambda: _AsyncJobAnalyst(),
            get_smart_router=lambda: router,
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            build_label_analysis_handler=build_handler,
            build_smart_analysis_handler=lambda _request_id, _started_at, _preprocess_ms: None,
            lease_seconds=60,
            poll_interval_seconds=0.1,
            worker_id="worker-smart-handler",
        )
        claimed_job = store.claim_next_job(
            worker_id=worker.worker_id,
            lease_seconds=worker.lease_seconds,
            now=datetime.now(timezone.utc),
        )
        self.assertIsNotNone(claimed_job)

        asyncio.run(worker._process_job(claimed_job))
        completed = store.get_job(job_id=payload.job_id)

        self.assertIsNotNone(router.received_handler)
        self.assertEqual(handler_calls, [("US", "en-US")])
        self.assertIsNotNone(completed)
        assert completed is not None
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["result_json"]["foodName"], "Smart Guarded Label")

    def test_smart_job_uses_runtime_smart_handler_when_available(self) -> None:
        class UnexpectedSmartRouter:
            async def route_analysis(self, **_kwargs):
                raise AssertionError("smart router should be called through runtime smart handler")

        store = InMemoryAnalysisJobStore()
        payload = create_analysis_job_payload(
            request_id="req-analysis-job-smart-runtime-handler",
            mode="smart",
            allergy_info="None",
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_bytes=_build_image_bytes(),
            image_sha256="hash-smart-runtime",
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
        smart_handler_calls: list[tuple[str, str | None]] = []

        def build_label_handler(
            _request_id: str,
            _started_at: float,
            _preprocess_ms: int,
        ):
            async def handler(_image, _allergy_info: str, iso_country_code: str, locale: str | None):
                return {
                    "foodName": "Label handler should be delegated",
                    "safetyStatus": "SAFE",
                    "ingredients": [],
                    "raw_result": "ok",
                    "used_model": "gemini-2.5-flash",
                    "prompt_version": "label-v1.2-2pass-locale-country",
                }

            return handler

        def build_smart_handler(
            _request_id: str,
            _started_at: float,
            _preprocess_ms: int,
        ):
            async def handler(
                _image,
                _allergy_info: str,
                iso_country_code: str,
                locale: str | None,
                _label_analysis_handler,
            ):
                smart_handler_calls.append((iso_country_code, locale))
                return {
                    "foodName": "Smart Runtime Guarded",
                    "safetyStatus": "SAFE",
                    "ingredients": [],
                    "raw_result": "ok",
                    "router_category": "REAL_FOOD",
                    "used_model": "gemini-2.0-flash",
                    "prompt_version": "food-v3.2-context-engineered",
                }

            return handler

        worker = AnalysisJobWorker(
            store=store,
            nutrition_service=NutritionEnrichmentService(
                cache_store=InMemoryNutritionCacheStore(),
                lookup_func=lambda _name, _origin: None,
                budget_seconds=0.5,
                max_parallelism=1,
            ),
            get_analyst=lambda: _AsyncJobAnalyst(),
            get_smart_router=lambda: UnexpectedSmartRouter(),
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            build_label_analysis_handler=build_label_handler,
            build_smart_analysis_handler=build_smart_handler,
            lease_seconds=60,
            poll_interval_seconds=0.1,
            worker_id="worker-smart-runtime-handler",
        )
        claimed_job = store.claim_next_job(
            worker_id=worker.worker_id,
            lease_seconds=worker.lease_seconds,
            now=datetime.now(timezone.utc),
        )
        self.assertIsNotNone(claimed_job)

        asyncio.run(worker._process_job(claimed_job))
        completed = store.get_job(job_id=payload.job_id)

        self.assertEqual(smart_handler_calls, [("US", "en-US")])
        self.assertIsNotNone(completed)
        assert completed is not None
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["result_json"]["foodName"], "Smart Runtime Guarded")

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
        self.assertEqual(terminal_payload["prompt_version"], "food-v3.2-context-engineered")
        self.assertIn("latency_ms_by_stage", terminal_payload)
        self.assertEqual(terminal_payload["nutrition"]["dataSource"], "TestCache")

    def test_submit_job_returns_503_when_store_create_job_fails(self) -> None:
        def raise_store_error(**_kwargs: object) -> None:
            raise AnalysisJobStoreError("db unavailable")

        with TestClient(app) as client:
            original_store = app.state.analysis_job_store
            app.state.analysis_job_store = SimpleNamespace(create_job=raise_store_error)
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

    def test_postgres_analysis_job_store_initializes_schema_once(self) -> None:
        row = _analysis_job_row("job_postgres_1")
        connection = _RecordingConnection(row=row)
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


if __name__ == "__main__":
    unittest.main()
