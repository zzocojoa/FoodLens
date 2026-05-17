from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any, Awaitable, Callable, Protocol
from uuid import uuid4

from backend.modules.analyst_core.prompts import ANALYSIS_PROMPT_VERSION
from backend.modules.analyst_core.response_utils import get_safe_fallback_response
from backend.modules.analyst_runtime.food_analyst import FoodAnalyst
from backend.modules.runtime_guardrails import ErrorCode, log_exception

logger = logging.getLogger("foodlens.analysis_jobs")


TERMINAL_JOB_STATUSES = {"completed", "fallback_completed", "failed"}
USER_DATA_DELETED_ERROR_CODE = "USER_DATA_DELETED"
SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE = "ANALYSIS_JOB_TTL_SCRUBBED"
PRIVACY_TOMBSTONE_ERROR_CODES: frozenset[str] = frozenset(
    (USER_DATA_DELETED_ERROR_CODE, SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE)
)
PROGRESS_HINTS = {
    "queued": "queued",
    "preprocessing": "preprocessing_image",
    "inference": "running_model_inference",
    "nutrition": "enriching_nutrition",
    "finalizing": "finalizing_result",
    "completed": "completed",
    "fallback_completed": "completed_with_fallback",
    "failed": "failed",
}
FALLBACK_ERROR_NAMES = {"Error Analyzing Food", "Not Food", "분석 오류", "Analysis Error"}
ANALYSIS_JOB_ROW_COLUMNS: tuple[str, ...] = (
    "job_id",
    "user_id",
    "idempotency_key",
    "request_id",
    "mode",
    "status",
    "allergy_info",
    "iso_country_code",
    "locale",
    "content_type",
    "image_base64",
    "image_sha256",
    "accepted_at",
    "started_at",
    "updated_at",
    "lease_expires_at",
    "worker_id",
    "attempt_count",
    "poll_after_ms",
    "stage_latencies_ms",
    "used_model",
    "prompt_version",
    "fallback_reason",
    "error_code",
    "error_message",
    "result_json",
)
ANALYSIS_JOB_ROW_COLUMNS_SQL: str = ",".join(ANALYSIS_JOB_ROW_COLUMNS)
ANALYSIS_JOB_MUTABLE_COLUMNS: frozenset[str] = frozenset(
    column for column in ANALYSIS_JOB_ROW_COLUMNS if column != "job_id"
)


class AnalysisJobStoreError(Exception):
    pass


class NutritionCacheStoreError(Exception):
    pass


