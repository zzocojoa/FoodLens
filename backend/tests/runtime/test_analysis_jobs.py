import asyncio
import io
import os
import time
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

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
from backend.modules.ops.cost_guardrail import CostGuardrailService, InMemoryMonthlyUsageStorage
from backend.modules.ops.rollout_control import KpiThresholds
from backend.modules.server_bootstrap import decode_upload_to_image


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["ANALYSIS_JOB_BACKEND"] = "memory"
os.environ["ANALYSIS_NUTRITION_CACHE_BACKEND"] = "memory"
from backend.server import app, resolve_prompt_country_code  # noqa: E402
from backend.server import _analyze_food_job_image_with_policy  # noqa: E402
from backend.server import _analyze_label_image_with_policy  # noqa: E402


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
            "prompt_version": "food-v3.2-context-engineered",
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


class AnalysisJobRuntimeTests(unittest.TestCase):
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
        self.assertEqual(terminal_payload["prompt_version"], "food-v3.2-context-engineered")
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