class AnalysisJobStore(Protocol):
    def create_job(
        self,
        *,
        job_id: str,
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
    ) -> None:
        ...

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
        ...

    def get_job(self, *, job_id: str) -> dict[str, Any] | None:
        ...

    def claim_next_job(self, *, worker_id: str, lease_seconds: int, now: datetime) -> dict[str, Any] | None:
        ...

    def update_job(self, *, job_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        ...

    def scrub_jobs_for_user(self, *, user_id: str, scrubbed_at: datetime) -> int:
        ...

    def scrub_expired_sensitive_payloads(
        self,
        *,
        cutoff_at: datetime,
        scrubbed_at: datetime,
        limit: int,
        dry_run: bool,
    ) -> "AnalysisJobsSensitivePayloadScrubResult":
        ...


class NutritionCacheStore(Protocol):
    def get(self, *, cache_key: str) -> dict[str, Any] | None:
        ...

    def set(self, *, cache_key: str, payload: dict[str, Any], updated_at: datetime) -> None:
        ...


@dataclass(frozen=True)
class AnalysisJobCreatePayload:
    job_id: str
    request_id: str
    mode: str
    allergy_info: str
    iso_country_code: str
    locale: str | None
    content_type: str
    image_base64: str
    image_sha256: str
    accepted_at: datetime
    poll_after_ms: int


@dataclass(frozen=True)
class NutritionEnrichmentOutcome:
    result: dict[str, Any]
    cache_hit_count: int
    live_hit_count: int
    fallback_reason: str | None


@dataclass(frozen=True)
class AnalysisJobsSensitivePayloadScrubResult:
    target_count: int
    scrubbed_count: int
    dry_run: bool
    cutoff_at: datetime
    scrubbed_at: datetime


@dataclass
class AnalysisJobWorker:
    store: AnalysisJobStore
    nutrition_service: "NutritionEnrichmentService"
    get_analyst: Callable[[], Any]
    get_smart_router: Callable[[], Any]
    analyze_label_with_policy: Callable[[Any, str, str, str | None, str, float, int], Awaitable[dict[str, Any]]]
    analyze_food_with_policy: Callable[[Any, str, str, str, float, int], Awaitable[dict[str, Any]]]
    decode_image: Callable[[bytes], Any]
    resolve_prompt_country_code: Callable[[str, str | None], str]
    lease_seconds: int
    poll_interval_seconds: float
    worker_id: str
    _stop_event: asyncio.Event = field(default_factory=asyncio.Event)
    _task: asyncio.Task[None] | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self.run(), name=f"analysis-worker-{self.worker_id}")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                claimed = await asyncio.to_thread(
                    self.store.claim_next_job,
                    worker_id=self.worker_id,
                    lease_seconds=self.lease_seconds,
                    now=_utc_now(),
                )
            except Exception as error:
                if self._stop_event.is_set():
                    return
                logger.error(
                    "[AnalysisJob] claim failed worker_id=%s error=%s",
                    self.worker_id,
                    error,
                )
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
                except asyncio.TimeoutError:
                    continue
                return
            if claimed is None:
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=self.poll_interval_seconds)
                except asyncio.TimeoutError:
                    continue
                continue

            await self._process_job(claimed)

    async def _process_job(self, job: dict[str, Any]) -> None:
        request_id = str(job["request_id"])
        job_id = str(job["job_id"])
        started_at = time.perf_counter()
        stage_latencies = dict(job.get("stage_latencies_ms") or {})

        try:
            preprocess_started = time.perf_counter()
            await self._stage(job_id=job_id, status="preprocessing", request_id=request_id)
            image_bytes = base64.b64decode(str(job["image_base64"]).encode("utf-8"))
            image = await asyncio.to_thread(self.decode_image, image_bytes)
            image = await asyncio.to_thread(_resize_image_for_async_job, image)
            stage_latencies["preprocessing"] = int((time.perf_counter() - preprocess_started) * 1000)

            inference_started = time.perf_counter()
            await self._stage(job_id=job_id, status="inference", request_id=request_id, stage_latencies=stage_latencies)
            prompt_country_code = self.resolve_prompt_country_code(str(job["iso_country_code"]), job.get("locale"))
            if job["mode"] == "food":
                result = await self.analyze_food_with_policy(
                    image,
                    str(job["allergy_info"]),
                    prompt_country_code,
                    request_id,
                    started_at,
                    int(stage_latencies.get("preprocessing", 0)),
                )
            elif job["mode"] == "label":
                result = await self.analyze_label_with_policy(
                    image,
                    str(job["allergy_info"]),
                    prompt_country_code,
                    job.get("locale"),
                    request_id,
                    started_at,
                    int(stage_latencies.get("preprocessing", 0)),
                )
            else:
                smart_router = self.get_smart_router()
                result = await smart_router.route_analysis(
                    image=image,
                    allergy_info=str(job["allergy_info"]),
                    iso_country_code=prompt_country_code,
                    locale=job.get("locale"),
                    request_id=request_id,
                    total_started_at=started_at,
                    preprocess_elapsed_ms=int(stage_latencies.get("preprocessing", 0)),
                    label_analysis_runner=self.analyze_label_with_policy,
                    food_analysis_runner=self.analyze_food_with_policy,
                )
            stage_latencies["inference"] = int((time.perf_counter() - inference_started) * 1000)
            if isinstance(result, dict):
                result.pop("latency_ms", None)

            used_model = _string_or_none((result or {}).get("used_model"))
            prompt_version = _string_or_none((result or {}).get("prompt_version"))
            fallback_reason = _detect_analysis_fallback_reason(result=result, mode=str(job["mode"]))
            if isinstance(result, dict):
                for key in list(result.keys()):
                    if key.startswith("_label_") or key.startswith("_food_"):
                        result.pop(key, None)

            if job["mode"] == "food":
                nutrition_started = time.perf_counter()
                await self._stage(
                    job_id=job_id,
                    status="nutrition",
                    request_id=request_id,
                    stage_latencies=stage_latencies,
                    used_model=used_model,
                    prompt_version=prompt_version,
                    fallback_reason=fallback_reason,
                )
                nutrition_outcome = await self.nutrition_service.enrich(result=result)
                result = nutrition_outcome.result
                stage_latencies["nutrition"] = int((time.perf_counter() - nutrition_started) * 1000)
                if fallback_reason is None:
                    fallback_reason = nutrition_outcome.fallback_reason
            else:
                stage_latencies["nutrition"] = 0

            finalize_started = time.perf_counter()
            await self._stage(
                job_id=job_id,
                status="finalizing",
                request_id=request_id,
                stage_latencies=stage_latencies,
                used_model=used_model,
                prompt_version=prompt_version,
                fallback_reason=fallback_reason,
            )
            finalized_result = _finalize_analysis_result(
                result=result,
                request_id=request_id,
                used_model=used_model,
                prompt_version=prompt_version,
            )
            stage_latencies["finalizing"] = int((time.perf_counter() - finalize_started) * 1000)
            total_elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            status = "fallback_completed" if fallback_reason else "completed"
            payload = {
                "status": status,
                "updated_at": _utc_now(),
                "lease_expires_at": None,
                "worker_id": None,
                "stage_latencies_ms": stage_latencies,
                "used_model": used_model,
                "prompt_version": prompt_version,
                "fallback_reason": fallback_reason,
                "error_code": None,
                "error_message": None,
                "result_json": finalized_result,
            }
            record = await asyncio.to_thread(self.store.update_job, job_id=job_id, updates=payload)
            logger.info(
                "[AnalysisJob] completed request_id=%s job_id=%s status=%s latency_ms=%s used_model=%s prompt_version=%s fallback_reason=%s",
                request_id,
                job_id,
                status,
                {**stage_latencies, "total": total_elapsed_ms},
                used_model,
                prompt_version,
                fallback_reason,
            )
            _touch_sentry_scope(
                request_id=request_id,
                job_id=job_id,
                used_model=used_model,
                prompt_version=prompt_version,
                stage="completed",
                fallback_reason=fallback_reason,
                latency_ms=total_elapsed_ms,
            )
            return record
        except Exception as error:
            total_elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            stage_latencies["total"] = total_elapsed_ms
            payload = {
                "status": "failed",
                "updated_at": _utc_now(),
                "lease_expires_at": None,
                "worker_id": None,
                "stage_latencies_ms": stage_latencies,
                "error_code": "ANALYSIS_JOB_FAILED",
                "error_message": str(error),
            }
            await asyncio.to_thread(self.store.update_job, job_id=job_id, updates=payload)
            logger.error(
                "[AnalysisJob] failed request_id=%s job_id=%s latency_ms=%s error=%s",
                request_id,
                job_id,
                stage_latencies,
                error,
            )
            _touch_sentry_scope(
                request_id=request_id,
                job_id=job_id,
                used_model=None,
                prompt_version=None,
                stage="failed",
                fallback_reason=None,
                latency_ms=total_elapsed_ms,
            )
            log_exception(
                endpoint="/analyze/jobs/worker",
                request_id=request_id,
                error=error if isinstance(error, Exception) else RuntimeError(str(error)),
                code=ErrorCode.ANALYZE_FAILED,
            )

    async def _stage(
        self,
        *,
        job_id: str,
        status: str,
        request_id: str,
        stage_latencies: dict[str, int] | None = None,
        used_model: str | None = None,
        prompt_version: str | None = None,
        fallback_reason: str | None = None,
    ) -> None:
        updates: dict[str, Any] = {
            "status": status,
            "updated_at": _utc_now(),
            "worker_id": self.worker_id,
            "lease_expires_at": _utc_now() + timedelta(seconds=self.lease_seconds),
        }
        if stage_latencies is not None:
            updates["stage_latencies_ms"] = stage_latencies
        if used_model is not None:
            updates["used_model"] = used_model
        if prompt_version is not None:
            updates["prompt_version"] = prompt_version
        if fallback_reason is not None:
            updates["fallback_reason"] = fallback_reason
        await asyncio.to_thread(self.store.update_job, job_id=job_id, updates=updates)
        logger.info(
            "[AnalysisJob] stage request_id=%s job_id=%s stage=%s latency_ms=%s used_model=%s prompt_version=%s fallback_reason=%s",
            request_id,
            job_id,
            status,
            stage_latencies or {},
            used_model,
            prompt_version,
            fallback_reason,
        )


@dataclass
class NutritionEnrichmentService:
    cache_store: NutritionCacheStore
    lookup_func: callable
    budget_seconds: float
    max_parallelism: int

    async def enrich(self, *, result: dict[str, Any]) -> NutritionEnrichmentOutcome:
        ingredients = result.get("ingredients")
        if not isinstance(ingredients, list) or len(ingredients) == 0:
            enriched = dict(result)
            enriched["nutrition"] = _build_unavailable_nutrition()
            return NutritionEnrichmentOutcome(
                result=enriched,
                cache_hit_count=0,
                live_hit_count=0,
                fallback_reason="nutrition_unavailable",
            )

        unique_ingredients = _iter_unique_ingredients(ingredients=ingredients)
        if len(unique_ingredients) == 0:
            enriched = dict(result)
            enriched["nutrition"] = _build_unavailable_nutrition()
            return NutritionEnrichmentOutcome(
                result=enriched,
                cache_hit_count=0,
                live_hit_count=0,
                fallback_reason="nutrition_unavailable",
            )

        origin = _string_or_none(result.get("foodOrigin")) or "unknown"
        cache_hits: dict[str, dict[str, Any]] = {}
        misses: list[tuple[dict[str, Any], str, str]] = []
        for ingredient, name in unique_ingredients:
            cache_key = _build_nutrition_cache_key(name=name, origin=origin)
            cached = await asyncio.to_thread(self.cache_store.get, cache_key=cache_key)
            if cached and _has_calories(cached):
                cache_hits[name.lower()] = cached
            else:
                misses.append((ingredient, name, cache_key))

        live_hits: dict[str, dict[str, Any]] = {}
        if misses:
            semaphore = asyncio.Semaphore(max(1, self.max_parallelism))

            async def _lookup(entry: tuple[dict[str, Any], str, str]) -> tuple[str, dict[str, Any] | None]:
                _ingredient, name, cache_key = entry
                async with semaphore:
                    value = await asyncio.to_thread(self.lookup_func, name, origin)
                    if value and _has_calories(value):
                        await asyncio.to_thread(
                            self.cache_store.set,
                            cache_key=cache_key,
                            payload=value,
                            updated_at=_utc_now(),
                        )
                    return name.lower(), value

            tasks = [asyncio.create_task(_lookup(entry)) for entry in misses]
            done, pending = await asyncio.wait(tasks, timeout=self.budget_seconds)
            for pending_task in pending:
                pending_task.cancel()
            for done_task in done:
                key, value = done_task.result()
                if value and _has_calories(value):
                    live_hits[key] = value

        combined_hits = {**cache_hits, **live_hits}
        enriched_ingredients: list[dict[str, Any]] = []
        total_nutrition = _build_empty_total_nutrition()
        has_any_nutrition = False
        sources: set[str] = set()

        for ingredient in ingredients:
            if not isinstance(ingredient, dict):
                continue
            copied = dict(ingredient)
            name = _normalize_lookup_name(str(copied.get("name") or ""))
            nutrition = combined_hits.get(name.lower())
            if nutrition and _has_calories(nutrition):
                copied["nutrition"] = nutrition
                _accumulate_total_nutrition(total_nutrition=total_nutrition, nutrition=nutrition)
                source = _string_or_none(nutrition.get("dataSource")) or "Unknown"
                sources.add(source)
                has_any_nutrition = True
            enriched_ingredients.append(copied)

        enriched_result = dict(result)
        enriched_result["ingredients"] = enriched_ingredients
        if has_any_nutrition:
            total_nutrition["dataSource"] = " + ".join(sorted(sources)) if sources else "Unknown"
            enriched_result["nutrition"] = total_nutrition
            fallback_reason = None
        else:
            enriched_result["nutrition"] = _build_unavailable_nutrition()
            fallback_reason = "nutrition_unavailable"

        return NutritionEnrichmentOutcome(
            result=enriched_result,
            cache_hit_count=len(cache_hits),
            live_hit_count=len(live_hits),
            fallback_reason=fallback_reason,
        )


@dataclass(slots=True)
class InMemoryAnalysisJobStore:
    _jobs: dict[str, dict[str, Any]] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def create_job(
        self,
        *,
        job_id: str,
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
    ) -> None:
        self.submit_job(
            job_id=job_id,
            user_id=None,
            idempotency_key=None,
            request_id=request_id,
            mode=mode,
            allergy_info=allergy_info,
            iso_country_code=iso_country_code,
            locale=locale,
            content_type=content_type,
            image_base64=image_base64,
            image_sha256=image_sha256,
            accepted_at=accepted_at,
            poll_after_ms=poll_after_ms,
        )

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
        normalized_user_id, normalized_idempotency_key = _normalize_submit_identity(
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        with self._lock:
            if normalized_user_id is not None and normalized_idempotency_key is not None:
                for record in self._jobs.values():
                    if (
                        record.get("user_id") == normalized_user_id
                        and record.get("idempotency_key") == normalized_idempotency_key
                    ):
                        reused_record = _copy_job_record(record)
                        reused_record["idempotency_reused"] = True
                        return reused_record

            record = _build_analysis_job_record(
                job_id=job_id,
                user_id=normalized_user_id,
                idempotency_key=normalized_idempotency_key,
                request_id=request_id,
                mode=mode,
                allergy_info=allergy_info,
                iso_country_code=iso_country_code,
                locale=locale,
                content_type=content_type,
                image_base64=image_base64,
                image_sha256=image_sha256,
                accepted_at=accepted_at,
                poll_after_ms=poll_after_ms,
            )
            self._jobs[job_id] = record
            return _copy_job_record(record)

    def get_job(self, *, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                return None
            return _copy_job_record(record)

    def claim_next_job(self, *, worker_id: str, lease_seconds: int, now: datetime) -> dict[str, Any] | None:
        with self._lock:
            queued = sorted(self._jobs.values(), key=lambda item: item["accepted_at"])
            for record in queued:
                if record["status"] in TERMINAL_JOB_STATUSES:
                    continue
                lease_expires_at = record.get("lease_expires_at")
                if record.get("worker_id") and isinstance(lease_expires_at, datetime) and lease_expires_at > now:
                    continue
                record["worker_id"] = worker_id
                record["lease_expires_at"] = now + timedelta(seconds=lease_seconds)
                record["started_at"] = record.get("started_at") or now
                record["updated_at"] = now
                record["attempt_count"] = int(record.get("attempt_count") or 0) + 1
                return _copy_job_record(record)
        return None

    def update_job(self, *, job_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        _validate_analysis_job_update_columns(updates=updates)
        with self._lock:
            existing = self._jobs.get(job_id)
            if existing is None:
                raise AnalysisJobStoreError(f"Job not found: {job_id}")
            if _is_privacy_tombstone_record(record=existing):
                return _copy_job_record(existing)
            merged = dict(existing)
            merged.update(updates)
            self._jobs[job_id] = merged
            return _copy_job_record(merged)

    def scrub_jobs_for_user(self, *, user_id: str, scrubbed_at: datetime) -> int:
        normalized_user_id = _normalize_required_user_id(user_id=user_id)
        with self._lock:
            matching_job_ids = [
                job_id
                for job_id, record in self._jobs.items()
                if record.get("user_id") == normalized_user_id
            ]
            for job_id in matching_job_ids:
                self._jobs[job_id] = _scrub_analysis_job_record(
                    record=self._jobs[job_id],
                    scrubbed_at=scrubbed_at,
                )
            return len(matching_job_ids)

    def scrub_expired_sensitive_payloads(
        self,
        *,
        cutoff_at: datetime,
        scrubbed_at: datetime,
        limit: int,
        dry_run: bool,
    ) -> AnalysisJobsSensitivePayloadScrubResult:
        effective_limit = max(0, limit)
        with self._lock:
            eligible_job_ids = [
                job_id
                for job_id, record in sorted(self._jobs.items(), key=lambda item: item[1]["accepted_at"])
                if _is_analysis_job_sensitive_payload_ttl_eligible(
                    record=record,
                    cutoff_at=cutoff_at,
                    scrubbed_at=scrubbed_at,
                )
            ][:effective_limit]
            if not dry_run:
                for job_id in eligible_job_ids:
                    self._jobs[job_id] = _scrub_analysis_job_sensitive_payload_record(
                        record=self._jobs[job_id],
                        scrubbed_at=scrubbed_at,
                    )
            return AnalysisJobsSensitivePayloadScrubResult(
                target_count=len(eligible_job_ids),
                scrubbed_count=0 if dry_run else len(eligible_job_ids),
                dry_run=dry_run,
                cutoff_at=cutoff_at,
                scrubbed_at=scrubbed_at,
            )


@dataclass(slots=True)
class InMemoryNutritionCacheStore:
    _entries: dict[str, dict[str, Any]] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def get(self, *, cache_key: str) -> dict[str, Any] | None:
        with self._lock:
            payload = self._entries.get(cache_key)
            if payload is None:
                return None
            return dict(payload)

    def set(self, *, cache_key: str, payload: dict[str, Any], updated_at: datetime) -> None:
        with self._lock:
            self._entries[cache_key] = {**payload, "_updated_at": updated_at.isoformat()}


@dataclass(slots=True)
class PostgresAnalysisJobStore:
    database_url: str
    table_name: str = "analysis_jobs"
    _schema_ready: bool = field(default=False, init=False, repr=False)
    _schema_lock: Lock = field(default_factory=Lock, init=False, repr=False)

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise AnalysisJobStoreError("DATABASE_URL is required for postgres analysis jobs backend.")
        self.table_name = _sanitize_table_name(self.table_name, "analysis_jobs")

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
                raise AnalysisJobStoreError(f"Failed to initialize analysis jobs schema: {error}") from error
            self._schema_ready = True

    def create_job(
        self,
        *,
        job_id: str,
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
    ) -> None:
        self.submit_job(
            job_id=job_id,
            user_id=None,
            idempotency_key=None,
            request_id=request_id,
            mode=mode,
            allergy_info=allergy_info,
            iso_country_code=iso_country_code,
            locale=locale,
            content_type=content_type,
            image_base64=image_base64,
            image_sha256=image_sha256,
            accepted_at=accepted_at,
            poll_after_ms=poll_after_ms,
        )

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
        self.initialize_schema()
        connect = _load_connect()
        normalized_user_id, normalized_idempotency_key = _normalize_submit_identity(
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} "
                            "(job_id,user_id,idempotency_key,request_id,mode,status,allergy_info,iso_country_code,locale,content_type,image_base64,image_sha256,"
                            "accepted_at,started_at,updated_at,lease_expires_at,worker_id,attempt_count,poll_after_ms,stage_latencies_ms,"
                            "used_model,prompt_version,fallback_reason,error_code,error_message,result_json) "
                            "VALUES (%s,%s,%s,%s,%s,'queued',%s,%s,%s,%s,%s,%s,%s::timestamptz,NULL,%s::timestamptz,NULL,NULL,0,%s,%s::jsonb,NULL,NULL,NULL,NULL,NULL,NULL) "
                            "ON CONFLICT (user_id,idempotency_key) "
                            "WHERE idempotency_key IS NOT NULL AND idempotency_key <> '' "
                            f"DO NOTHING RETURNING {ANALYSIS_JOB_ROW_COLUMNS_SQL}"
                        ),
                        (
                            job_id,
                            normalized_user_id,
                            normalized_idempotency_key,
                            request_id,
                            mode,
                            allergy_info,
                            iso_country_code,
                            locale,
                            content_type,
                            image_base64,
                            image_sha256,
                            _to_iso(accepted_at),
                            _to_iso(accepted_at),
                            poll_after_ms,
                            json.dumps({}, ensure_ascii=False),
                        ),
                    )
                    row = cursor.fetchone()
                    if row is not None:
                        return _record_from_row(row)
                    if normalized_user_id is None or normalized_idempotency_key is None:
                        raise AnalysisJobStoreError("Failed to create analysis job: insert returned no record.")
                    cursor.execute(
                        (
                            f"SELECT {ANALYSIS_JOB_ROW_COLUMNS_SQL} FROM {self.table_name} "
                            "WHERE user_id = %s AND idempotency_key = %s"
                        ),
                        (normalized_user_id, normalized_idempotency_key),
                    )
                    existing_row = cursor.fetchone()
                    if existing_row is None:
                        raise AnalysisJobStoreError("Failed to load reused analysis job after idempotency conflict.")
                    record = _record_from_row(existing_row)
                    record["idempotency_reused"] = True
                    return record
        except Exception as error:
            raise AnalysisJobStoreError(f"Failed to create analysis job: {error}") from error

    def get_job(self, *, job_id: str) -> dict[str, Any] | None:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"SELECT {ANALYSIS_JOB_ROW_COLUMNS_SQL} "
                            f"FROM {self.table_name} WHERE job_id = %s"
                        ),
                        (job_id,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        return None
                    return _record_from_row(row)
        except Exception as error:
            raise AnalysisJobStoreError(f"Failed to load analysis job: {error}") from error

    def claim_next_job(self, *, worker_id: str, lease_seconds: int, now: datetime) -> dict[str, Any] | None:
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"WITH candidate AS ("
                            f" SELECT job_id FROM {self.table_name}"
                            " WHERE status NOT IN ('completed','fallback_completed','failed')"
                            " AND (worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= %s::timestamptz)"
                            " ORDER BY accepted_at ASC"
                            " LIMIT 1"
                            " FOR UPDATE SKIP LOCKED"
                            ") "
                            f"UPDATE {self.table_name} AS jobs "
                            "SET worker_id = %s, "
                            "lease_expires_at = %s::timestamptz, "
                            "started_at = COALESCE(jobs.started_at, %s::timestamptz), "
                            "updated_at = %s::timestamptz, "
                            "attempt_count = jobs.attempt_count + 1 "
                            "FROM candidate "
                            "WHERE jobs.job_id = candidate.job_id "
                            f"RETURNING {_prefix_analysis_job_row_columns(table_alias='jobs')}"
                        ),
                        (
                            _to_iso(now),
                            worker_id,
                            _to_iso(now + timedelta(seconds=lease_seconds)),
                            _to_iso(now),
                            _to_iso(now),
                        ),
                    )
                    row = cursor.fetchone()
                    conn.commit()
                    if row is None:
                        return None
                    return _record_from_row(row)
        except Exception as error:
            raise AnalysisJobStoreError(f"Failed to claim analysis job: {error}") from error

    def update_job(self, *, job_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        _validate_analysis_job_update_columns(updates=updates)
        self.initialize_schema()
        connect = _load_connect()
        fields: list[str] = []
        values: list[Any] = []
        for key, value in updates.items():
            fields.append(f"{key} = %s")
            if key in {"updated_at", "accepted_at", "started_at", "lease_expires_at"} and isinstance(value, datetime):
                values.append(_to_iso(value))
            elif key in {"stage_latencies_ms", "result_json"} and value is not None:
                values.append(json.dumps(value, ensure_ascii=False))
                fields[-1] = f"{key} = %s::jsonb"
            else:
                values.append(value)

        if not fields:
            record = self.get_job(job_id=job_id)
            if record is None:
                raise AnalysisJobStoreError(f"Job not found: {job_id}")
            return record

        values.append(job_id)
        values.append(USER_DATA_DELETED_ERROR_CODE)
        values.append(SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE)
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"UPDATE {self.table_name} SET {', '.join(fields)} "
                            "WHERE job_id = %s AND COALESCE(error_code, '') NOT IN (%s, %s) "
                            f"RETURNING {ANALYSIS_JOB_ROW_COLUMNS_SQL}"
                        ),
                        tuple(values),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        existing = self.get_job(job_id=job_id)
                        if existing is not None and _is_privacy_tombstone_record(record=existing):
                            return existing
                        raise AnalysisJobStoreError(f"Job not found: {job_id}")
                    return _record_from_row(row)
        except Exception as error:
            raise AnalysisJobStoreError(f"Failed to update analysis job: {error}") from error

    def scrub_jobs_for_user(self, *, user_id: str, scrubbed_at: datetime) -> int:
        normalized_user_id = _normalize_required_user_id(user_id=user_id)
        self.initialize_schema()
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"UPDATE {self.table_name} SET "
                            "user_id = NULL, "
                            "idempotency_key = NULL, "
                            "status = 'failed', "
                            "allergy_info = '', "
                            "image_base64 = '', "
                            "image_sha256 = '', "
                            "result_json = NULL, "
                            "lease_expires_at = NULL, "
                            "worker_id = NULL, "
                            "updated_at = %s::timestamptz, "
                            "fallback_reason = NULL, "
                            "error_code = %s, "
                            "error_message = NULL "
                            "WHERE user_id = %s"
                        ),
                        (_to_iso(scrubbed_at), USER_DATA_DELETED_ERROR_CODE, normalized_user_id),
                    )
                    return int(cursor.rowcount)
        except Exception as error:
            raise AnalysisJobStoreError(
                f"Failed to scrub analysis jobs for user_id={normalized_user_id}: {error}"
            ) from error

    def scrub_expired_sensitive_payloads(
        self,
        *,
        cutoff_at: datetime,
        scrubbed_at: datetime,
        limit: int,
        dry_run: bool,
    ) -> AnalysisJobsSensitivePayloadScrubResult:
        self.initialize_schema()
        effective_limit = max(0, limit)
        if effective_limit == 0:
            return AnalysisJobsSensitivePayloadScrubResult(
                target_count=0,
                scrubbed_count=0,
                dry_run=dry_run,
                cutoff_at=cutoff_at,
                scrubbed_at=scrubbed_at,
            )
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    if dry_run:
                        cursor.execute(
                            (
                                f"SELECT job_id FROM {self.table_name} "
                                "WHERE accepted_at <= %s::timestamptz "
                                "AND (worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= %s::timestamptz) "
                                "AND COALESCE(error_code, '') NOT IN (%s, %s) "
                                "AND ("
                                "user_id IS NOT NULL OR "
                                "idempotency_key IS NOT NULL OR "
                                "allergy_info <> '' OR "
                                "image_base64 <> '' OR "
                                "image_sha256 <> '' OR "
                                "result_json IS NOT NULL"
                                ") "
                                "ORDER BY accepted_at ASC "
                                "LIMIT %s"
                            ),
                            (
                                _to_iso(cutoff_at),
                                _to_iso(scrubbed_at),
                                USER_DATA_DELETED_ERROR_CODE,
                                SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE,
                                effective_limit,
                            ),
                        )
                    else:
                        cursor.execute(
                            (
                                "WITH candidate AS ("
                                f" SELECT job_id FROM {self.table_name} "
                                " WHERE accepted_at <= %s::timestamptz "
                                " AND (worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= %s::timestamptz) "
                                " AND COALESCE(error_code, '') NOT IN (%s, %s) "
                                " AND ("
                                " user_id IS NOT NULL OR "
                                " idempotency_key IS NOT NULL OR "
                                " allergy_info <> '' OR "
                                " image_base64 <> '' OR "
                                " image_sha256 <> '' OR "
                                " result_json IS NOT NULL"
                                " ) "
                                " ORDER BY accepted_at ASC "
                                " LIMIT %s "
                                " FOR UPDATE SKIP LOCKED"
                                ") "
                                f"UPDATE {self.table_name} AS jobs SET "
                                "user_id = NULL, "
                                "idempotency_key = NULL, "
                                "status = 'failed', "
                                "allergy_info = '', "
                                "image_base64 = '', "
                                "image_sha256 = '', "
                                "result_json = NULL, "
                                "lease_expires_at = NULL, "
                                "worker_id = NULL, "
                                "updated_at = %s::timestamptz, "
                                "fallback_reason = NULL, "
                                "error_code = %s, "
                                "error_message = NULL "
                                "FROM candidate "
                                "WHERE jobs.job_id = candidate.job_id "
                                "RETURNING jobs.job_id"
                            ),
                            (
                                _to_iso(cutoff_at),
                                _to_iso(scrubbed_at),
                                USER_DATA_DELETED_ERROR_CODE,
                                SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE,
                                effective_limit,
                                _to_iso(scrubbed_at),
                                SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE,
                            ),
                        )
                    rows = cursor.fetchall()
                    target_count = len(rows)
            return AnalysisJobsSensitivePayloadScrubResult(
                target_count=target_count,
                scrubbed_count=0 if dry_run else target_count,
                dry_run=dry_run,
                cutoff_at=cutoff_at,
                scrubbed_at=scrubbed_at,
            )
        except Exception as error:
            raise AnalysisJobStoreError(f"Failed to scrub expired analysis job sensitive payloads: {error}") from error

    def _ensure_table(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.table_name} ("
                    "job_id TEXT PRIMARY KEY,"
                    "user_id TEXT NULL,"
                    "idempotency_key TEXT NULL,"
                    "request_id TEXT NOT NULL,"
                    "mode TEXT NOT NULL,"
                    "status TEXT NOT NULL,"
                    "allergy_info TEXT NOT NULL,"
                    "iso_country_code TEXT NOT NULL,"
                    "locale TEXT NULL,"
                    "content_type TEXT NOT NULL,"
                    "image_base64 TEXT NOT NULL,"
                    "image_sha256 TEXT NOT NULL,"
                    "accepted_at TIMESTAMPTZ NOT NULL,"
                    "started_at TIMESTAMPTZ NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL,"
                    "lease_expires_at TIMESTAMPTZ NULL,"
                    "worker_id TEXT NULL,"
                    "attempt_count INTEGER NOT NULL DEFAULT 0,"
                    "poll_after_ms INTEGER NOT NULL,"
                    "stage_latencies_ms JSONB NOT NULL DEFAULT '{}'::jsonb,"
                    "used_model TEXT NULL,"
                    "prompt_version TEXT NULL,"
                    "fallback_reason TEXT NULL,"
                    "error_code TEXT NULL,"
                    "error_message TEXT NULL,"
                    "result_json JSONB NULL"
                    ")"
                )
            )
            cursor.execute(f"ALTER TABLE {self.table_name} ADD COLUMN IF NOT EXISTS user_id TEXT NULL")
            cursor.execute(f"ALTER TABLE {self.table_name} ADD COLUMN IF NOT EXISTS idempotency_key TEXT NULL")
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {self.table_name}_claim_idx ON {self.table_name} (status, accepted_at)"
            )
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {self.table_name}_lease_idx ON {self.table_name} (lease_expires_at)"
            )
            cursor.execute(
                f"CREATE INDEX IF NOT EXISTS {self.table_name}_user_id_idx ON {self.table_name} (user_id)"
            )
            cursor.execute(
                (
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {self.table_name}_user_idempotency_key_idx "
                    f"ON {self.table_name} (user_id, idempotency_key) "
                    "WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''"
                )
            )


@dataclass(slots=True)
class PostgresNutritionCacheStore:
    database_url: str
    table_name: str = "analysis_nutrition_cache"

    def __post_init__(self) -> None:
        if not self.database_url.strip():
            raise NutritionCacheStoreError("DATABASE_URL is required for postgres nutrition cache backend.")
        self.table_name = _sanitize_table_name(self.table_name, "analysis_nutrition_cache")

    def initialize_schema(self) -> None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                self._ensure_table(conn)
        except Exception as error:
            raise NutritionCacheStoreError(f"Failed to initialize nutrition cache schema: {error}") from error

    def get(self, *, cache_key: str) -> dict[str, Any] | None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"SELECT payload_json FROM {self.table_name} WHERE cache_key = %s",
                        (cache_key,),
                    )
                    row = cursor.fetchone()
                    if row is None:
                        return None
                    payload = row[0]
                    return dict(payload) if isinstance(payload, dict) else json.loads(payload)
        except Exception as error:
            raise NutritionCacheStoreError(f"Failed to load nutrition cache entry: {error}") from error

    def set(self, *, cache_key: str, payload: dict[str, Any], updated_at: datetime) -> None:
        connect = _load_connect()
        try:
            with connect(self.database_url, autocommit=True) as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        (
                            f"INSERT INTO {self.table_name} (cache_key,payload_json,updated_at) "
                            "VALUES (%s,%s::jsonb,%s::timestamptz) "
                            "ON CONFLICT (cache_key) DO UPDATE SET "
                            "payload_json = EXCLUDED.payload_json, updated_at = EXCLUDED.updated_at"
                        ),
                        (cache_key, json.dumps(payload, ensure_ascii=False), _to_iso(updated_at)),
                    )
        except Exception as error:
            raise NutritionCacheStoreError(f"Failed to save nutrition cache entry: {error}") from error

    def _ensure_table(self, conn: object) -> None:
        with conn.cursor() as cursor:
            cursor.execute(
                (
                    f"CREATE TABLE IF NOT EXISTS {self.table_name} ("
                    "cache_key TEXT PRIMARY KEY,"
                    "payload_json JSONB NOT NULL,"
                    "updated_at TIMESTAMPTZ NOT NULL"
                    ")"
                )
            )


def build_analysis_job_store_from_env(getenv: callable) -> AnalysisJobStore:
    backend = (getenv("ANALYSIS_JOB_BACKEND") or "").strip().lower()
    openapi_export_only = (getenv("OPENAPI_EXPORT_ONLY") or "").strip() == "1"
    database_url = (getenv("DATABASE_URL") or "").strip()
    table_name = (getenv("ANALYSIS_JOB_TABLE") or "").strip() or "analysis_jobs"

    if not backend and openapi_export_only:
        return InMemoryAnalysisJobStore()
    if backend == "memory":
        return InMemoryAnalysisJobStore()
    if backend == "postgres":
        if not database_url:
            raise AnalysisJobStoreError("DATABASE_URL is required for ANALYSIS_JOB_BACKEND=postgres.")
        return PostgresAnalysisJobStore(database_url=database_url, table_name=table_name)
    if database_url:
        return PostgresAnalysisJobStore(database_url=database_url, table_name=table_name)
    return InMemoryAnalysisJobStore()


def build_nutrition_cache_store_from_env(getenv: callable) -> NutritionCacheStore:
    backend = (getenv("ANALYSIS_NUTRITION_CACHE_BACKEND") or "").strip().lower()
    openapi_export_only = (getenv("OPENAPI_EXPORT_ONLY") or "").strip() == "1"
    database_url = (getenv("DATABASE_URL") or "").strip()
    table_name = (getenv("ANALYSIS_NUTRITION_CACHE_TABLE") or "").strip() or "analysis_nutrition_cache"

    if not backend and openapi_export_only:
        return InMemoryNutritionCacheStore()
    if backend == "memory":
        return InMemoryNutritionCacheStore()
    if backend == "postgres":
        if not database_url:
            raise NutritionCacheStoreError("DATABASE_URL is required for ANALYSIS_NUTRITION_CACHE_BACKEND=postgres.")
        return PostgresNutritionCacheStore(database_url=database_url, table_name=table_name)
    if database_url:
        return PostgresNutritionCacheStore(database_url=database_url, table_name=table_name)
    return InMemoryNutritionCacheStore()


def create_analysis_job_payload(
    *,
    request_id: str,
    mode: str,
    allergy_info: str,
    iso_country_code: str,
    locale: str | None,
    content_type: str,
    image_bytes: bytes,
    image_sha256: str,
    poll_after_ms: int,
) -> AnalysisJobCreatePayload:
    return AnalysisJobCreatePayload(
        job_id=f"job_{uuid4().hex}",
        request_id=request_id,
        mode=mode,
        allergy_info=allergy_info,
        iso_country_code=iso_country_code,
        locale=locale,
        content_type=content_type,
        image_base64=base64.b64encode(image_bytes).decode("utf-8"),
        image_sha256=image_sha256,
        accepted_at=_utc_now(),
        poll_after_ms=poll_after_ms,
    )


def submit_analysis_job(
    *,
    store: AnalysisJobStore,
    payload: AnalysisJobCreatePayload,
    user_id: str | None,
    idempotency_key: str | None,
) -> dict[str, Any]:
    return store.submit_job(
        job_id=payload.job_id,
        user_id=user_id,
        idempotency_key=idempotency_key,
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


def serialize_job_submit_response(*, record: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": str(record["job_id"]),
        "request_id": str(record["request_id"]),
        "status": str(record["status"]),
        "accepted_at": _to_iso(record["accepted_at"]),
        "poll_after_ms": int(record.get("poll_after_ms") or 1000),
        "idempotency_reused": bool(record.get("idempotency_reused") or False),
    }


def serialize_job_status_response(*, record: dict[str, Any]) -> dict[str, Any]:
    status = str(record["status"])
    payload = {
        "job_id": str(record["job_id"]),
        "request_id": str(record["request_id"]),
        "status": status,
        "stage": status if status not in TERMINAL_JOB_STATUSES else None,
        "accepted_at": _to_iso(record["accepted_at"]),
        "started_at": _to_optional_iso(record.get("started_at")),
        "updated_at": _to_iso(record["updated_at"]),
        "poll_after_ms": 0 if status in TERMINAL_JOB_STATUSES else int(record.get("poll_after_ms") or 1000),
        "progress_hint": PROGRESS_HINTS.get(status, status),
        "used_model": _string_or_none(record.get("used_model")),
        "prompt_version": _string_or_none(record.get("prompt_version")),
        "latency_ms_by_stage": dict(record.get("stage_latencies_ms") or {}),
        "fallback_reason": _string_or_none(record.get("fallback_reason")),
        "error_code": _string_or_none(record.get("error_code")),
        "error_message": _string_or_none(record.get("error_message")),
        "ingredients": [],
    }
    result = record.get("result_json")
    if isinstance(result, dict):
        payload.update(result)
    return payload


def build_job_progress_log_fields(*, record: dict[str, Any]) -> dict[str, Any]:
    return {
        "request_id": str(record["request_id"]),
        "job_id": str(record["job_id"]),
        "stage": str(record["status"]),
        "used_model": _string_or_none(record.get("used_model")),
        "prompt_version": _string_or_none(record.get("prompt_version")),
        "latency_ms": dict(record.get("stage_latencies_ms") or {}),
        "fallback_reason": _string_or_none(record.get("fallback_reason")),
    }


def _build_empty_total_nutrition() -> dict[str, Any]:
    return {
        "calories": 0.0,
        "protein": 0.0,
        "carbs": 0.0,
        "fat": 0.0,
        "fiber": 0.0,
        "sodium": 0.0,
        "sugar": 0.0,
        "servingSize": "100g (total)",
        "dataSource": "Multiple Sources",
    }


def _build_unavailable_nutrition() -> dict[str, Any]:
    return {
        "calories": None,
        "protein": None,
        "carbs": None,
        "fat": None,
        "fiber": None,
        "sodium": None,
        "sugar": None,
        "servingSize": "Unavailable",
        "dataSource": "Unavailable",
    }


def _iter_unique_ingredients(ingredients: list[Any]) -> list[tuple[dict[str, Any], str]]:
    seen: set[str] = set()
    collected: list[tuple[dict[str, Any], str]] = []
    for ingredient in ingredients:
        if not isinstance(ingredient, dict):
            continue
        name = _normalize_lookup_name(str(ingredient.get("name") or ""))
        if not name:
            continue
        lowered = name.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        collected.append((dict(ingredient), name))
    return collected


def _normalize_lookup_name(name: str) -> str:
    return " ".join(name.strip().split())


def _build_nutrition_cache_key(*, name: str, origin: str) -> str:
    normalized_name = _normalize_lookup_name(name).lower()
    normalized_origin = _normalize_lookup_name(origin).lower()
    return f"{normalized_name}|{normalized_origin}"


def _has_calories(payload: dict[str, Any] | None) -> bool:
    if not isinstance(payload, dict):
        return False
    return payload.get("calories") is not None


def _accumulate_total_nutrition(*, total_nutrition: dict[str, Any], nutrition: dict[str, Any]) -> None:
    for key in ("calories", "protein", "carbs", "fat", "fiber", "sodium", "sugar"):
        if nutrition.get(key) is None:
            continue
        total_nutrition[key] = float(total_nutrition.get(key) or 0.0) + float(nutrition[key])


def _resize_image_for_async_job(image: Any) -> Any:
    width, height = image.size
    longest_edge = max(width, height)
    if longest_edge <= 1280:
        return image
    scale = 1280 / float(longest_edge)
    resized = image.copy()
    resized.thumbnail((int(width * scale), int(height * scale)))
    return resized


def _finalize_analysis_result(
    *,
    result: dict[str, Any],
    request_id: str,
    used_model: str | None,
    prompt_version: str | None,
) -> dict[str, Any]:
    finalized = dict(result)
    finalized["request_id"] = request_id
    if used_model:
        finalized["used_model"] = used_model
    if prompt_version:
        finalized["prompt_version"] = prompt_version
    if not isinstance(finalized.get("ingredients"), list):
        finalized["ingredients"] = []
    if "safetyStatus" not in finalized:
        finalized["safetyStatus"] = "CAUTION"
    if "foodName" not in finalized:
        fallback = get_safe_fallback_response("이미지 분석에 실패했습니다. 다시 시도해주세요.")
        fallback["request_id"] = request_id
        fallback["used_model"] = used_model or FoodAnalyst._retry_stats.get("last_used_model") or "unknown"
        fallback["prompt_version"] = prompt_version or ANALYSIS_PROMPT_VERSION
        return fallback
    return finalized


def _detect_analysis_fallback_reason(*, result: dict[str, Any], mode: str) -> str | None:
    food_fallback_reason = _string_or_none(result.get("_food_fallback_reason"))
    if food_fallback_reason:
        return food_fallback_reason
    analysis_diagnostics = result.get("analysis_diagnostics")
    if isinstance(analysis_diagnostics, dict):
        diagnostic_food_reason = _string_or_none(analysis_diagnostics.get("fallback_reason"))
        if diagnostic_food_reason:
            return diagnostic_food_reason
    label_fallback_reason = _string_or_none(result.get("_label_fallback_reason"))
    if label_fallback_reason:
        return label_fallback_reason
    label_diagnostics = result.get("label_diagnostics")
    if isinstance(label_diagnostics, dict):
        diagnostic_fallback_reason = _string_or_none(label_diagnostics.get("fallback_reason"))
        if diagnostic_fallback_reason:
            return diagnostic_fallback_reason
    food_name = _string_or_none(result.get("foodName"))
    if food_name and food_name in FALLBACK_ERROR_NAMES:
        return "analysis_fallback"
    if mode == "label" and result.get("_label_error_type"):
        return str(result["_label_error_type"])
    return None


def _prefix_analysis_job_row_columns(*, table_alias: str) -> str:
    return ",".join(f"{table_alias}.{column}" for column in ANALYSIS_JOB_ROW_COLUMNS)


def _normalize_optional_text(*, value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _normalize_submit_identity(*, user_id: str | None, idempotency_key: str | None) -> tuple[str | None, str | None]:
    normalized_user_id = _normalize_optional_text(value=user_id)
    normalized_idempotency_key = _normalize_optional_text(value=idempotency_key)
    if normalized_idempotency_key is not None and normalized_user_id is None:
        raise AnalysisJobStoreError("user_id is required when idempotency_key is provided.")
    return normalized_user_id, normalized_idempotency_key


def _normalize_required_user_id(*, user_id: str) -> str:
    normalized_user_id = _normalize_optional_text(value=user_id)
    if normalized_user_id is None:
        raise AnalysisJobStoreError("user_id is required for user-scoped analysis job cleanup.")
    return normalized_user_id


def _validate_analysis_job_update_columns(*, updates: dict[str, Any]) -> None:
    invalid_columns = sorted(set(updates) - ANALYSIS_JOB_MUTABLE_COLUMNS)
    if invalid_columns:
        raise AnalysisJobStoreError(f"Invalid analysis job update columns: {', '.join(invalid_columns)}")


def _build_analysis_job_record(
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
    return {
        "job_id": job_id,
        "user_id": user_id,
        "idempotency_key": idempotency_key,
        "request_id": request_id,
        "mode": mode,
        "status": "queued",
        "allergy_info": allergy_info,
        "iso_country_code": iso_country_code,
        "locale": locale,
        "content_type": content_type,
        "image_base64": image_base64,
        "image_sha256": image_sha256,
        "accepted_at": accepted_at,
        "started_at": None,
        "updated_at": accepted_at,
        "lease_expires_at": None,
        "worker_id": None,
        "attempt_count": 0,
        "poll_after_ms": poll_after_ms,
        "stage_latencies_ms": {},
        "used_model": None,
        "prompt_version": None,
        "fallback_reason": None,
        "error_code": None,
        "error_message": None,
        "result_json": None,
        "idempotency_reused": False,
    }


def _copy_job_record(record: dict[str, Any]) -> dict[str, Any]:
    copied: dict[str, Any] = {}
    for key, value in record.items():
        if isinstance(value, dict):
            copied[key] = dict(value)
        else:
            copied[key] = value
    return copied


def _scrub_analysis_job_record(*, record: dict[str, Any], scrubbed_at: datetime) -> dict[str, Any]:
    scrubbed = _copy_job_record(record)
    scrubbed.update(
        {
            "user_id": None,
            "idempotency_key": None,
            "status": "failed",
            "allergy_info": "",
            "image_base64": "",
            "image_sha256": "",
            "result_json": None,
            "lease_expires_at": None,
            "worker_id": None,
            "updated_at": scrubbed_at,
            "fallback_reason": None,
            "error_code": USER_DATA_DELETED_ERROR_CODE,
            "error_message": None,
            "idempotency_reused": False,
        }
    )
    return scrubbed


def _scrub_analysis_job_sensitive_payload_record(*, record: dict[str, Any], scrubbed_at: datetime) -> dict[str, Any]:
    scrubbed = _copy_job_record(record)
    scrubbed.update(
        {
            "user_id": None,
            "idempotency_key": None,
            "status": "failed",
            "allergy_info": "",
            "image_base64": "",
            "image_sha256": "",
            "result_json": None,
            "lease_expires_at": None,
            "worker_id": None,
            "updated_at": scrubbed_at,
            "fallback_reason": None,
            "error_code": SENSITIVE_PAYLOAD_TTL_SCRUBBED_ERROR_CODE,
            "error_message": None,
            "idempotency_reused": False,
        }
    )
    return scrubbed


def _is_analysis_job_sensitive_payload_ttl_eligible(
    *,
    record: dict[str, Any],
    cutoff_at: datetime,
    scrubbed_at: datetime,
) -> bool:
    accepted_at = _coerce_analysis_job_datetime(record.get("accepted_at"))
    if accepted_at > cutoff_at:
        return False
    if _is_privacy_tombstone_record(record=record):
        return False
    lease_expires_at = record.get("lease_expires_at")
    if record.get("worker_id") and lease_expires_at is not None:
        if _coerce_analysis_job_datetime(lease_expires_at) > scrubbed_at:
            return False
    return (
        record.get("user_id") is not None
        or record.get("idempotency_key") is not None
        or str(record.get("allergy_info") or "") != ""
        or str(record.get("image_base64") or "") != ""
        or str(record.get("image_sha256") or "") != ""
        or record.get("result_json") is not None
    )


def _is_privacy_tombstone_record(*, record: dict[str, Any]) -> bool:
    return str(record.get("error_code") or "") in PRIVACY_TOMBSTONE_ERROR_CODES


def _coerce_analysis_job_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    parsed = datetime.fromisoformat(str(value))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _load_connect():
    try:
        from psycopg import connect  # type: ignore
    except Exception as error:
        raise AnalysisJobStoreError("psycopg is required for postgres analysis jobs backend.") from error
    return connect


def _sanitize_table_name(raw: str, fallback: str) -> str:
    candidate = (raw or "").strip() or fallback
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", candidate):
        raise AnalysisJobStoreError(f"Invalid table name: {candidate}")
    return candidate


def _record_from_row(row: tuple[Any, ...]) -> dict[str, Any]:
    (
        job_id,
        user_id,
        idempotency_key,
        request_id,
        mode,
        status,
        allergy_info,
        iso_country_code,
        locale,
        content_type,
        image_base64,
        image_sha256,
        accepted_at,
        started_at,
        updated_at,
        lease_expires_at,
        worker_id,
        attempt_count,
        poll_after_ms,
        stage_latencies_ms,
        used_model,
        prompt_version,
        fallback_reason,
        error_code,
        error_message,
        result_json,
    ) = row
    return {
        "job_id": job_id,
        "user_id": user_id,
        "idempotency_key": idempotency_key,
        "request_id": request_id,
        "mode": mode,
        "status": status,
        "allergy_info": allergy_info,
        "iso_country_code": iso_country_code,
        "locale": locale,
        "content_type": content_type,
        "image_base64": image_base64,
        "image_sha256": image_sha256,
        "accepted_at": accepted_at,
        "started_at": started_at,
        "updated_at": updated_at,
        "lease_expires_at": lease_expires_at,
        "worker_id": worker_id,
        "attempt_count": attempt_count,
        "poll_after_ms": poll_after_ms,
        "stage_latencies_ms": stage_latencies_ms or {},
        "used_model": used_model,
        "prompt_version": prompt_version,
        "fallback_reason": fallback_reason,
        "error_code": error_code,
        "error_message": error_message,
        "result_json": result_json,
        "idempotency_reused": False,
    }


def _string_or_none(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_optional_iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return _to_iso(value)
    return None


def _touch_sentry_scope(
    *,
    request_id: str,
    job_id: str,
    used_model: str | None,
    prompt_version: str | None,
    stage: str,
    fallback_reason: str | None,
    latency_ms: int,
) -> None:
    try:
        import sentry_sdk
    except Exception:
        return

    with sentry_sdk.push_scope() as scope:
        scope.set_tag("analysis_stage", stage)
        scope.set_extra("request_id", request_id)
        scope.set_extra("job_id", job_id)
        scope.set_extra("used_model", used_model)
        scope.set_extra("prompt_version", prompt_version)
        scope.set_extra("fallback_reason", fallback_reason)
        scope.set_extra("latency_ms", latency_ms)
