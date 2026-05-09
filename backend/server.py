from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
# Build Trigger: 2026-02-10 12:40 (After Pipeline Credits Increase)
import asyncio
import base64
import hashlib
import hmac
import inspect
import io
import logging
import os
import time
from collections import OrderedDict
from datetime import datetime, timezone
from urllib.parse import urlencode, urlparse
from typing import Any, Awaitable, Callable, Literal, TypeVar
import requests
from pydantic import BaseModel
from PIL import Image, ImageOps

from backend.modules.server_bootstrap import (
    decode_upload_to_image,
    initialize_services,
    load_environment,
)
from backend.modules.analyst_core.prompts import ANALYSIS_PROMPT_VERSION, LABEL_2PASS_PROMPT_VERSION
from backend.modules.analyst_core.response_utils import get_safe_fallback_response
from backend.modules.ops.cost_guardrail import CostGuardrailAction
from backend.modules.ops.cost_guardrail import (
    CostGuardrailService,
    InMemoryMonthlyUsageStorage,
    PostgresMonthlyUsageStorage,
)
from backend.modules.ops.data_retention import (
    CallbackRetentionCleanupAdapter,
    InMemoryRetentionStore,
    JsonFileRetentionStore,
    LocalFileRetentionCleanupAdapter,
    NoOpRetentionCleanupAdapter,
    PostgresRetentionStore,
    RetentionDataClass,
    RetentionRecord,
    RetentionStoreError,
    RetentionCleanupJob,
)
from backend.modules.ops.data_retention import RetentionPolicyConfig
from backend.modules.ops.deletion_queue import (
    DeletionStatusSnapshot,
    DeletionTarget,
    DeletionQueueConsumer,
    DeletionQueueProducer,
    InMemoryDeletionQueueStorage,
    JsonFileDeletionQueueStorage,
    NoOpDeletionHandler,
    PostgresDeletionQueueStorage,
)
from backend.modules.ops.privacy_deletion import UserDeletionHandler
from backend.modules.ops.rollout_control import (
    InMemoryRolloutStateStore,
    JsonFileRolloutStateStore,
    LabelRolloutAutoManager,
    LabelRolloutController,
    evaluate_kpi_gate,
    load_kpi_input_from_env,
)
from backend.modules.ops.rollout_control import (
    KpiThresholds,
    RolloutConfig,
)
from backend.modules.ops.api_edge_guard import (
    InMemoryEndpointAdmissionLimiter,
    InMemorySlidingWindowRateLimiter,
    build_cors_config_from_env,
    build_inflight_admission_settings_from_env,
    build_rate_limit_http_exception,
    build_rate_limit_settings_from_env,
    build_rate_limit_subject,
    extract_client_ip,
)
from backend.modules.quality.label_quality_gate import evaluate_label_image_quality
from backend.modules.runtime_guardrails import ErrorCode
from backend.modules.runtime_guardrails import (
    raise_service_unavailable,
    run_in_threadpool,
    run_with_error_policy,
)
from backend.modules.runtime_guardrails import EndpointErrorPolicy
from backend.modules.contracts.analysis_response import AnalysisResponseContract
from backend.modules.contracts.analysis_job import (
    AnalysisJobStatusResponseContract,
    AnalysisJobSubmitResponseContract,
)
from backend.modules.contracts.barcode_response import BarcodeLookupResponseContract
from backend.modules.contracts.observability import LatencyMsContract
from backend.modules.auth.email_sender import _mask_email
from backend.modules.auth.state_store import AuthStateStoreError, PostgresAuthStateStore
from backend.modules.analysis_jobs import (
    AnalysisJobStoreError,
    AnalysisJobWorker,
    build_analysis_job_store_from_env,
    build_nutrition_cache_store_from_env,
    create_analysis_job_payload,
    NutritionEnrichmentService,
    serialize_job_status_response,
    serialize_job_submit_response,
    submit_analysis_job as submit_analysis_job_record,
)
from backend.modules.auth.service import AuthServiceError, InMemoryAuthSessionService
from backend.modules.media.service import (
    MediaUploadResult,
    MediaStorageError,
    build_media_storage_from_env,
)
from backend.modules.nutrition import lookup_nutrition


def _startup_model_tier(model_name: str | None) -> str:
    normalized_model_name = (model_name or "").strip().lower()
    if "-pro" in normalized_model_name:
        return "pro"
    if "flash-lite" in normalized_model_name:
        return "flash-lite"
    if "flash" in normalized_model_name:
        return "flash"
    if normalized_model_name:
        return "unknown"
    return "unset"


def _is_pro_model_tier(model_name: Any) -> bool:
    if not isinstance(model_name, str):
        return False
    return _startup_model_tier(model_name) == "pro"


def _positive_float(value: float, fallback: float) -> float:
    if value > 0:
        return value
    return fallback


def _label_pro_fallback_min_cost_multiplier() -> float:
    return _positive_float(_env_float("LABEL_PRO_FALLBACK_MIN_COST_MULTIPLIER", 6.0), 6.0)


def _label_pro_fallback_estimated_cost(primary_estimated_cost: float) -> float:
    min_estimated_cost = primary_estimated_cost * _label_pro_fallback_min_cost_multiplier()
    explicit_estimated_cost = _env_float(
        "LABEL_ESTIMATED_COST_USD_PER_REQUEST_PRO_FALLBACK",
        _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST_FALLBACK", min_estimated_cost),
    )
    return max(primary_estimated_cost, explicit_estimated_cost, min_estimated_cost)


def _label_reservation_estimated_cost(analyst: Any, primary_estimated_cost: float) -> float:
    fallback_model_name = getattr(analyst, "label_fallback_model_name", None)
    fallback_enabled = bool(getattr(analyst, "label_fallback_enabled", False))
    if fallback_enabled and _is_pro_model_tier(fallback_model_name):
        return _label_pro_fallback_estimated_cost(primary_estimated_cost)
    return primary_estimated_cost


def _label_actual_estimated_cost(primary_estimated_cost: float, used_model_name: Any) -> float:
    if _is_pro_model_tier(used_model_name):
        return _label_pro_fallback_estimated_cost(primary_estimated_cost)
    return primary_estimated_cost


def _smart_downstream_reservation_estimated_cost(analyst: Any) -> float:
    food_estimated_cost = _env_float("FOOD_ESTIMATED_COST_USD_PER_REQUEST", 0.006)
    label_estimated_cost = _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST", 0.02)
    label_reservation_cost = _label_reservation_estimated_cost(analyst, label_estimated_cost)
    return max(food_estimated_cost, label_reservation_cost)


def _smart_downstream_reservation_estimated_tokens() -> int:
    food_estimated_tokens = _env_int("FOOD_ESTIMATED_TOKENS_PER_REQUEST", 2500)
    label_estimated_tokens = _env_int("LABEL_ESTIMATED_TOKENS_PER_REQUEST", 1500)
    return max(food_estimated_tokens, label_estimated_tokens)


def _barcode_allergen_budget_fallback(ingredients: list[Any], locale: str | None) -> dict[str, Any]:
    normalized_locale = (locale or "").strip().lower()
    coach_message = (
        "이번 달 AI 분석 예산 한도에 도달했습니다. 성분표를 직접 확인해주세요."
        if normalized_locale.startswith("ko")
        else "The monthly AI analysis budget has been reached. Please verify the ingredient label directly."
    )
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": coach_message,
        "ingredients": list(ingredients),
        "used_model": None,
        "prompt_version": None,
        "_barcode_chargeable": False,
        "_barcode_fallback_used": True,
        "_barcode_fallback_reason": "budget_fallback",
        "_barcode_truncated": False,
    }


def _log_safe_environment_debug() -> None:
    print("--- [Server Debug Environment] ---")
    print(f"PORT: {'[SET]' if os.getenv('PORT') else '[DEFAULT]'}")
    print(
        "GEMINI_MODEL_NAME: "
        f"{'[SET]' if os.getenv('GEMINI_MODEL_NAME') else '[DEFAULT]'} "
        f"tier={_startup_model_tier(os.getenv('GEMINI_MODEL_NAME', 'gemini-2.0-flash'))}"
    )
    print(
        "GEMINI_LABEL_MODEL_NAME: "
        f"{'[SET]' if os.getenv('GEMINI_LABEL_MODEL_NAME') else '[DEFAULT]'} "
        f"tier={_startup_model_tier(os.getenv('GEMINI_LABEL_MODEL_NAME', 'gemini-2.5-flash'))}"
    )
    print(f"KOREAN_FDA_API_KEY: {'[SET]' if os.getenv('KOREAN_FDA_API_KEY') else '[MISSING]'}")
    print(f"GCP_SERVICE_ACCOUNT_JSON: {'[SET]' if os.getenv('GCP_SERVICE_ACCOUNT_JSON') else '[MISSING]'}")


load_environment()
_log_safe_environment_debug()

app = FastAPI()
_cors_config = build_cors_config_from_env()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_config.allow_origins,
    allow_origin_regex=_cors_config.allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-Id", "X-Device-Id"],
    expose_headers=[
        "Retry-After",
        "X-Request-Id",
        "X-Media-Render-Cache",
        "X-Media-Render-Duration-Ms",
        "X-Media-Render-Stage-Ms",
    ],
)

MediaRenderResult = tuple[bytes, str, str, str, dict[str, int]]
MediaRenderValue = TypeVar("MediaRenderValue")

logger = logging.getLogger("foodlens.api")
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)


def _is_openapi_export_mode() -> bool:
    return os.environ.get("OPENAPI_EXPORT_ONLY") == "1"


def _is_label_cost_guardrail_enabled() -> bool:
    return os.environ.get("LABEL_COST_GUARDRAIL_ENABLED", "0").strip() == "1"


def _is_analysis_cost_guardrail_enabled() -> bool:
    return os.environ.get(
        "AI_COST_GUARDRAIL_ENABLED",
        os.environ.get("LABEL_COST_GUARDRAIL_ENABLED", "0"),
    ).strip() == "1"


def _build_label_cost_guardrail_storage() -> InMemoryMonthlyUsageStorage | PostgresMonthlyUsageStorage:
    storage_backend = _env_str(
        "AI_COST_GUARDRAIL_STORAGE_BACKEND",
        _env_str("LABEL_COST_GUARDRAIL_STORAGE_BACKEND", "memory"),
    ).lower()
    if storage_backend == "postgres":
        return PostgresMonthlyUsageStorage(
            database_url=_env_str("DATABASE_URL", ""),
            usage_table_name=_env_str(
                "AI_COST_GUARDRAIL_USAGE_TABLE",
                _env_str("LABEL_COST_GUARDRAIL_USAGE_TABLE", "label_monthly_usage"),
            ),
            reservation_table_name=_env_str(
                "AI_COST_GUARDRAIL_RESERVATION_TABLE",
                _env_str("LABEL_COST_GUARDRAIL_RESERVATION_TABLE", "label_monthly_usage_reservations"),
            ),
        )
    if storage_backend == "memory":
        return InMemoryMonthlyUsageStorage()
    raise RuntimeError(f"Unsupported LABEL_COST_GUARDRAIL_STORAGE_BACKEND={storage_backend}")


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_str(name: str, default: str) -> str:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip() or default


def _call_with_supported_kwargs(callable_value: Callable[..., Any], kwargs: dict[str, Any]) -> Any:
    parameters = inspect.signature(callable_value).parameters
    supported_kwargs = {
        key: value
        for key, value in kwargs.items()
        if key in parameters
    }
    missing_required = [
        key
        for key, parameter in parameters.items()
        if parameter.default is inspect.Parameter.empty
        and parameter.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
        and key not in supported_kwargs
    ]
    if missing_required:
        raise RuntimeError(f"Unsupported callable signature missing parameters: {missing_required}")
    return callable_value(**supported_kwargs)


def _normalize_idempotency_key(header_value: str | None, form_value: str | None) -> str | None:
    normalized_header_value = _normalize_optional_header_value(header_value)
    if normalized_header_value is not None:
        return normalized_header_value
    return _normalize_optional_header_value(form_value)


def _resolve_analysis_job_idempotency_user_id(request: Request, idempotency_key: str | None) -> str | None:
    if idempotency_key is None:
        return None
    subject, user_id = _resolve_rate_limit_subject(request)
    return user_id or subject


def _normalize_optional_header_value(value: str | None) -> str | None:
    if value is None:
        return None
    normalized_value = value.strip()
    if not normalized_value:
        return None
    return normalized_value


def _extract_record_field(record: Any, field_name: str) -> Any:
    if isinstance(record, dict):
        return record.get(field_name)
    return getattr(record, field_name, None)


def _build_analysis_job_accepted_record(job_payload: Any, create_job_result: Any) -> dict[str, Any]:
    accepted_record: dict[str, Any] = {
        "job_id": job_payload.job_id,
        "request_id": job_payload.request_id,
        "status": "queued",
        "accepted_at": job_payload.accepted_at,
        "poll_after_ms": job_payload.poll_after_ms,
    }
    for field_name in ("job_id", "request_id", "status", "accepted_at", "poll_after_ms"):
        field_value = _extract_record_field(create_job_result, field_name)
        if field_value is not None:
            accepted_record[field_name] = field_value
    idempotency_reused = _extract_record_field(create_job_result, "idempotency_reused")
    if idempotency_reused is not None:
        accepted_record["idempotency_reused"] = bool(idempotency_reused)
    return accepted_record


def _serialize_analysis_job_submit_response(record: dict[str, Any]) -> dict[str, Any]:
    payload = serialize_job_submit_response(record=record)
    if "idempotency_reused" in record and "idempotency_reused" not in payload:
        payload["idempotency_reused"] = bool(record["idempotency_reused"])
    return payload


def _label_cost_decision(value: Any) -> Any:
    if isinstance(value, dict):
        return value.get("decision", value)
    return getattr(value, "decision", value)


def _label_cost_action(value: Any) -> Any:
    value = _label_cost_decision(value)
    if isinstance(value, dict):
        return value.get("action")
    return getattr(value, "action", None)


def _label_cost_ratio(value: Any) -> float:
    value = _label_cost_decision(value)
    raw_ratio = value.get("ratio") if isinstance(value, dict) else getattr(value, "ratio", 0.0)
    if isinstance(raw_ratio, int | float):
        return float(raw_ratio)
    return 0.0


def _label_cost_projected_total(value: Any) -> float:
    value = _label_cost_decision(value)
    raw_total = (
        value.get("projected_total_cost_usd")
        if isinstance(value, dict)
        else getattr(value, "projected_total_cost_usd", 0.0)
    )
    if isinstance(raw_total, int | float):
        return float(raw_total)
    return 0.0


def _reserve_label_cost(
    cost_guardrail: Any,
    *,
    reservation_key: str,
    estimated_cost_usd: float,
    estimated_tokens: int,
) -> Any:
    reserve = getattr(cost_guardrail, "reserve", None)
    if callable(reserve):
        return _call_with_supported_kwargs(
            reserve,
            {
                "reservation_key": reservation_key,
                "projected_cost_usd": estimated_cost_usd,
                "estimated_cost_usd": estimated_cost_usd,
                "cost_usd": estimated_cost_usd,
                "projected_tokens": estimated_tokens,
                "estimated_tokens": estimated_tokens,
                "tokens": estimated_tokens,
            },
        )
    evaluate = getattr(cost_guardrail, "evaluate", None)
    if callable(evaluate):
        return evaluate(projected_cost_usd=estimated_cost_usd)
    raise RuntimeError("Label cost guardrail must provide reserve() or evaluate()")


def _reconcile_label_cost(
    cost_guardrail: Any,
    *,
    reservation: Any,
    chargeable: bool,
    cost_usd: float,
    tokens: int,
    provider_total_tokens: int | None,
    provider_thought_tokens: int | None,
    fallback_used: bool,
    truncated: bool,
) -> Any:
    reconcile = getattr(cost_guardrail, "reconcile", None)
    if callable(reconcile):
        reservation_key = None
        if isinstance(reservation, dict):
            reservation_key = reservation.get("reservation_key")
            accepted = reservation.get("accepted", True)
        else:
            reservation_key = getattr(reservation, "reservation_key", None)
            accepted = getattr(reservation, "accepted", True)
        if not reservation_key or accepted is False:
            return None
        return _call_with_supported_kwargs(
            reconcile,
            {
                "reservation_key": reservation_key,
                "reservation": reservation,
                "chargeable": chargeable,
                "release": not chargeable,
                "cost_usd": cost_usd,
                "actual_cost_usd": cost_usd,
                "tokens": tokens,
                "actual_tokens": tokens,
                "provider_total_tokens": provider_total_tokens,
                "provider_thought_tokens": provider_thought_tokens,
                "fallback_used": fallback_used,
                "truncated": truncated,
            },
        )
    if chargeable:
        return cost_guardrail.record(
            cost_usd=cost_usd,
            tokens=tokens,
            provider_total_tokens=provider_total_tokens,
            provider_thought_tokens=provider_thought_tokens,
            fallback_used=fallback_used,
            truncated=truncated,
        )
    return None


def _build_scoped_rate_limit_http_exception(
    *,
    request_id: str,
    retry_after_seconds: int,
    code: str,
    message: str,
    retry_scope: str,
    retryable_by_client: bool,
) -> HTTPException:
    error = build_rate_limit_http_exception(
        request_id=request_id,
        retry_after_seconds=retry_after_seconds,
        code=code,
        message=message,
    )
    if isinstance(error.detail, dict):
        error.detail["retry_scope"] = retry_scope
        error.detail["retryable_by_client"] = retryable_by_client
    return error


def _safe_label_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    return None


def _safe_label_string(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _safe_label_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    safe_values: list[str] = []
    for item in value:
        normalized = _safe_label_string(item)
        if normalized is not None:
            safe_values.append(normalized)
    return safe_values


def _safe_label_stage_usage(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    safe_usage: dict[str, int] = {}
    for field_name in (
        "prompt_token_count",
        "candidates_token_count",
        "thoughts_token_count",
        "total_token_count",
        "cached_content_token_count",
    ):
        field_value = _safe_label_int(value.get(field_name))
        if field_value is not None:
            safe_usage[field_name] = field_value
    return safe_usage


def _safe_label_usage(value: Any) -> dict[str, dict[str, int]]:
    if not isinstance(value, dict):
        return {}
    safe_usage: dict[str, dict[str, int]] = {}
    for stage_name in ("extract", "assess"):
        stage_usage = _safe_label_stage_usage(value.get(stage_name))
        if stage_usage:
            safe_usage[stage_name] = stage_usage
    return safe_usage


def _sum_label_usage_field(
    usage: dict[str, dict[str, int]],
    field_name: str,
) -> int | None:
    total = 0
    found = False
    for stage_name in ("extract", "assess"):
        field_value = usage.get(stage_name, {}).get(field_name)
        if isinstance(field_value, int):
            total += field_value
            found = True
    return total if found else None


def _extract_label_observability(result: dict[str, Any]) -> dict[str, Any]:
    usage = _safe_label_usage(result.get("_label_usage") or result.get("_label_usage_metadata"))
    return {
        "primary_model": _safe_label_string(result.get("_label_primary_model")),
        "used_model": _safe_label_string(result.get("_label_used_model")),
        "fallback_used": result.get("_label_fallback_used") is True,
        "fallback_reason": _safe_label_string(result.get("_label_fallback_reason")),
        "diagnostic_reason": _safe_label_string(result.get("_label_diagnostic_reason")),
        "extract_finish_reason": _safe_label_int(result.get("_label_extract_finish_reason")),
        "assess_finish_reason": _safe_label_int(result.get("_label_assess_finish_reason")),
        "assess_skipped": result.get("_label_assess_skipped") is True,
        "assess_skip_reason": _safe_label_string(result.get("_label_assess_skip_reason")),
        "parse_status": _safe_label_string(result.get("_label_parse_status")),
        "parse_repaired": result.get("_label_parse_repaired") is True,
        "repair_strategy": _safe_label_string(result.get("_label_repair_strategy")),
        "repair_strategies": _safe_label_string_list(result.get("_label_repair_strategies")),
        "normalization_warnings": _safe_label_string_list(result.get("_label_normalization_warnings")),
        "parse_raw_text_length": _safe_label_int(result.get("_label_parse_raw_text_length")),
        "truncated": result.get("_label_truncated") is True,
        "partial": result.get("_label_partial") is True,
        "usage": usage,
        "usage_prompt_tokens": _sum_label_usage_field(usage, "prompt_token_count"),
        "usage_candidate_tokens": _sum_label_usage_field(usage, "candidates_token_count"),
        "usage_thought_tokens": _sum_label_usage_field(usage, "thoughts_token_count"),
        "usage_total_tokens": _sum_label_usage_field(usage, "total_token_count"),
    }


def _build_public_label_diagnostics(
    label_observability: dict[str, Any],
    label_error_type: Any,
    label_usage_source: str,
) -> dict[str, Any]:
    return {
        "fallback_used": bool(label_observability["fallback_used"]),
        "fallback_reason": label_observability["fallback_reason"],
        "diagnostic_reason": label_observability["diagnostic_reason"],
        "error_type": _safe_label_string(label_error_type),
        "extract_finish_reason": label_observability["extract_finish_reason"],
        "assess_finish_reason": label_observability["assess_finish_reason"],
        "assess_skipped": bool(label_observability["assess_skipped"]),
        "assess_skip_reason": label_observability["assess_skip_reason"],
        "parse_status": label_observability["parse_status"],
        "parse_repaired": bool(label_observability["parse_repaired"]),
        "repair_strategy": label_observability["repair_strategy"],
        "repair_strategies": label_observability["repair_strategies"],
        "normalization_warnings": label_observability["normalization_warnings"],
        "parse_raw_text_length": label_observability["parse_raw_text_length"],
        "partial": bool(label_observability["partial"]),
        "truncated": bool(label_observability["truncated"]),
        "usage_source": label_usage_source,
        "usage_total_tokens": label_observability["usage_total_tokens"],
        "usage_thought_tokens": label_observability["usage_thought_tokens"],
    }


def _safe_food_usage(value: Any) -> dict[str, int]:
    return _safe_label_stage_usage(value)


def _extract_food_observability(result: dict[str, Any]) -> dict[str, Any]:
    usage = _safe_food_usage(result.get("_food_usage") or result.get("_food_usage_metadata"))
    return {
        "primary_model": _safe_label_string(result.get("_food_primary_model")),
        "used_model": _safe_label_string(result.get("_food_used_model")) or _safe_label_string(result.get("used_model")),
        "fallback_used": result.get("_food_fallback_used") is True,
        "fallback_reason": _safe_label_string(result.get("_food_fallback_reason")),
        "finish_reason": _safe_label_int(result.get("_food_finish_reason")),
        "thinking_budget": _safe_label_int(result.get("_food_thinking_budget")),
        "truncated": result.get("_food_truncated") is True,
        "usage": usage,
        "usage_prompt_tokens": usage.get("prompt_token_count"),
        "usage_candidate_tokens": usage.get("candidates_token_count"),
        "usage_thought_tokens": usage.get("thoughts_token_count"),
        "usage_total_tokens": usage.get("total_token_count"),
    }


def _build_public_analysis_diagnostics(
    food_observability: dict[str, Any],
    usage_source: str,
) -> dict[str, Any]:
    return {
        "origin": "food_photo",
        "fallback_used": bool(food_observability["fallback_used"]),
        "fallback_reason": food_observability["fallback_reason"],
        "finish_reason": food_observability["finish_reason"],
        "truncated": bool(food_observability["truncated"]),
        "usage_source": usage_source,
    }


def _extract_barcode_observability(result: dict[str, Any]) -> dict[str, Any]:
    usage = _safe_label_stage_usage(result.get("_barcode_usage") or result.get("_barcode_usage_metadata"))
    return {
        "chargeable": result.get("_barcode_chargeable") is not False,
        "fallback_used": result.get("_barcode_fallback_used") is True,
        "fallback_reason": _safe_label_string(result.get("_barcode_fallback_reason")),
        "error_type": _safe_label_string(result.get("_barcode_error_type")),
        "finish_reason": _safe_label_int(result.get("_barcode_finish_reason")),
        "truncated": result.get("_barcode_truncated") is True,
        "usage": usage,
        "usage_prompt_tokens": usage.get("prompt_token_count"),
        "usage_candidate_tokens": usage.get("candidates_token_count"),
        "usage_thought_tokens": usage.get("thoughts_token_count"),
        "usage_total_tokens": usage.get("total_token_count"),
    }


def _build_smart_analysis_diagnostics_result(result: dict[str, Any]) -> dict[str, Any]:
    analysis_diagnostics = result.get("analysis_diagnostics")
    if not isinstance(analysis_diagnostics, dict):
        return result
    routed_result = dict(result)
    routed_result["analysis_diagnostics"] = {
        **analysis_diagnostics,
        "origin": "smart_route",
    }
    return routed_result


def _strip_internal_analysis_metadata(result: dict[str, Any]) -> None:
    for key in list(result.keys()):
        if key.startswith("_food_"):
            result.pop(key, None)


def _select_barcode_ingredients_after_allergen_analysis(
    original_ingredients: list[Any],
    analyzed_ingredients: Any,
) -> list[Any]:
    if isinstance(analyzed_ingredients, list) and len(analyzed_ingredients) > 0:
        return analyzed_ingredients
    return original_ingredients


def _is_label_rollout_auto_enabled() -> bool:
    return os.environ.get("LABEL_ROLLOUT_AUTO_ENABLED", "0").strip() == "1"


def _retention_cleanup_interval_seconds() -> float:
    return max(5.0, _env_float("RETENTION_CLEANUP_INTERVAL_SECONDS", 3600.0))


def _deletion_queue_interval_seconds() -> float:
    return max(1.0, _env_float("DELETION_QUEUE_INTERVAL_SECONDS", 30.0))


def _deletion_queue_max_batch() -> int:
    return max(1, _env_int("DELETION_QUEUE_MAX_BATCH", 20))


def _deletion_queue_lease_seconds() -> int:
    return max(30, _env_int("DELETION_QUEUE_LEASE_SECONDS", 300))


PROCESS_ROLE_WEB = "web"
PROCESS_ROLE_WORKER = "worker"
PROCESS_ROLE_CRON = "cron"
SUPPORTED_PROCESS_ROLES = {
    PROCESS_ROLE_WEB,
    PROCESS_ROLE_WORKER,
    PROCESS_ROLE_CRON,
}


def _normalize_process_role(process_role: str) -> str:
    normalized = (process_role or "").strip().lower()
    if normalized not in SUPPORTED_PROCESS_ROLES:
        raise RuntimeError(f"Unsupported FoodLens process role: {process_role}")
    return normalized


def _current_process_role() -> str:
    current = getattr(app.state, "process_role", PROCESS_ROLE_WEB)
    return _normalize_process_role(str(current))


def _analysis_job_worker_count() -> int:
    return max(0, _env_int("ANALYSIS_JOB_WORKER_COUNT", 1))


def _analysis_job_lease_seconds() -> int:
    return max(15, _env_int("ANALYSIS_JOB_LEASE_SECONDS", 90))


def _analysis_job_poll_after_ms() -> int:
    return max(250, _env_int("ANALYSIS_JOB_POLL_AFTER_MS", 1000))


def _analysis_job_poll_interval_seconds() -> float:
    return max(0.1, _env_float("ANALYSIS_JOB_POLL_INTERVAL_SECONDS", 0.5))


def _analysis_job_worker_heartbeat_interval_seconds() -> float:
    return max(5.0, _env_float("ANALYSIS_JOB_WORKER_HEARTBEAT_INTERVAL_SECONDS", 15.0))


def _analysis_job_worker_heartbeat_stale_after_seconds() -> float:
    default_stale_after_seconds = max(_analysis_job_worker_heartbeat_interval_seconds() * 3.0, 45.0)
    return max(
        _analysis_job_worker_heartbeat_interval_seconds(),
        _env_float("ANALYSIS_JOB_WORKER_HEARTBEAT_STALE_AFTER_SECONDS", default_stale_after_seconds),
    )


def _analysis_job_worker_heartbeat_state_key() -> str:
    return _env_str("ANALYSIS_JOB_WORKER_HEARTBEAT_STATE_KEY", "analysis_job_worker_heartbeat")


def _analysis_job_backend_name() -> str:
    configured_backend = (os.environ.get("ANALYSIS_JOB_BACKEND") or "").strip().lower()
    if configured_backend:
        return configured_backend
    if _is_openapi_export_mode():
        return "memory"
    return "postgres" if (os.environ.get("DATABASE_URL") or "").strip() else "memory"


def _auth_state_backend_name() -> str:
    configured_backend = (os.environ.get("AUTH_STATE_BACKEND") or "").strip().lower()
    if configured_backend:
        return configured_backend
    return "postgres" if (os.environ.get("DATABASE_URL") or "").strip() else "memory"


def _build_analysis_job_worker_heartbeat_store() -> PostgresAuthStateStore | None:
    database_url = (os.environ.get("DATABASE_URL") or "").strip()
    if _auth_state_backend_name() != "postgres" or not database_url:
        return None
    return PostgresAuthStateStore(
        database_url=database_url,
        table_name=_env_str("AUTH_STATE_TABLE", "auth_runtime_state"),
        state_key=_analysis_job_worker_heartbeat_state_key(),
    )


def _is_analysis_job_remote_worker_required() -> bool:
    if _is_openapi_export_mode():
        return False
    if _current_process_role() != PROCESS_ROLE_WEB:
        return False
    if _analysis_job_backend_name() != "postgres":
        return False
    return _build_analysis_job_worker_heartbeat_store() is not None


def _read_analysis_job_remote_worker_heartbeat_snapshot() -> dict[str, Any] | None:
    override_snapshot = getattr(app.state, "analysis_job_remote_worker_heartbeat_override", None)
    if isinstance(override_snapshot, dict):
        return override_snapshot
    store = _build_analysis_job_worker_heartbeat_store()
    if store is None:
        return None
    try:
        snapshot = store.load()
    except AuthStateStoreError as error:
        logger.error("[AnalysisJob] remote worker heartbeat load failed error=%s", str(error))
        return None
    if isinstance(snapshot, dict):
        return snapshot
    return None


def _analysis_job_remote_worker_heartbeat_age_seconds(snapshot: dict[str, Any] | None) -> float | None:
    if not isinstance(snapshot, dict):
        return None
    raw_value = snapshot.get("heartbeat_epoch_seconds")
    if not isinstance(raw_value, int | float):
        return None
    return max(0.0, time.time() - float(raw_value))


def _analysis_job_remote_worker_readiness() -> tuple[bool, dict[str, Any] | None]:
    if not _is_analysis_job_remote_worker_required():
        return True, None
    snapshot = _read_analysis_job_remote_worker_heartbeat_snapshot()
    heartbeat_age_seconds = _analysis_job_remote_worker_heartbeat_age_seconds(snapshot)
    if heartbeat_age_seconds is None:
        return False, snapshot
    return heartbeat_age_seconds <= _analysis_job_worker_heartbeat_stale_after_seconds(), snapshot


def _analysis_job_max_upload_bytes() -> int:
    return max(128 * 1024, _env_int("ANALYSIS_JOB_MAX_UPLOAD_BYTES", 900_000))


def _analysis_job_allowed_content_types() -> set[str]:
    raw = _env_str("ANALYSIS_JOB_ALLOWED_CONTENT_TYPES", ",".join(sorted(MEDIA_ALLOWED_UPLOAD_CONTENT_TYPES)))
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def _reset_runtime_state() -> None:
    defaults: dict[str, Any] = {
        "startup_completed": False,
        "auth_service": None,
        "media_storage": None,
        "analysis_job_store": None,
        "analysis_nutrition_cache_store": None,
        "analysis_nutrition_service": None,
        "analysis_job_workers": [],
        "analysis_job_worker_heartbeat_store": None,
        "analysis_job_worker_heartbeat_task": None,
        "analysis_job_worker_started_at": None,
        "analysis_job_remote_worker_heartbeat_override": None,
        "retention_policy": None,
        "retention_store": None,
        "retention_cleanup_job": None,
        "retention_cleanup_task": None,
        "deletion_queue_storage": None,
        "deletion_queue_producer": None,
        "deletion_queue_consumer": None,
        "deletion_queue_task": None,
        "analyst": None,
        "barcode_service": None,
        "smart_router": None,
        "label_cost_guardrail": None,
        "analysis_cost_guardrail": None,
        "label_rollout_controller": None,
        "label_rollout_auto_manager": None,
        "label_rollout_kpi_thresholds": None,
        "analysis_rate_limiter": None,
        "analysis_admission_limiter": None,
        "analysis_admission_retry_after_seconds": 1,
    }
    for name, value in defaults.items():
        setattr(app.state, name, value)


def _initialize_auth_and_media_runtime() -> None:
    app.state.auth_service = InMemoryAuthSessionService.from_env(os.environ.get)
    app.state.media_storage = build_media_storage_from_env(os.environ.get)
    app.state.media_render_signing_secret = _env_str(
        "MEDIA_RENDER_SIGNING_SECRET",
        _env_str("AUTH_STATE_KEY", "foodlens-media-dev-secret"),
    )
    app.state.media_render_url_ttl_seconds = max(60, _env_int("MEDIA_RENDER_URL_TTL_SECONDS", 86_400))
    app.state.media_render_allowed_widths = {
        int(part.strip())
        for part in _env_str("MEDIA_RENDER_ALLOWED_WIDTHS", "128,256,512,1024").split(",")
        if part.strip().isdigit()
    } or {128, 256, 512, 1024}
    app.state.media_render_quality_min = max(1, _env_int("MEDIA_RENDER_QUALITY_MIN", 50))
    app.state.media_render_quality_max = min(100, _env_int("MEDIA_RENDER_QUALITY_MAX", 85))
    app.state.media_public_base_url = _env_str("MEDIA_PUBLIC_BASE_URL", _env_str("AUTH_PUBLIC_BASE_URL", ""))
    app.state.media_render_default_width = _env_int("MEDIA_RENDER_DEFAULT_WIDTH", 512)
    app.state.media_render_default_quality = _env_int("MEDIA_RENDER_DEFAULT_QUALITY", 75)
    app.state.media_render_webp_method = max(0, min(6, _env_int("MEDIA_RENDER_WEBP_METHOD", 4)))
    app.state.media_render_sign_bucket_seconds = max(0, _env_int("MEDIA_RENDER_SIGN_BUCKET_SECONDS", 3600))
    app.state.media_render_cache_enabled = os.environ.get("MEDIA_RENDER_CACHE_ENABLED", "1").strip() == "1"
    app.state.media_render_cache_max_items = max(1, _env_int("MEDIA_RENDER_CACHE_MAX_ITEMS", 256))
    app.state.media_render_cache_ttl_seconds = max(1, _env_int("MEDIA_RENDER_CACHE_TTL_SECONDS", 300))
    app.state.media_render_cache = OrderedDict()
    app.state.media_render_cache_lock = asyncio.Lock()
    app.state.media_render_inflight_tasks = {}
    app.state.media_render_inflight_lock = asyncio.Lock()
    app.state.media_render_max_concurrent_misses = max(
        0,
        _env_int("MEDIA_RENDER_MAX_CONCURRENT_MISSES", 2),
    )
    app.state.media_render_miss_semaphore = _build_media_render_miss_semaphore(
        app.state.media_render_max_concurrent_misses
    )
    logger.info(
        "[Auth] state backend initialized backend=%s",
        getattr(app.state.auth_service, "state_backend", "memory"),
    )
    logger.info(
        "[Media] storage enabled=%s",
        getattr(app.state.media_storage, "enabled", False),
    )


def _build_analysis_job_worker_heartbeat_payload(*, started_at: str, worker_ids: list[str]) -> dict[str, Any]:
    heartbeat_at = datetime.now(timezone.utc)
    return {
        "heartbeat_at": heartbeat_at.isoformat(),
        "heartbeat_epoch_seconds": heartbeat_at.timestamp(),
        "process_role": _current_process_role(),
        "pid": os.getpid(),
        "started_at": started_at,
        "worker_count": len(worker_ids),
        "worker_ids": worker_ids,
    }


async def _run_analysis_job_worker_heartbeat_loop() -> None:
    interval_seconds = _analysis_job_worker_heartbeat_interval_seconds()
    started_at = str(getattr(app.state, "analysis_job_worker_started_at", datetime.now(timezone.utc).isoformat()))
    while True:
        try:
            worker_ids = [
                str(getattr(worker, "worker_id", "unknown"))
                for worker in list(getattr(app.state, "analysis_job_workers", []))
            ]
            payload = _build_analysis_job_worker_heartbeat_payload(started_at=started_at, worker_ids=worker_ids)
            store = getattr(app.state, "analysis_job_worker_heartbeat_store", None)
            if store is not None:
                await run_in_threadpool(store.save, payload)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.exception("[AnalysisJob] worker heartbeat save failed error=%s", str(error))
        await asyncio.sleep(interval_seconds)


def _initialize_analysis_runtime() -> None:
    app.state.analysis_job_store = build_analysis_job_store_from_env(os.environ.get)
    app.state.analysis_nutrition_cache_store = build_nutrition_cache_store_from_env(os.environ.get)
    for store in (app.state.analysis_job_store, app.state.analysis_nutrition_cache_store):
        initialize_schema = getattr(store, "initialize_schema", None)
        if callable(initialize_schema):
            initialize_schema()
    app.state.analysis_nutrition_service = NutritionEnrichmentService(
        cache_store=app.state.analysis_nutrition_cache_store,
        lookup_func=lookup_nutrition,
        budget_seconds=_env_float("ANALYSIS_NUTRITION_BUDGET_SECONDS", 3.0),
        max_parallelism=max(1, _env_int("ANALYSIS_NUTRITION_MAX_PARALLELISM", 4)),
    )


def _build_analysis_job_workers() -> list[AnalysisJobWorker]:
    worker_count = _analysis_job_worker_count()
    return [
        AnalysisJobWorker(
            store=app.state.analysis_job_store,
            nutrition_service=app.state.analysis_nutrition_service,
            get_analyst=lambda: _service("analyst"),
            get_smart_router=lambda: _service("smart_router"),
            analyze_label_with_policy=_analyze_label_image_with_policy,
            analyze_food_with_policy=_analyze_food_job_image_with_policy,
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            lease_seconds=_analysis_job_lease_seconds(),
            poll_interval_seconds=_analysis_job_poll_interval_seconds(),
            worker_id=f"worker-{index + 1}",
        )
        for index in range(worker_count)
    ]


def _start_analysis_job_workers() -> None:
    workers = _build_analysis_job_workers()
    if len(workers) == 0:
        raise RuntimeError("ANALYSIS_JOB_WORKER_COUNT must be at least 1 for the worker runtime.")
    app.state.analysis_job_workers = workers
    for worker in app.state.analysis_job_workers:
        worker.start()
    logger.info(
        "[AnalysisJob] workers initialized count=%d backend=%s",
        len(app.state.analysis_job_workers),
        type(app.state.analysis_job_store).__name__,
    )


def _initialize_retention_runtime() -> None:
    app.state.retention_policy = RetentionPolicyConfig.from_env(os.environ.get)
    database_url = _env_str("DATABASE_URL", "")
    retention_store_backend = _env_str("RETENTION_STORE_BACKEND", "memory").lower()
    if retention_store_backend == "file":
        retention_store = JsonFileRetentionStore(_env_str("RETENTION_STORE_PATH", "/tmp/foodlens_retention_store.json"))
    elif retention_store_backend == "postgres":
        retention_store = PostgresRetentionStore(
            database_url=database_url,
            table_name=_env_str("RETENTION_STORE_TABLE", "retention_records"),
        )
    else:
        retention_store = InMemoryRetentionStore()
    app.state.retention_store = retention_store

    retention_delete_backend = _env_str("RETENTION_DELETE_BACKEND", "noop").lower()
    if retention_delete_backend == "local_file":
        delete_roots = [part.strip() for part in _env_str("RETENTION_DELETE_ROOTS", "").split(",") if part.strip()]
        cleanup_adapter = LocalFileRetentionCleanupAdapter(delete_roots)
    elif retention_delete_backend == "media_asset":
        cleanup_adapter = CallbackRetentionCleanupAdapter(_delete_media_retention_record)
    else:
        cleanup_adapter = NoOpRetentionCleanupAdapter()

    app.state.retention_cleanup_job = RetentionCleanupJob(
        store=retention_store,
        policy=app.state.retention_policy,
        adapter=cleanup_adapter,
    )


def _initialize_deletion_queue_runtime() -> None:
    database_url = _env_str("DATABASE_URL", "")
    deletion_queue_backend = _env_str("DELETION_QUEUE_BACKEND", "memory").lower()
    if deletion_queue_backend == "file":
        deletion_storage = JsonFileDeletionQueueStorage(_env_str("DELETION_QUEUE_PATH", "/tmp/foodlens_deletion_queue.json"))
    elif deletion_queue_backend == "postgres":
        deletion_storage = PostgresDeletionQueueStorage(
            database_url=database_url,
            queue_table_name=_env_str("DELETION_QUEUE_TABLE", "deletion_queue"),
            status_table_name=_env_str("DELETION_STATUS_TABLE", "deletion_statuses"),
        )
    else:
        deletion_storage = InMemoryDeletionQueueStorage()
    app.state.deletion_queue_storage = deletion_storage
    app.state.deletion_queue_producer = DeletionQueueProducer(deletion_storage)

    deletion_handler_backend = _env_str("DELETION_HANDLER_BACKEND", "user").lower()
    if deletion_handler_backend == "noop":
        deletion_handler = NoOpDeletionHandler()
    else:
        deletion_handler = UserDeletionHandler(
            auth_service=app.state.auth_service,
            media_storage=app.state.media_storage,
            retention_store=app.state.retention_store,
        )
    app.state.deletion_queue_consumer = DeletionQueueConsumer(deletion_storage, deletion_handler)


def _initialize_core_runtime_services() -> None:
    analyst, barcode_service, smart_router = initialize_services()
    app.state.analyst = analyst
    app.state.barcode_service = barcode_service
    app.state.smart_router = smart_router


def _initialize_label_policy_controls() -> None:
    label_cost_guardrail_storage = _build_label_cost_guardrail_storage()
    app.state.analysis_cost_guardrail = CostGuardrailService(
        label_cost_guardrail_storage,
        monthly_budget_usd=_env_float("AI_MONTHLY_BUDGET_USD", _env_float("LABEL_MONTHLY_BUDGET_USD", 10.0)),
    )
    app.state.label_cost_guardrail = app.state.analysis_cost_guardrail
    logger.info(
        "[AnalysisCostGuardrail] enabled=%s storage=%s monthly_budget_usd=%.2f warn_ratio=%.2f degrade_ratio=%.2f fallback_ratio=%.2f",
        _is_analysis_cost_guardrail_enabled(),
        type(label_cost_guardrail_storage).__name__,
        _env_float("AI_MONTHLY_BUDGET_USD", _env_float("LABEL_MONTHLY_BUDGET_USD", 10.0)),
        0.70,
        0.85,
        1.00,
    )
    app.state.label_rollout_controller = LabelRolloutController(RolloutConfig.from_env())
    if _is_label_rollout_auto_enabled():
        rollout_state_backend = _env_str("LABEL_ROLLOUT_STATE_BACKEND", "file").lower()
        if rollout_state_backend == "memory":
            rollout_state_store = InMemoryRolloutStateStore()
        else:
            rollout_state_store = JsonFileRolloutStateStore(
                _env_str("LABEL_ROLLOUT_STATE_PATH", "/tmp/foodlens_rollout_state.json")
            )
        app.state.label_rollout_auto_manager = LabelRolloutAutoManager(
            rollout_state_store,
            promote_after_passes=max(1, _env_int("LABEL_ROLLOUT_PROMOTE_AFTER_PASSES", 3)),
            rollback_stage=_env_str("LABEL_ROLLOUT_ROLLBACK_STAGE", "rollback-0"),
        )
    else:
        app.state.label_rollout_auto_manager = None
    app.state.label_rollout_kpi_thresholds = KpiThresholds()


def _initialize_api_runtime_controls() -> None:
    _initialize_label_policy_controls()
    rate_limit_settings = build_rate_limit_settings_from_env()
    if rate_limit_settings.enabled:
        app.state.analysis_rate_limiter = InMemorySlidingWindowRateLimiter(
            endpoint_limits_per_minute=rate_limit_settings.endpoint_limits_per_minute,
            window_seconds=rate_limit_settings.window_seconds,
        )
        logger.info(
            "[RateLimit] enabled window_seconds=%d limits=%s",
            rate_limit_settings.window_seconds,
            rate_limit_settings.endpoint_limits_per_minute,
        )
    else:
        app.state.analysis_rate_limiter = None
        logger.info("[RateLimit] disabled")

    inflight_settings = build_inflight_admission_settings_from_env()
    if inflight_settings.enabled:
        app.state.analysis_admission_limiter = InMemoryEndpointAdmissionLimiter(
            endpoint_max_inflight=inflight_settings.endpoint_max_inflight,
        )
        app.state.analysis_admission_retry_after_seconds = inflight_settings.retry_after_seconds
        logger.info(
            "[Admission] enabled retry_after_seconds=%d limits=%s",
            inflight_settings.retry_after_seconds,
            inflight_settings.endpoint_max_inflight,
        )
    else:
        app.state.analysis_admission_limiter = None
        app.state.analysis_admission_retry_after_seconds = 1
        logger.info("[Admission] disabled")


async def _startup_runtime(process_role: str) -> None:
    normalized_role = _normalize_process_role(process_role)
    _reset_runtime_state()
    app.state.process_role = normalized_role
    _initialize_auth_and_media_runtime()

    if normalized_role in {PROCESS_ROLE_WEB, PROCESS_ROLE_WORKER}:
        _initialize_analysis_runtime()

    _initialize_retention_runtime()

    if normalized_role in {PROCESS_ROLE_WEB, PROCESS_ROLE_WORKER}:
        _initialize_deletion_queue_runtime()

    if _is_openapi_export_mode():
        if normalized_role != PROCESS_ROLE_WEB:
            raise RuntimeError("OPENAPI_EXPORT_ONLY=1 is only supported for the web runtime.")
        app.state.startup_completed = True
        logger.info("[Startup] OPENAPI_EXPORT_ONLY=1, runtime service initialization skipped.")
        return

    if normalized_role in {PROCESS_ROLE_WEB, PROCESS_ROLE_WORKER}:
        _initialize_core_runtime_services()

    if normalized_role == PROCESS_ROLE_WEB:
        _initialize_api_runtime_controls()

    if normalized_role == PROCESS_ROLE_WORKER:
        _initialize_label_policy_controls()
        _start_analysis_job_workers()
        app.state.analysis_job_worker_heartbeat_store = _build_analysis_job_worker_heartbeat_store()
        app.state.analysis_job_worker_started_at = datetime.now(timezone.utc).isoformat()
        app.state.analysis_job_worker_heartbeat_task = asyncio.create_task(_run_analysis_job_worker_heartbeat_loop())
        app.state.deletion_queue_task = asyncio.create_task(_deletion_queue_loop())

    app.state.startup_completed = True


async def _shutdown_runtime() -> None:
    for worker in list(getattr(app.state, "analysis_job_workers", [])):
        await worker.stop()
    for task_name in ("analysis_job_worker_heartbeat_task", "retention_cleanup_task", "deletion_queue_task"):
        task = getattr(app.state, task_name, None)
        if task is None:
            continue
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def startup_web_runtime() -> None:
    await _startup_runtime(PROCESS_ROLE_WEB)


async def startup_worker_runtime() -> None:
    await _startup_runtime(PROCESS_ROLE_WORKER)


async def startup_retention_cron_runtime() -> None:
    await _startup_runtime(PROCESS_ROLE_CRON)


async def shutdown_runtime() -> None:
    await _shutdown_runtime()


async def run_retention_cleanup_pass() -> None:
    await _run_retention_cleanup_once()


@app.on_event("startup")
async def _startup() -> None:
    await startup_web_runtime()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await shutdown_runtime()


def _service(name: str) -> Any:
    service = getattr(app.state, name, None)
    if service is None:
        raise raise_service_unavailable(name)
    return service


def _task_is_running(task: Any) -> bool:
    if task is None:
        return False
    done = getattr(task, "done", None)
    if not callable(done):
        return False
    try:
        return not bool(done())
    except Exception:
        return False


def _is_media_storage_ready() -> tuple[bool, bool]:
    media_storage = getattr(app.state, "media_storage", None)
    if media_storage is None:
        return False, False

    media_storage_enabled = bool(getattr(media_storage, "enabled", False))
    media_backend = _env_str("MEDIA_STORAGE_BACKEND", "gcs").strip().lower()
    if media_backend in {"disabled", "off", "none"}:
        return True, media_storage_enabled

    return media_storage_enabled, media_storage_enabled


def _build_readiness_report() -> tuple[dict[str, Any], int]:
    process_role = _current_process_role()
    export_mode = _is_openapi_export_mode()
    startup_completed = bool(getattr(app.state, "startup_completed", False))
    auth_service_ready = getattr(app.state, "auth_service", None) is not None
    media_storage_ready, media_storage_enabled = _is_media_storage_ready()
    analysis_job_store_ready = getattr(app.state, "analysis_job_store", None) is not None
    analysis_nutrition_service_ready = getattr(app.state, "analysis_nutrition_service", None) is not None
    retention_store_ready = getattr(app.state, "retention_store", None) is not None
    retention_cleanup_job_ready = getattr(app.state, "retention_cleanup_job", None) is not None
    deletion_queue_producer_ready = getattr(app.state, "deletion_queue_producer", None) is not None
    deletion_queue_consumer_ready = getattr(app.state, "deletion_queue_consumer", None) is not None
    retention_cleanup_task_ready = _task_is_running(getattr(app.state, "retention_cleanup_task", None))
    deletion_queue_task_ready = _task_is_running(getattr(app.state, "deletion_queue_task", None))
    core_services_ready = all(
        getattr(app.state, service_name, None) is not None
        for service_name in ("analyst", "barcode_service", "smart_router")
    )

    analysis_job_workers = getattr(app.state, "analysis_job_workers", None)
    analysis_job_workers_ready = (
        isinstance(analysis_job_workers, list)
        and len(analysis_job_workers) > 0
        and all(_task_is_running(getattr(worker, "_task", None)) for worker in analysis_job_workers)
    )
    analysis_job_remote_worker_ready, analysis_job_remote_worker_snapshot = _analysis_job_remote_worker_readiness()
    analysis_job_remote_worker_age_seconds = _analysis_job_remote_worker_heartbeat_age_seconds(
        analysis_job_remote_worker_snapshot
    )

    checks = {
        "process_role": process_role,
        "startup_completed": startup_completed,
        "openapi_export_mode": export_mode,
        "auth_service": auth_service_ready,
        "media_storage": media_storage_ready,
        "media_storage_enabled": media_storage_enabled,
        "analysis_job_store": analysis_job_store_ready,
        "analysis_nutrition_service": analysis_nutrition_service_ready,
        "analysis_job_workers": analysis_job_workers_ready,
        "analysis_job_remote_worker": analysis_job_remote_worker_ready,
        "retention_store": retention_store_ready,
        "retention_cleanup_job": retention_cleanup_job_ready,
        "deletion_queue_producer": deletion_queue_producer_ready,
        "deletion_queue_consumer": deletion_queue_consumer_ready,
        "retention_cleanup_task": retention_cleanup_task_ready,
        "deletion_queue_task": deletion_queue_task_ready,
        "core_services": core_services_ready,
    }

    required_checks = [
        "startup_completed",
        "auth_service",
        "media_storage",
        "retention_store",
    ]
    if process_role in {PROCESS_ROLE_WEB, PROCESS_ROLE_WORKER}:
        required_checks.extend(
            [
                "analysis_job_store",
                "analysis_nutrition_service",
                "deletion_queue_producer",
                "deletion_queue_consumer",
            ]
        )
    if process_role == PROCESS_ROLE_WEB:
        if not export_mode:
            required_checks.append("core_services")
        if _is_analysis_job_remote_worker_required():
            required_checks.append("analysis_job_remote_worker")
    elif process_role == PROCESS_ROLE_WORKER:
        required_checks.extend(
            [
                "analysis_job_workers",
                "deletion_queue_task",
                "core_services",
            ]
        )
    elif process_role == PROCESS_ROLE_CRON:
        required_checks.append("retention_cleanup_job")

    issue_catalog = {
        "startup_completed": {
            "code": "STARTUP_NOT_COMPLETED",
            "message": "Startup did not finish initializing the runtime state.",
        },
        "auth_service": {
            "code": "AUTH_SERVICE_MISSING",
            "message": "app.state.auth_service is missing or uninitialized.",
        },
        "media_storage": {
            "code": "MEDIA_STORAGE_NOT_READY",
            "message": "Media storage is missing, uninitialized, or disabled for the configured backend.",
        },
        "analysis_job_store": {
            "code": "ANALYSIS_JOB_STORE_MISSING",
            "message": "app.state.analysis_job_store is missing or uninitialized.",
        },
        "analysis_nutrition_service": {
            "code": "ANALYSIS_NUTRITION_SERVICE_MISSING",
            "message": "app.state.analysis_nutrition_service is missing or uninitialized.",
        },
        "analysis_job_workers": {
            "code": "ANALYSIS_JOB_WORKERS_NOT_READY",
            "message": "Analysis job workers are missing or not running.",
        },
        "analysis_job_remote_worker": {
            "code": "ANALYSIS_JOB_REMOTE_WORKER_NOT_READY",
            "message": "The shared analysis worker heartbeat is missing or stale.",
        },
        "retention_store": {
            "code": "RETENTION_STORE_MISSING",
            "message": "app.state.retention_store is missing or uninitialized.",
        },
        "retention_cleanup_job": {
            "code": "RETENTION_CLEANUP_JOB_MISSING",
            "message": "app.state.retention_cleanup_job is missing or uninitialized.",
        },
        "deletion_queue_producer": {
            "code": "DELETION_QUEUE_PRODUCER_MISSING",
            "message": "app.state.deletion_queue_producer is missing or uninitialized.",
        },
        "deletion_queue_consumer": {
            "code": "DELETION_QUEUE_CONSUMER_MISSING",
            "message": "app.state.deletion_queue_consumer is missing or uninitialized.",
        },
        "deletion_queue_task": {
            "code": "DELETION_QUEUE_TASK_NOT_RUNNING",
            "message": "Deletion queue task is missing or stopped.",
        },
        "core_services": {
            "code": "CORE_SERVICES_MISSING",
            "message": "Runtime analysis services are missing or uninitialized.",
        },
    }

    issues: list[dict[str, str]] = []
    if export_mode:
        issues.append(
            {
                "code": "OPENAPI_EXPORT_ONLY",
                "message": "OPENAPI_EXPORT_ONLY=1 disables runtime service readiness.",
            }
        )
    for check_name in required_checks:
        if checks[check_name]:
            continue
        issues.append(dict(issue_catalog[check_name]))

    status = "ready" if not issues else "not_ready"
    payload = {
        "status": status,
        "ready": not issues,
        "process_role": process_role,
        "required_checks": required_checks,
        "checks": checks,
        "issues": issues,
    }
    if isinstance(analysis_job_remote_worker_snapshot, dict):
        payload["analysis_job_remote_worker_heartbeat_at"] = analysis_job_remote_worker_snapshot.get("heartbeat_at")
    if analysis_job_remote_worker_age_seconds is not None:
        payload["analysis_job_remote_worker_age_seconds"] = analysis_job_remote_worker_age_seconds
    return payload, 200 if not issues else 503

LOCALE_TO_ISO = {
    "ko-kr": "KR",
    "en-us": "US",
    "ja-jp": "JP",
    "zh-hans": "CN",
    "th-th": "TH",
    "vi-vn": "VN",
}

OAUTH_PROVIDER_CONFIG = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "client_id_env": "AUTH_GOOGLE_CLIENT_ID",
        "scope_env": "AUTH_GOOGLE_OAUTH_SCOPE",
        "scope_default": "openid email profile",
        "default_app_redirect_uri": "foodlens://oauth/google-callback",
        "callback_path": "/auth/google/callback",
    },
    "kakao": {
        "authorize_url": "https://kauth.kakao.com/oauth/authorize",
        "client_id_env": "AUTH_KAKAO_CLIENT_ID",
        "scope_env": "AUTH_KAKAO_OAUTH_SCOPE",
        "scope_default": "",
        "default_app_redirect_uri": "foodlens://oauth/kakao-callback",
        "callback_path": "/auth/kakao/callback",
    },
}

DEFAULT_APP_LOGOUT_REDIRECT_URI = "foodlens://oauth/logout-complete"
DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS = 15.0
MEDIA_ALLOWED_UPLOAD_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_remote_media_reference(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    parsed = urlparse(normalized)
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"}:
        return None
    if not parsed.netloc:
        return None
    return normalized


def _is_local_media_reference(value: str | None) -> bool:
    return _normalize_remote_media_reference(value) is None


def _resolve_media_public_base_url(request: Request) -> str:
    configured = getattr(app.state, "media_public_base_url", "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _media_render_signature(asset_id: str, width: int, quality: int, fmt: str, exp: int) -> str:
    secret = getattr(app.state, "media_render_signing_secret", "")
    payload = f"{asset_id}:{width}:{quality}:{fmt}:{exp}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _build_media_render_url(
    request: Request,
    *,
    asset_id: str,
    width: int | None = None,
    quality: int | None = None,
    fmt: str = "auto",
) -> str:
    default_width = int(getattr(app.state, "media_render_default_width", 512))
    default_quality = int(getattr(app.state, "media_render_default_quality", 75))
    final_width = width or default_width
    final_quality = quality or default_quality
    ttl_seconds = int(getattr(app.state, "media_render_url_ttl_seconds", 86_400))
    sign_bucket_seconds = int(getattr(app.state, "media_render_sign_bucket_seconds", 3600))
    now_ts = int(time.time())
    exp = _compute_media_render_expiration(
        now_ts=now_ts,
        ttl_seconds=ttl_seconds,
        sign_bucket_seconds=sign_bucket_seconds,
    )
    sig = _media_render_signature(asset_id, final_width, final_quality, fmt, exp)
    base_url = _resolve_media_public_base_url(request)
    query = urlencode({"w": final_width, "q": final_quality, "fmt": fmt, "exp": exp, "sig": sig})
    return f"{base_url}/media/render/{asset_id}?{query}"


def _verify_media_render_signature(
    *,
    asset_id: str,
    width: int,
    quality: int,
    fmt: str,
    exp: int,
    sig: str,
) -> bool:
    expected = _media_render_signature(asset_id, width, quality, fmt, exp)
    return hmac.compare_digest(expected, sig)


def _compute_media_render_expiration(
    *,
    now_ts: int,
    ttl_seconds: int,
    sign_bucket_seconds: int,
) -> int:
    safe_ttl = max(60, int(ttl_seconds))
    fallback_exp = now_ts + safe_ttl
    if sign_bucket_seconds <= 0:
        return fallback_exp
    safe_bucket_seconds = max(60, int(sign_bucket_seconds))
    bucket_end = ((now_ts // safe_bucket_seconds) + 1) * safe_bucket_seconds
    exp = min(fallback_exp, bucket_end)
    if exp <= now_ts:
        return fallback_exp
    return exp


def _media_render_variant_key(
    *,
    asset_id: str,
    width: int,
    quality: int,
    target_format: str,
) -> str:
    return f"{asset_id}:{width}:{quality}:{target_format}"


def _is_media_render_cache_operational() -> bool:
    if not bool(getattr(app.state, "media_render_cache_enabled", False)):
        return False
    cache = getattr(app.state, "media_render_cache", None)
    lock = getattr(app.state, "media_render_cache_lock", None)
    return cache is not None and lock is not None


def _media_render_cache_header_value(*, cache_hit: bool) -> str:
    if cache_hit:
        return "hit"
    if _is_media_render_cache_operational():
        return "miss"
    return "disabled"


def _media_render_cache_diagnostic_headers(*, request_id: str, cache_hit: bool) -> dict[str, str]:
    return {
        "X-Request-Id": request_id,
        "X-Media-Render-Cache": _media_render_cache_header_value(cache_hit=cache_hit),
    }


def _format_media_render_stage_header(stage_ms: dict[str, int]) -> str:
    return ",".join(f"{name}={stage_ms[name]}" for name in sorted(stage_ms))


def _media_render_http_exception(error: HTTPException, *, request_id: str) -> HTTPException:
    headers: dict[str, str] = {}
    if error.headers is not None:
        headers.update(error.headers)
    headers.update(_media_render_cache_diagnostic_headers(request_id=request_id, cache_hit=False))
    return HTTPException(
        status_code=error.status_code,
        detail=error.detail,
        headers=headers,
    )


async def _media_render_cache_get(variant_key: str, now_ts: int) -> tuple[bytes, str] | None:
    cache = getattr(app.state, "media_render_cache", None)
    lock = getattr(app.state, "media_render_cache_lock", None)
    if not _is_media_render_cache_operational() or cache is None or lock is None:
        return None
    async with lock:
        entry = cache.get(variant_key)
        if not entry:
            return None
        expires_at = int(entry.get("expires_at", 0))
        if expires_at <= now_ts:
            cache.pop(variant_key, None)
            return None
        cache.move_to_end(variant_key)
        return entry["bytes_data"], entry["content_type"]


async def _media_render_cache_set(
    variant_key: str,
    *,
    bytes_data: bytes,
    content_type: str,
    now_ts: int,
) -> None:
    cache = getattr(app.state, "media_render_cache", None)
    lock = getattr(app.state, "media_render_cache_lock", None)
    if not _is_media_render_cache_operational() or cache is None or lock is None:
        return
    ttl_seconds = max(1, int(getattr(app.state, "media_render_cache_ttl_seconds", 300)))
    max_items = max(1, int(getattr(app.state, "media_render_cache_max_items", 256)))
    async with lock:
        _media_render_cache_set_locked(
            cache,
            variant_key,
            bytes_data,
            content_type,
            now_ts + ttl_seconds,
            max_items,
        )


async def _media_render_cache_purge_asset(asset_id: str) -> int:
    cache = getattr(app.state, "media_render_cache", None)
    lock = getattr(app.state, "media_render_cache_lock", None)
    if not _is_media_render_cache_operational() or cache is None or lock is None:
        return 0
    variant_prefix = f"{asset_id}:"
    async with lock:
        matching_keys = [key for key in cache if key.startswith(variant_prefix)]
        for key in matching_keys:
            cache.pop(key, None)
        return len(matching_keys)


def _media_render_cache_set_locked(
    cache: OrderedDict[str, dict[str, object]],
    variant_key: str,
    bytes_data: bytes,
    content_type: str,
    expires_at: int,
    max_items: int,
) -> None:
    cache[variant_key] = {
        "bytes_data": bytes_data,
        "content_type": content_type,
        "expires_at": expires_at,
    }
    cache.move_to_end(variant_key)
    while len(cache) > max_items:
        cache.popitem(last=False)


def _build_media_render_miss_semaphore(max_concurrent_misses: int) -> asyncio.Semaphore | None:
    if max_concurrent_misses <= 0:
        return None
    return asyncio.Semaphore(max_concurrent_misses)


async def _run_media_render_miss_limited(
    render_factory: Callable[[], Awaitable[MediaRenderValue]],
) -> tuple[MediaRenderValue, int]:
    semaphore = getattr(app.state, "media_render_miss_semaphore", None)
    if semaphore is None:
        return await render_factory(), 0

    started_at = time.time()
    async with semaphore:
        limit_wait_ms = int((time.time() - started_at) * 1000)
        result = await render_factory()
        return result, limit_wait_ms


async def _clear_media_render_inflight_task(
    variant_key: str,
    task: asyncio.Task[MediaRenderResult],
) -> None:
    inflight_tasks = getattr(app.state, "media_render_inflight_tasks", None)
    inflight_lock = getattr(app.state, "media_render_inflight_lock", None)
    if inflight_tasks is None or inflight_lock is None:
        return
    async with inflight_lock:
        existing = inflight_tasks.get(variant_key)
        if existing is task:
            inflight_tasks.pop(variant_key, None)


async def _run_media_render_singleflight(
    variant_key: str,
    render_factory: Callable[[], Awaitable[MediaRenderResult]],
) -> MediaRenderResult:
    inflight_tasks = getattr(app.state, "media_render_inflight_tasks", None)
    inflight_lock = getattr(app.state, "media_render_inflight_lock", None)
    if inflight_tasks is None or inflight_lock is None:
        return await render_factory()

    async with inflight_lock:
        task = inflight_tasks.get(variant_key)
        if task is None:
            task = asyncio.create_task(render_factory())
            inflight_tasks[variant_key] = task
            task.add_done_callback(
                lambda completed_task: asyncio.create_task(
                    _clear_media_render_inflight_task(variant_key, completed_task)
                )
            )

    return await asyncio.shield(task)


async def _touch_media_asset_after_render(
    *,
    auth_service: Any,
    asset_id: str,
    request_id: str,
) -> None:
    started_at = time.time()
    try:
        await run_in_threadpool(auth_service.touch_media_asset, asset_id=asset_id)
    except AuthServiceError as error:
        logger.warning(
            "[Media] render touch failed request_id=%s asset_id=%s code=%s status_code=%s",
            request_id,
            asset_id,
            error.code,
            error.status_code,
        )
        return
    except AuthStateStoreError as error:
        logger.warning(
            "[Media] render touch state save failed request_id=%s asset_id=%s error=%s",
            request_id,
            asset_id,
            str(error),
        )
        return

    touch_ms = int((time.time() - started_at) * 1000)
    logger.info(
        "[Media] render touch completed request_id=%s asset_id=%s touch_ms=%s",
        request_id,
        asset_id,
        touch_ms,
    )


def _log_media_render_touch_task_result(
    task: asyncio.Task[None],
    *,
    asset_id: str,
    request_id: str,
) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        logger.warning(
            "[Media] render touch task cancelled request_id=%s asset_id=%s",
            request_id,
            asset_id,
        )
    except Exception:
        logger.exception(
            "[Media] render touch task failed request_id=%s asset_id=%s",
            request_id,
            asset_id,
        )


def _schedule_media_render_touch_after_render(
    *,
    auth_service: Any,
    asset_id: str,
    request_id: str,
) -> asyncio.Task[None]:
    task = asyncio.create_task(
        _touch_media_asset_after_render(
            auth_service=auth_service,
            asset_id=asset_id,
            request_id=request_id,
        )
    )
    task.add_done_callback(
        lambda completed_task: _log_media_render_touch_task_result(
            completed_task,
            asset_id=asset_id,
            request_id=request_id,
        )
    )
    return task


def _resolve_media_format(fmt: str, accept_header: str) -> str:
    requested = (fmt or "auto").strip().lower()
    if requested == "auto":
        if "image/webp" in (accept_header or "").lower():
            return "webp"
        return "jpeg"
    if requested in {"jpg", "jpeg"}:
        return "jpeg"
    if requested in {"webp", "png"}:
        return requested
    return "jpeg"


def _render_image_bytes(
    *,
    source_bytes: bytes,
    target_width: int,
    target_quality: int,
    target_format: str,
    target_webp_method: int,
) -> tuple[bytes, str]:
    with Image.open(io.BytesIO(source_bytes)) as image:
        image = ImageOps.exif_transpose(image)
        if target_width > 0 and image.width > target_width:
            ratio = target_width / float(image.width)
            target_height = max(1, int(round(image.height * ratio)))
            image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)

        out = io.BytesIO()
        if target_format == "webp":
            image.save(out, format="WEBP", quality=target_quality, method=target_webp_method)
            return out.getvalue(), "image/webp"
        if target_format == "png":
            image.save(out, format="PNG", optimize=True)
            return out.getvalue(), "image/png"
        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        image.save(out, format="JPEG", quality=target_quality, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg"


def _oauth_provider_config(provider: str) -> dict[str, str]:
    config = OAUTH_PROVIDER_CONFIG.get(provider)
    if not config:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNSUPPORTED",
            message="Unsupported provider.",
            status_code=400,
        )
    return config


def _parse_csv(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {part.strip() for part in raw.split(",") if part.strip()}


def _allowed_app_redirect_uris() -> set[str]:
    configured = _parse_csv(os.environ.get("AUTH_APP_ALLOWED_REDIRECT_URIS"))
    if configured:
        return configured
    return {
        str(config["default_app_redirect_uri"])
        for config in OAUTH_PROVIDER_CONFIG.values()
    }


def _resolve_app_redirect_uri(*, provider: str, requested_uri: str | None) -> str:
    config = _oauth_provider_config(provider)
    candidate = (requested_uri or "").strip() or str(config["default_app_redirect_uri"])
    allowed = _allowed_app_redirect_uris()
    if candidate not in allowed:
        raise AuthServiceError(
            code="AUTH_REDIRECT_URI_MISMATCH",
            message="Redirect URI mismatch.",
            status_code=400,
        )
    return candidate


def _allowed_app_logout_redirect_uris() -> set[str]:
    configured = _parse_csv(os.environ.get("AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS"))
    if configured:
        return configured
    return {DEFAULT_APP_LOGOUT_REDIRECT_URI}


def _resolve_app_logout_redirect_uri(*, requested_uri: str | None) -> str:
    candidate = (requested_uri or "").strip() or DEFAULT_APP_LOGOUT_REDIRECT_URI
    allowed = _allowed_app_logout_redirect_uris()
    if candidate not in allowed:
        raise AuthServiceError(
            code="AUTH_REDIRECT_URI_MISMATCH",
            message="Redirect URI mismatch.",
            status_code=400,
        )
    return candidate


def _resolve_public_base_url(request: Request) -> str:
    configured = os.environ.get("AUTH_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _resolve_provider_callback_uri(*, request: Request, provider: str) -> str:
    config = _oauth_provider_config(provider)
    base_url = _resolve_public_base_url(request)
    return f"{base_url}{config['callback_path']}"


def _resolve_provider_logout_callback_uri(
    *,
    request: Request,
    provider: str,
    app_redirect_uri: str,
) -> str:
    base_url = _resolve_public_base_url(request)
    callback_path = f"/auth/{provider}/logout/callback"
    callback_uri = f"{base_url}{callback_path}"
    return _append_query_params(callback_uri, {"app_redirect_uri": app_redirect_uri})


def _pack_oauth_state(*, state: str, app_redirect_uri: str) -> str:
    encoded = base64.urlsafe_b64encode(app_redirect_uri.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{state}.{encoded}"


def _extract_app_redirect_uri_from_state(state: str | None) -> str | None:
    if not state or "." not in state:
        return None

    encoded = state.rsplit(".", 1)[1]
    padding = "=" * (-len(encoded) % 4)
    try:
        decoded = base64.urlsafe_b64decode(f"{encoded}{padding}").decode("utf-8").strip()
    except Exception:
        return None
    return decoded or None


def _build_oauth_authorize_url(
    *,
    provider: str,
    callback_uri: str,
    packed_state: str,
) -> str:
    config = _oauth_provider_config(provider)
    client_id_env = str(config["client_id_env"])
    client_id = os.environ.get(client_id_env, "").strip()
    if not client_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_MISCONFIGURED",
            message=f"{provider} OAuth client is not configured.",
            status_code=500,
        )

    params: dict[str, str] = {
        "client_id": client_id,
        "redirect_uri": callback_uri,
        "response_type": "code",
        "state": packed_state,
    }

    scope = os.environ.get(str(config["scope_env"]), str(config["scope_default"])).strip()
    if scope:
        params["scope"] = scope

    if provider == "google":
        params["access_type"] = "offline"
        params["include_granted_scopes"] = "true"
        prompt = os.environ.get("AUTH_GOOGLE_OAUTH_PROMPT", "consent").strip()
        if prompt:
            params["prompt"] = prompt

    return f"{config['authorize_url']}?{urlencode(params)}"


def _append_query_params(base_url: str, params: dict[str, str]) -> str:
    delimiter = "&" if "?" in base_url else "?"
    return f"{base_url}{delimiter}{urlencode(params)}"


def _build_provider_logout_url(*, provider: str, provider_logout_callback_uri: str) -> str:
    if provider == "google":
        # Google does not provide a first-party OAuth logout redirect endpoint,
        # so we use the common logout+continue pattern.
        appengine_continue = _append_query_params(
            "https://appengine.google.com/_ah/logout",
            {"continue": provider_logout_callback_uri},
        )
        return _append_query_params(
            "https://accounts.google.com/Logout",
            {"continue": appengine_continue},
        )

    if provider == "kakao":
        client_id = os.environ.get("AUTH_KAKAO_CLIENT_ID", "").strip()
        if not client_id:
            raise AuthServiceError(
                code="AUTH_PROVIDER_MISCONFIGURED",
                message="kakao OAuth client is not configured.",
                status_code=500,
            )
        return _append_query_params(
            "https://kauth.kakao.com/oauth/logout",
            {
                "client_id": client_id,
                "logout_redirect_uri": provider_logout_callback_uri,
            },
        )

    raise AuthServiceError(
        code="AUTH_PROVIDER_UNSUPPORTED",
        message="Unsupported provider.",
        status_code=400,
    )


def _is_kakao_code_verification_enabled() -> bool:
    return os.environ.get("AUTH_KAKAO_CODE_VERIFY_ENABLED", "0").strip() == "1"


def _is_google_code_verification_enabled() -> bool:
    return os.environ.get("AUTH_GOOGLE_CODE_VERIFY_ENABLED", "0").strip() == "1"


def _provider_client_id(provider: str) -> str:
    env_name = "AUTH_GOOGLE_CLIENT_ID" if provider == "google" else "AUTH_KAKAO_CLIENT_ID"
    return os.environ.get(env_name, "").strip()


def _has_client_supplied_provider_identity(*, provider_user_id: str | None, email: str | None) -> bool:
    normalized_provider_user_id = (provider_user_id or "").strip()
    normalized_email = (email or "").strip()
    return bool(normalized_provider_user_id or normalized_email)


def _should_verify_provider_identity(
    *,
    provider: str,
    code: str | None,
    error: str | None,
    provider_user_id: str | None,
    email: str | None,
) -> bool:
    if not code or error:
        return False

    if provider == "google" and _is_google_code_verification_enabled():
        return True

    if provider == "kakao" and _is_kakao_code_verification_enabled():
        return True

    if _has_client_supplied_provider_identity(provider_user_id=provider_user_id, email=email):
        return False

    return bool(_provider_client_id(provider))


def _provider_timeout_seconds() -> float:
    raw_value = (os.environ.get("AUTH_PROVIDER_TIMEOUT_SECONDS") or "").strip()
    if not raw_value:
        return DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS
    try:
        parsed = float(raw_value)
    except ValueError:
        return DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS
    return parsed if parsed > 0 else DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS


def _verify_kakao_identity(*, request: Request, code: str) -> tuple[str, str | None]:
    client_id = os.environ.get("AUTH_KAKAO_CLIENT_ID", "").strip()
    if not client_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_MISCONFIGURED",
            message="kakao OAuth client is not configured.",
            status_code=500,
        )

    token_request_data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": _resolve_provider_callback_uri(request=request, provider="kakao"),
        "code": code.strip(),
    }
    client_secret = os.environ.get("AUTH_KAKAO_CLIENT_SECRET", "").strip()
    if client_secret:
        token_request_data["client_secret"] = client_secret

    timeout_seconds = _provider_timeout_seconds()
    try:
        token_response = requests.post(
            "https://kauth.kakao.com/oauth/token",
            data=token_request_data,
            timeout=timeout_seconds,
        )
    except requests.Timeout as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_TIMEOUT",
            message="Provider request timed out.",
            status_code=504,
        ) from error
    except requests.RequestException as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNAVAILABLE",
            message="Provider request failed.",
            status_code=502,
        ) from error

    try:
        token_payload = token_response.json()
    except ValueError as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        ) from error

    if token_response.status_code >= 400:
        provider_error = str(token_payload.get("error", "")).strip().lower()
        if provider_error in {"invalid_grant", "invalid_request"}:
            raise AuthServiceError(
                code="AUTH_PROVIDER_INVALID_CODE",
                message="Missing or invalid authorization code.",
                status_code=400,
            )
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    access_token = str(token_payload.get("access_token", "")).strip()
    if not access_token:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    try:
        profile_response = requests.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=timeout_seconds,
        )
    except requests.Timeout as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_TIMEOUT",
            message="Provider request timed out.",
            status_code=504,
        ) from error
    except requests.RequestException as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNAVAILABLE",
            message="Provider request failed.",
            status_code=502,
        ) from error

    try:
        profile_payload = profile_response.json()
    except ValueError as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        ) from error

    if profile_response.status_code >= 400:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    provider_user_id = str(profile_payload.get("id", "")).strip()
    if not provider_user_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    email: str | None = None
    kakao_account = profile_payload.get("kakao_account")
    if isinstance(kakao_account, dict):
        raw_email = kakao_account.get("email")
        if isinstance(raw_email, str):
            email = raw_email.strip() or None

    return provider_user_id, email


def _verify_google_identity(*, request: Request, code: str) -> tuple[str, str | None]:
    client_id = os.environ.get("AUTH_GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_MISCONFIGURED",
            message="google OAuth client is not configured.",
            status_code=500,
        )

    token_request_data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": _resolve_provider_callback_uri(request=request, provider="google"),
        "code": code.strip(),
    }
    client_secret = os.environ.get("AUTH_GOOGLE_CLIENT_SECRET", "").strip()
    if client_secret:
        token_request_data["client_secret"] = client_secret

    timeout_seconds = _provider_timeout_seconds()
    try:
        token_response = requests.post(
            "https://oauth2.googleapis.com/token",
            data=token_request_data,
            timeout=timeout_seconds,
        )
    except requests.Timeout as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_TIMEOUT",
            message="Provider request timed out.",
            status_code=504,
        ) from error
    except requests.RequestException as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNAVAILABLE",
            message="Provider request failed.",
            status_code=502,
        ) from error

    try:
        token_payload = token_response.json()
    except ValueError as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        ) from error

    if token_response.status_code >= 400:
        provider_error = str(token_payload.get("error", "")).strip().lower()
        if provider_error in {"invalid_grant", "invalid_request"}:
            raise AuthServiceError(
                code="AUTH_PROVIDER_INVALID_CODE",
                message="Missing or invalid authorization code.",
                status_code=400,
            )
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    access_token = str(token_payload.get("access_token", "")).strip()
    if not access_token:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    try:
        profile_response = requests.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=timeout_seconds,
        )
    except requests.Timeout as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_TIMEOUT",
            message="Provider request timed out.",
            status_code=504,
        ) from error
    except requests.RequestException as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNAVAILABLE",
            message="Provider request failed.",
            status_code=502,
        ) from error

    try:
        profile_payload = profile_response.json()
    except ValueError as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        ) from error

    if profile_response.status_code >= 400:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    provider_user_id = str(profile_payload.get("sub", "")).strip()
    if not provider_user_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    email: str | None = None
    raw_email_verified = profile_payload.get("email_verified")
    if raw_email_verified in {True, "true", "True", "1", 1}:
        raw_email = profile_payload.get("email")
        if isinstance(raw_email, str):
            email = raw_email.strip() or None

    return provider_user_id, email


def resolve_prompt_country_code(iso_country_code: str, locale: str | None) -> str:
    """
    Resolve language/country code used by AI prompt.
    Priority: request iso country code > app UI locale override > US fallback.
    """
    if iso_country_code:
        normalized = iso_country_code.strip().upper()
        if len(normalized) == 2 and normalized.isalpha():
            return normalized

    if locale:
        mapped = LOCALE_TO_ISO.get(locale.strip().lower())
        if mapped:
            return mapped

    return "US"


class EmailSignupRequest(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    locale: str | None = None
    device_id: str | None = None


class EmailLoginRequest(BaseModel):
    email: str
    password: str
    device_id: str | None = None


class EmailVerifyRequest(BaseModel):
    email: str
    code: str
    device_id: str | None = None


class EmailVerificationRequest(BaseModel):
    email: str


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirmRequest(BaseModel):
    email: str
    code: str
    new_password: str


class OAuthProviderRequest(BaseModel):
    code: str | None = None
    state: str | None = None
    redirect_uri: str | None = None
    error: str | None = None
    provider_user_id: str | None = None
    email: str | None = None
    locale: str | None = None
    device_id: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class TripCoordinatesRequest(BaseModel):
    latitude: float
    longitude: float


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    profile_image_url: str | None = None
    profile_image_asset_id: str | None = None
    gender: str | None = None
    birth_year: int | None = None
    disliked_ingredients: list[str] | None = None
    locale: str | None = None
    timezone: str | None = None
    current_trip_start: str | None = None
    current_trip_location: str | None = None
    current_trip_coordinates: TripCoordinatesRequest | None = None
    expected_updated_at: str | None = None


class AllergiesUpdateRequest(BaseModel):
    allergies: list[str] | None = None
    dietary_restrictions: list[str] | None = None
    severity_map: dict[str, str] | None = None
    expected_updated_at: str | None = None


class HistoryWriteRequest(BaseModel):
    entry: dict[str, Any]
    idempotency_key: str | None = None


class HistoryImagePatchRequest(BaseModel):
    image_asset_id: str


class HistoryMapRegionRequest(BaseModel):
    latitude: float
    longitude: float
    latitudeDelta: float
    longitudeDelta: float


class HistoryTimestampPatchRequest(BaseModel):
    timestamp: str
    expected_updated_at: str | None = None


class OnboardingClientStateRequest(BaseModel):
    completed_at: str | None = None


class HomeClientStateRequest(BaseModel):
    selected_date: str | None = None


class HistoryClientStateRequest(BaseModel):
    archive_mode: Literal["list", "map"] | None = None
    filter: Literal["all", "ok", "avoid", "ask"] | None = None
    map_region: HistoryMapRegionRequest | None = None


class SettingsClientStateRequest(BaseModel):
    onboarding: OnboardingClientStateRequest | None = None
    home: HomeClientStateRequest | None = None
    history: HistoryClientStateRequest | None = None


class SettingsUpdateRequest(BaseModel):
    language: str | None = None
    target_language: str | None = None
    auto_play_audio: bool | None = None
    selected_emoji: str | None = None
    client_state: SettingsClientStateRequest | None = None
    expected_updated_at: str | None = None


class DeletionRequestCreateRequest(BaseModel):
    target: Literal["account", "data"]


def _request_id(request: Request) -> str:
    return request.headers.get("X-Request-Id") or os.urandom(6).hex()


def _device_id(request: Request) -> str | None:
    value = request.headers.get("X-Device-Id")
    if not value:
        return None
    cleaned = value.strip()
    return cleaned or None


def _serialize_deletion_status(snapshot: DeletionStatusSnapshot | None) -> dict[str, Any] | None:
    if snapshot is None:
        return None
    return {
        "queue_id": snapshot.queue_id,
        "request_id": snapshot.request_id,
        "target": snapshot.target.value,
        "status": snapshot.status.value,
        "created_at": snapshot.created_at.isoformat().replace("+00:00", "Z"),
        "updated_at": snapshot.updated_at.isoformat().replace("+00:00", "Z"),
        "reason": snapshot.reason,
        "error": snapshot.error,
    }


def _register_media_retention_record(
    *,
    asset_id: str,
    user_id: str,
    object_key: str,
    object_generation: int | None,
) -> None:
    retention_store = getattr(app.state, "retention_store", None)
    if retention_store is None:
        raise RetentionStoreError("retention_store is not configured")
    retention_store.add(
        RetentionRecord(
            record_id=asset_id,
            data_class=RetentionDataClass.ORIGINAL,
            created_at=datetime.now(timezone.utc),
            user_id=user_id,
            storage_key=object_key,
            object_generation=object_generation,
        )
    )


def _schedule_media_deletion_retry_record(
    *,
    asset_id: str,
    user_id: str,
    object_key: str,
    object_generation: int | None,
    request_id: str,
    cause_code: str,
    status_code: int,
) -> None:
    retention_store = getattr(app.state, "retention_store", None)
    if retention_store is None:
        raise RetentionStoreError("retention_store is not configured")
    retention_store.add(
        RetentionRecord(
            record_id=asset_id,
            data_class=RetentionDataClass.ORIGINAL,
            created_at=datetime.fromtimestamp(0, timezone.utc),
            user_id=user_id,
            request_id=request_id,
            storage_key=object_key,
            object_generation=object_generation,
        )
    )
    logger.warning(
        "[Media] delete retry scheduled request_id=%s user_id=%s asset_id=%s object_key_hash=%s code=%s status=%s",
        request_id,
        user_id,
        asset_id,
        _media_object_key_log_hash(object_key),
        cause_code,
        status_code,
    )


def _coerce_optional_generation(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return None


def _resolve_media_asset_generation(
    *,
    auth_service: Any,
    media_storage: Any,
    asset: dict[str, object],
    request_id: str,
) -> int:
    object_key = str(asset.get("object_key") or "").strip()
    if not object_key:
        raise MediaStorageError(
            code="MEDIA_OBJECT_KEY_MISSING",
            message="Media asset storage key is missing.",
            status_code=500,
        )
    asset_id = str(asset.get("asset_id") or "").strip()
    user_id = str(asset.get("user_id") or "").strip()
    scope = str(asset.get("scope") or "").strip()
    object_prefix = str(getattr(media_storage, "object_prefix", "media"))
    if not _is_compensatable_media_object_key(
        object_key=object_key,
        object_prefix=object_prefix,
        user_id=user_id,
        scope=scope,
        asset_id=asset_id,
    ):
        raise MediaStorageError(
            code="MEDIA_OBJECT_KEY_MISMATCH",
            message="Media asset storage key does not match owner metadata.",
            status_code=409,
        )
    object_generation = _coerce_optional_generation(asset.get("object_generation"))
    if object_generation is not None:
        return object_generation

    payload = media_storage.fetch_original(object_key=object_key)
    expected_size = int(asset.get("size_bytes") or -1)
    expected_sha256 = str(asset.get("sha256") or "").strip().lower()
    actual_sha256 = hashlib.sha256(payload.bytes_data).hexdigest()
    if expected_size != len(payload.bytes_data) or expected_sha256 != actual_sha256:
        raise MediaStorageError(
            code="MEDIA_GENERATION_BACKFILL_MISMATCH",
            message="Legacy media object content does not match stored metadata.",
            status_code=409,
        )
    generation = media_storage.get_original_generation(object_key=object_key)
    auth_service.update_media_asset_generation(
        asset_id=asset_id,
        object_generation=generation,
    )
    retention_store = getattr(app.state, "retention_store", None)
    if retention_store is not None:
        retention_store.add(
            RetentionRecord(
                record_id=asset_id,
                data_class=RetentionDataClass.ORIGINAL,
                created_at=datetime.now(timezone.utc),
                user_id=str(asset.get("user_id") or "") or None,
                request_id=request_id,
                storage_key=object_key,
                object_generation=generation,
            )
        )
    logger.info(
        "[Media] legacy generation backfilled request_id=%s user_id=%s asset_id=%s object_key_hash=%s",
        request_id,
        str(asset.get("user_id") or "unknown"),
        asset_id,
        _media_object_key_log_hash(object_key),
    )
    return generation


def _is_media_deletion_retryable_error(error: MediaStorageError) -> bool:
    return error.code not in {
        "MEDIA_NOT_FOUND",
        "MEDIA_OBJECT_KEY_MISSING",
        "MEDIA_OBJECT_KEY_MISMATCH",
        "MEDIA_GENERATION_BACKFILL_MISMATCH",
    }


def _is_compensatable_media_object_key(
    *,
    object_key: str,
    object_prefix: str,
    user_id: str,
    scope: str,
    asset_id: str,
) -> bool:
    key_parts = [part for part in object_key.strip().strip("/").split("/") if part]
    prefix_parts = [part for part in object_prefix.strip().strip("/").split("/") if part] or ["media"]
    expected_parts = [*prefix_parts, user_id.strip(), scope.strip(), asset_id.strip()]
    if len(key_parts) != len(expected_parts) + 1:
        return False
    return (
        key_parts[:-1] == expected_parts
        and key_parts[-1].startswith("original.")
    )


def _media_object_key_log_hash(object_key: str) -> str:
    return hashlib.sha256(object_key.encode("utf-8")).hexdigest()[:16]


def _compensate_failed_media_upload(
    *,
    auth_service: Any,
    media_storage: Any,
    upload_result: MediaUploadResult,
    registered_asset_id: str | None,
    request_id: str,
    user_id: str,
    scope: str,
    cause_code: str,
) -> None:
    object_prefix = str(getattr(media_storage, "object_prefix", "media"))
    if not _is_compensatable_media_object_key(
        object_key=upload_result.object_key,
        object_prefix=object_prefix,
        user_id=user_id,
        scope=scope,
        asset_id=upload_result.asset_id,
    ):
        logger.error(
            "[Media] upload compensation skipped request_id=%s user_id=%s asset_id=%s scope=%s object_key_hash=%s cause_code=%s reason=%s",
            request_id,
            user_id,
            upload_result.asset_id,
            scope,
            _media_object_key_log_hash(upload_result.object_key),
            cause_code,
            "object_key_mismatch",
        )
        return

    try:
        media_storage.delete_original(
            object_key=upload_result.object_key,
            generation=upload_result.generation,
        )
    except MediaStorageError as error:
        logger.error(
            "[Media] upload compensation delete failed request_id=%s user_id=%s asset_id=%s scope=%s object_key_hash=%s cause_code=%s cleanup_code=%s cleanup_status=%s",
            request_id,
            user_id,
            upload_result.asset_id,
            scope,
            _media_object_key_log_hash(upload_result.object_key),
            cause_code,
            error.code,
            error.status_code,
        )
        return

    if registered_asset_id is not None:
        try:
            deleted = auth_service.delete_media_asset(asset_id=registered_asset_id)
        except (AuthServiceError, AuthStateStoreError) as error:
            logger.error(
                "[Media] upload compensation metadata delete failed request_id=%s user_id=%s asset_id=%s scope=%s cause_code=%s error=%s",
                request_id,
                user_id,
                registered_asset_id,
                scope,
                cause_code,
                str(error),
            )
            return
        if not deleted:
            logger.warning(
                "[Media] upload compensation metadata missing request_id=%s user_id=%s asset_id=%s scope=%s cause_code=%s",
                request_id,
                user_id,
                registered_asset_id,
                scope,
                cause_code,
            )

    logger.info(
        "[Media] upload compensation success request_id=%s user_id=%s asset_id=%s scope=%s cause_code=%s",
        request_id,
        user_id,
        upload_result.asset_id,
        scope,
        cause_code,
    )


def _delete_media_retention_record(record: RetentionRecord) -> bool:
    media_storage = _service("media_storage")
    auth_service = _service("auth_service")
    if record.storage_key:
        try:
            asset = auth_service.get_media_asset(
                asset_id=record.record_id,
                user_id=record.user_id,
            )
        except AuthServiceError as error:
            logger.warning(
                "[Media] retention delete retry metadata missing request_id=%s user_id=%s asset_id=%s code=%s",
                record.request_id,
                record.user_id,
                record.record_id,
                error.code,
            )
            return False
        if str(asset.get("object_key") or "").strip() != record.storage_key:
            logger.warning(
                "[Media] retention delete retry skipped request_id=%s user_id=%s asset_id=%s reason=%s",
                record.request_id,
                record.user_id,
                record.record_id,
                "object_key_mismatch",
            )
            return False
        object_generation = record.object_generation
        if object_generation is None:
            try:
                object_generation = _resolve_media_asset_generation(
                    auth_service=auth_service,
                    media_storage=media_storage,
                    asset=asset,
                    request_id=record.request_id or "retention-retry",
                )
            except MediaStorageError as error:
                if _is_media_deletion_retryable_error(error):
                    logger.warning(
                        "[Media] retention delete retry failed request_id=%s user_id=%s asset_id=%s object_key_hash=%s code=%s status=%s",
                        record.request_id,
                        record.user_id,
                        record.record_id,
                        _media_object_key_log_hash(record.storage_key),
                        error.code,
                        error.status_code,
                    )
                    return False
                logger.error(
                    "[Media] retention delete retry requires reconciliation request_id=%s user_id=%s asset_id=%s object_key_hash=%s code=%s status=%s",
                    record.request_id,
                    record.user_id,
                    record.record_id,
                    _media_object_key_log_hash(record.storage_key),
                    error.code,
                    error.status_code,
                )
                return True
        elif asset.get("object_generation") is not None and _coerce_optional_generation(
            asset.get("object_generation")
        ) != object_generation:
            logger.warning(
                "[Media] retention delete retry skipped request_id=%s user_id=%s asset_id=%s reason=%s",
                record.request_id,
                record.user_id,
                record.record_id,
                "object_generation_mismatch",
            )
            return False
        try:
            media_storage.delete_original(
                object_key=record.storage_key,
                generation=object_generation,
            )
        except MediaStorageError as error:
            if _is_media_deletion_retryable_error(error):
                logger.warning(
                    "[Media] retention delete retry failed request_id=%s user_id=%s asset_id=%s object_key_hash=%s code=%s status=%s",
                    record.request_id,
                    record.user_id,
                    record.record_id,
                    _media_object_key_log_hash(record.storage_key),
                    error.code,
                    error.status_code,
                )
                return False
            if error.code != "MEDIA_NOT_FOUND":
                logger.error(
                    "[Media] retention delete retry requires reconciliation request_id=%s user_id=%s asset_id=%s object_key_hash=%s code=%s status=%s",
                    record.request_id,
                    record.user_id,
                    record.record_id,
                    _media_object_key_log_hash(record.storage_key),
                    error.code,
                    error.status_code,
                )
    if record.record_id:
        auth_service.delete_media_asset(asset_id=record.record_id)
        logger.info(
            "[Media] retention delete retry succeeded request_id=%s user_id=%s asset_id=%s",
            record.request_id,
            record.user_id,
            record.record_id,
        )
    return True


async def _run_retention_cleanup_once() -> None:
    job = getattr(app.state, "retention_cleanup_job", None)
    if job is None:
        raise RuntimeError("Retention cleanup job is unavailable.")
    for data_class in (
        RetentionDataClass.ORIGINAL,
        RetentionDataClass.DERIVED,
        RetentionDataClass.LOG,
    ):
        result = await run_in_threadpool(
            job.run_once,
            data_class=data_class,
            now=datetime.now(timezone.utc),
            limit=100,
        )
        logger.info(
            "[Retention] cleanup data_class=%s scanned=%s expired=%s deleted=%s",
            result.data_class.value,
            result.scanned_count,
            result.expired_count,
            result.deleted_count,
        )


async def _retention_cleanup_loop() -> None:
    try:
        while True:
            await asyncio.sleep(_retention_cleanup_interval_seconds())
            await _run_retention_cleanup_once()
    except asyncio.CancelledError:
        return


async def _deletion_queue_loop() -> None:
    try:
        while True:
            await asyncio.sleep(_deletion_queue_interval_seconds())
            consumer = getattr(app.state, "deletion_queue_consumer", None)
            if consumer is None:
                continue
            try:
                recovered_count = await run_in_threadpool(
                    consumer.requeue_stale,
                    lease_seconds=_deletion_queue_lease_seconds(),
                )
                if recovered_count > 0:
                    logger.warning(
                        "[Deletion] queue_stale_requeued count=%s lease_seconds=%s",
                        recovered_count,
                        _deletion_queue_lease_seconds(),
                    )
            except Exception as error:
                logger.warning("[Deletion] queue_stale_requeue_failed error=%s", str(error))
            for _ in range(_deletion_queue_max_batch()):
                try:
                    result = await run_in_threadpool(consumer.consume_once)
                except Exception as error:
                    logger.warning("[Deletion] queue_process_failed error=%s", str(error))
                    break
                if result is None:
                    break
                logger.info(
                    "[Deletion] queue_processed queue_id=%s target=%s status=%s",
                    result.queue_id,
                    result.target.value,
                    result.status.value,
                )
    except asyncio.CancelledError:
        return


def _parent_request_id(request: Request) -> str | None:
    parent = request.headers.get("X-Parent-Request-Id")
    if not parent:
        return None
    cleaned = parent.strip()
    return cleaned or None


def _build_latency_ms_payload(
    total_ms: int,
    preprocess_ms: int | None,
    extract_ms: int | None,
    assess_ms: int | None,
    source_lookup_ms: int | None,
    allergen_analysis_ms: int | None,
) -> dict[str, int]:
    latency_ms = LatencyMsContract(
        total=total_ms,
        preprocess=preprocess_ms,
        extract=extract_ms,
        assess=assess_ms,
        source_lookup=source_lookup_ms,
        allergen_analysis=allergen_analysis_ms,
    )
    return latency_ms.model_dump(exclude_none=True)


def _analysis_job_store():
    return _service("analysis_job_store")


def _analysis_job_store_http_exception(*, request_id: str, action: str) -> HTTPException:
    return HTTPException(
        status_code=503,
        detail={
            "message": f"Analysis queue is unavailable during {action}.",
            "code": ErrorCode.ANALYZE_FAILED,
            "request_id": request_id,
        },
    )


def _analysis_job_remote_worker_http_exception(
    *,
    request_id: str,
    heartbeat_snapshot: dict[str, Any] | None,
) -> HTTPException:
    detail: dict[str, Any] = {
        "message": "Analysis worker is unavailable. Try again shortly.",
        "code": ErrorCode.SERVICE_UNAVAILABLE,
        "request_id": request_id,
    }
    if isinstance(heartbeat_snapshot, dict):
        detail["analysis_job_remote_worker_heartbeat_at"] = heartbeat_snapshot.get("heartbeat_at")
    return HTTPException(
        status_code=503,
        detail=detail,
        headers={"Retry-After": str(max(1, int(_analysis_job_worker_heartbeat_interval_seconds())))},
    )


def _assert_analysis_job_remote_worker_available(*, request_id: str) -> None:
    worker_ready, heartbeat_snapshot = _analysis_job_remote_worker_readiness()
    if worker_ready:
        return
    logger.error(
        "[AnalysisJob] submit blocked request_id=%s heartbeat_age_seconds=%s heartbeat_at=%s",
        request_id,
        _analysis_job_remote_worker_heartbeat_age_seconds(heartbeat_snapshot),
        heartbeat_snapshot.get("heartbeat_at") if isinstance(heartbeat_snapshot, dict) else None,
    )
    raise _analysis_job_remote_worker_http_exception(
        request_id=request_id,
        heartbeat_snapshot=heartbeat_snapshot,
    )


def _analysis_job_status_payload(record: dict[str, Any]) -> dict[str, Any]:
    return serialize_job_status_response(record=record)


async def _read_analysis_job_upload(*, file: UploadFile, request_id: str) -> tuple[bytes, str]:
    content_type = (file.content_type or "").strip().lower()
    allowed_content_types = _analysis_job_allowed_content_types()
    if content_type not in allowed_content_types:
        raise HTTPException(
            status_code=415,
            detail={
                "message": "Unsupported image content type.",
                "code": ErrorCode.IMAGE_DECODE_FAILED,
                "request_id": request_id,
            },
        )

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Uploaded image is empty.",
                "code": ErrorCode.IMAGE_DECODE_FAILED,
                "request_id": request_id,
            },
        )

    max_bytes = _analysis_job_max_upload_bytes()
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail={
                "message": f"Uploaded image exceeds server limit ({max_bytes} bytes).",
                "code": ErrorCode.IMAGE_DECODE_FAILED,
                "request_id": request_id,
            },
        )

    return contents, content_type


def _auth_error_to_http_exception(error: AuthServiceError, request_id: str) -> HTTPException:
    detail = {
        "message": error.message,
        "code": error.code,
        "request_id": request_id,
    }
    if isinstance(getattr(error, "details", None), dict):
        detail.update(error.details)
    return HTTPException(
        status_code=error.status_code,
        detail=detail,
    )


def _log_auth_failure(
    *,
    request_id: str,
    user_id: str | None,
    provider: str | None,
    code: str,
) -> None:
    logger.warning(
        "[Auth] request failed request_id=%s user_id=%s provider=%s code=%s",
        request_id,
        user_id or "unknown",
        provider or "none",
        code,
    )


def _log_phase2_write(
    *,
    request_id: str,
    user_id: str,
    method: str,
    path: str,
    device_id: str | None = None,
) -> None:
    logger.info(
        "[Phase2Write] request_id=%s user_id=%s device_id=%s method=%s path=%s",
        request_id,
        user_id,
        device_id or "unknown",
        method,
        path,
    )


def _log_settings_trace(
    *,
    phase: str,
    request_id: str,
    user_id: str,
    device_id: str | None,
    language: str | None,
    target_language: str | None,
    auto_play_audio: bool | None,
    selected_emoji: str | None,
    updated_at: str | None,
    fields_set: list[str] | None = None,
) -> None:
    logger.info(
        (
            "[Phase2SettingsTrace] phase=%s request_id=%s user_id=%s device_id=%s "
            "language=%s target_language=%s auto_play_audio=%s selected_emoji=%s updated_at=%s fields=%s"
        ),
        phase,
        request_id,
        user_id,
        device_id or "unknown",
        language,
        target_language,
        auto_play_audio,
        selected_emoji,
        updated_at,
        ",".join(fields_set or []),
    )


def _raise_auth_route_error(
    *,
    error: AuthServiceError,
    request_id: str,
    provider: str | None,
    user_id: str | None = None,
) -> None:
    _log_auth_failure(
        request_id=request_id,
        user_id=user_id or error.user_id,
        provider=provider,
        code=error.code,
    )
    raise _auth_error_to_http_exception(error, request_id) from error


async def _resolve_route_result(
    result: Awaitable[dict[str, Any]] | dict[str, Any],
) -> dict[str, Any]:
    if inspect.isawaitable(result):
        resolved = await result
        return dict(resolved)
    return dict(result)


async def _run_auth_route(
    *,
    request: Request,
    provider: str | None,
    action: Callable[[Any, str], Awaitable[dict[str, Any]] | dict[str, Any]],
    on_success: Callable[[dict[str, Any], str], None] | None = None,
) -> dict[str, Any]:
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        result = await _resolve_route_result(action(auth_service, request_id))
        on_success and on_success(result, request_id)
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _raise_auth_route_error(
            error=error,
            request_id=request_id,
            provider=provider,
        )


async def _run_me_route(
    *,
    request: Request,
    action: Callable[[Any, Any, str], Awaitable[dict[str, Any]] | dict[str, Any]],
    write_event: tuple[str, str] | None = None,
) -> dict[str, Any]:
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    user = _resolve_authenticated_user(request, request_id)
    try:
        result = await _resolve_route_result(action(auth_service, user, request_id))
        if write_event is not None:
            method, path = write_event
            _log_phase2_write(
                request_id=request_id,
                user_id=user.user_id,
                device_id=_device_id(request),
                method=method,
                path=path,
            )
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _raise_auth_route_error(
            error=error,
            request_id=request_id,
            provider=None,
            user_id=user.user_id,
        )


def _log_email_verification_event(
    *,
    result: dict[str, Any],
    request_id: str,
    event: str,
) -> None:
    if result.get("verification_required") is not True:
        return

    user = result.get("user") if isinstance(result.get("user"), dict) else {}
    logger.info(
        "[Auth] email verification %s request_id=%s user_id=%s email=%s verification_id=%s",
        event,
        request_id,
        user.get("id", "unknown"),
        _mask_email(str(user.get("email", "unknown"))),
        result.get("verification_id", "unknown"),
    )


def _build_provider_start_redirect(
    *,
    request: Request,
    provider: str,
    redirect_uri: str | None,
    state: str | None,
) -> RedirectResponse:
    request_id = _request_id(request)
    try:
        app_redirect_uri = _resolve_app_redirect_uri(provider=provider, requested_uri=redirect_uri)
        packed_state = _pack_oauth_state(
            state=(state or os.urandom(8).hex()).strip(),
            app_redirect_uri=app_redirect_uri,
        )
        provider_callback_uri = _resolve_provider_callback_uri(request=request, provider=provider)
        authorize_url = _build_oauth_authorize_url(
            provider=provider,
            callback_uri=provider_callback_uri,
            packed_state=packed_state,
        )
        return RedirectResponse(url=authorize_url, status_code=302)
    except AuthServiceError as error:
        _raise_auth_route_error(
            error=error,
            request_id=request_id,
            provider=provider,
        )


def _build_provider_callback_redirect(
    *,
    request: Request,
    provider: str,
    code: str | None,
    state: str | None,
    error: str | None,
    error_description: str | None,
    redirect_uri: str | None,
) -> RedirectResponse:
    request_id = _request_id(request)
    try:
        requested_redirect = _extract_app_redirect_uri_from_state(state) or redirect_uri
        app_redirect_uri = _resolve_app_redirect_uri(provider=provider, requested_uri=requested_redirect)
        params: dict[str, str] = {"request_id": request_id}
        if code:
            params["code"] = code
        if state:
            params["state"] = state
        if error:
            params["error"] = error
        if error_description:
            params["error_description"] = error_description
        return RedirectResponse(url=_append_query_params(app_redirect_uri, params), status_code=302)
    except AuthServiceError as auth_error:
        _raise_auth_route_error(
            error=auth_error,
            request_id=request_id,
            provider=provider,
        )


def _build_provider_logout_start_redirect(
    *,
    request: Request,
    provider: str,
    redirect_uri: str | None,
) -> RedirectResponse:
    request_id = _request_id(request)
    try:
        app_redirect_uri = _resolve_app_logout_redirect_uri(requested_uri=redirect_uri)
        provider_logout_callback_uri = _resolve_provider_logout_callback_uri(
            request=request,
            provider=provider,
            app_redirect_uri=app_redirect_uri,
        )
        provider_logout_url = _build_provider_logout_url(
            provider=provider,
            provider_logout_callback_uri=provider_logout_callback_uri,
        )
        return RedirectResponse(url=provider_logout_url, status_code=302)
    except AuthServiceError as error:
        _raise_auth_route_error(
            error=error,
            request_id=request_id,
            provider=provider,
        )


def _build_provider_logout_callback_redirect(
    *,
    request: Request,
    provider: str,
    app_redirect_uri: str | None,
    error: str | None = None,
    error_description: str | None = None,
) -> RedirectResponse:
    request_id = _request_id(request)
    try:
        redirect_target = _resolve_app_logout_redirect_uri(requested_uri=app_redirect_uri)
        params: dict[str, str] = {
            "request_id": request_id,
            "provider": provider,
        }
        if error:
            params["error"] = error
            if error_description:
                params["error_description"] = error_description
        else:
            params["logout"] = "ok"

        return RedirectResponse(
            url=_append_query_params(redirect_target, params),
            status_code=302,
        )
    except AuthServiceError as auth_error:
        _raise_auth_route_error(
            error=auth_error,
            request_id=request_id,
            provider=provider,
        )


def _build_oauth_provider_login_result(
    *,
    auth_service: Any,
    provider: str,
    payload: OAuthProviderRequest,
    request: Request,
) -> dict[str, Any]:
    provider_user_id = payload.provider_user_id
    email = payload.email
    if _should_verify_provider_identity(
        provider=provider,
        code=payload.code,
        error=payload.error,
        provider_user_id=provider_user_id,
        email=email,
    ):
        if provider == "google":
            provider_user_id, verified_email = _verify_google_identity(request=request, code=payload.code)
            if verified_email:
                email = verified_email
        elif provider == "kakao":
            provider_user_id, verified_email = _verify_kakao_identity(request=request, code=payload.code)
            if verified_email:
                email = verified_email

    return auth_service.oauth_login(
        provider=provider,
        code=payload.code,
        state=payload.state,
        redirect_uri=payload.redirect_uri,
        error=payload.error,
        provider_user_id=provider_user_id,
        email=email,
        locale=payload.locale,
        accept_language=request.headers.get("Accept-Language"),
        device_id=payload.device_id,
    )


def _decorate_profile_media(profile: dict[str, Any], request: Request) -> dict[str, Any]:
    payload = dict(profile)
    asset_id = str(payload.get("profile_image_asset_id") or "").strip()
    if not asset_id:
        if "profile_image_url" in payload:
            payload["profile_image_url"] = _normalize_remote_media_reference(
                payload.get("profile_image_url") if isinstance(payload.get("profile_image_url"), str) else None
            )
        return payload
    render_url = _build_media_render_url(request, asset_id=asset_id)
    payload["profile_image_render_url"] = render_url
    # Keep backward-compat by exposing render url through legacy field.
    payload["profile_image_url"] = render_url
    return payload


def _decorate_history_media_entry(entry: dict[str, Any], request: Request) -> dict[str, Any]:
    payload = dict(entry)
    asset_id = str(payload.get("image_asset_id") or "").strip()
    if not asset_id:
        for key in ("imageUri", "image_render_url"):
            if key in payload:
                payload[key] = _normalize_remote_media_reference(
                    payload.get(key) if isinstance(payload.get(key), str) else None
                )
        return payload
    render_url = _build_media_render_url(request, asset_id=asset_id)
    payload["image_render_url"] = render_url
    # Backward compat for existing clients that only read imageUri.
    payload["imageUri"] = render_url
    return payload


def _sanitize_history_entry_for_persistence(entry: dict[str, Any]) -> dict[str, Any]:
    payload = dict(entry)
    for key in ("imageUri", "image_render_url"):
        if key not in payload:
            continue
        normalized = _normalize_remote_media_reference(
            payload.get(key) if isinstance(payload.get(key), str) else None
        )
        if normalized is None:
            payload.pop(key, None)
        else:
            payload[key] = normalized
    return payload


def _extract_bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization")
    if not header:
        return None
    prefix = "Bearer "
    if not header.startswith(prefix):
        return None
    token = header[len(prefix) :].strip()
    return token or None


def _resolve_rate_limit_subject(request: Request) -> tuple[str, str | None]:
    access_token = _extract_bearer_token(request)
    user_id: str | None = None
    if access_token:
        auth_service = getattr(app.state, "auth_service", None)
        if auth_service is not None:
            try:
                user = auth_service.authenticate_access_token(access_token=access_token)
                user_id = user.user_id
            except AuthServiceError:
                user_id = None

    device_id = (request.headers.get("X-Device-Id") or "").strip() or None
    client_ip = extract_client_ip(request)
    subject = build_rate_limit_subject(
        user_id=user_id,
        device_id=device_id,
        client_ip=client_ip,
    )
    return subject, user_id


def _apply_analysis_rate_limit(*, request: Request, endpoint: str, request_id: str) -> None:
    limiter = getattr(app.state, "analysis_rate_limiter", None)
    if limiter is None:
        return

    subject, user_id = _resolve_rate_limit_subject(request)
    decision = limiter.evaluate(endpoint=endpoint, subject=subject)
    if decision.allowed:
        return

    logger.warning(
        "[RateLimit] blocked request_id=%s endpoint=%s subject=%s user_id=%s retry_after_seconds=%d",
        request_id,
        endpoint,
        subject,
        user_id or "unknown",
        decision.retry_after_seconds,
    )
    raise _build_scoped_rate_limit_http_exception(
        request_id=request_id,
        retry_after_seconds=decision.retry_after_seconds,
        code="API_RATE_LIMITED",
        message="Too many requests. Please retry shortly.",
        retry_scope=endpoint,
        retryable_by_client=True,
    )


def _try_acquire_analysis_slot(*, endpoint: str, request_id: str) -> bool:
    limiter = getattr(app.state, "analysis_admission_limiter", None)
    if limiter is None:
        return False

    if limiter.try_acquire(endpoint=endpoint):
        return True

    retry_after_seconds = max(1, int(getattr(app.state, "analysis_admission_retry_after_seconds", 1)))
    logger.warning(
        "[Admission] blocked request_id=%s endpoint=%s inflight=%d retry_after_seconds=%d",
        request_id,
        endpoint,
        limiter.inflight_count(endpoint=endpoint),
        retry_after_seconds,
    )
    raise _build_scoped_rate_limit_http_exception(
        request_id=request_id,
        retry_after_seconds=retry_after_seconds,
        code="API_RATE_LIMITED",
        message="Server is busy. Please retry shortly.",
        retry_scope=endpoint,
        retryable_by_client=True,
    )


def _release_analysis_slot(*, endpoint: str) -> None:
    limiter = getattr(app.state, "analysis_admission_limiter", None)
    if limiter is None:
        return
    limiter.release(endpoint=endpoint)


def _resolve_authenticated_user(request: Request, request_id: str):
    auth_service = _service("auth_service")
    access_token = _extract_bearer_token(request)
    if not access_token:
        _log_auth_failure(
            request_id=request_id,
            user_id=None,
            provider=None,
            code="AUTH_TOKEN_MISSING",
        )
        raise HTTPException(
            status_code=401,
            detail={
                "message": "Missing bearer token.",
                "code": "AUTH_TOKEN_MISSING",
                "request_id": request_id,
            },
        )

    try:
        return auth_service.authenticate_access_token(access_token=access_token)
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Food Lens API is running"}


@app.get("/health/ready")
def readiness_check():
    payload, status_code = _build_readiness_report()
    return JSONResponse(status_code=status_code, content=payload)


@app.get("/debug/models")
async def debug_models():
    """Trigger model listing debug."""
    analyst = _service("analyst")
    await analyst.debug_list_models()
    return {"status": "triggered", "message": "Check server logs for model list"}


@app.post("/auth/email/signup")
async def auth_email_signup(payload: EmailSignupRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="email",
        action=lambda auth_service, _request_id: run_in_threadpool(
            auth_service.signup_email,
            email=payload.email,
            password=payload.password,
            display_name=payload.display_name,
            locale=payload.locale,
            accept_language=request.headers.get("Accept-Language"),
            device_id=payload.device_id,
        ),
        on_success=lambda result, request_id: _log_email_verification_event(
            result=result,
            request_id=request_id,
            event="issued",
        ),
    )


@app.post("/auth/email/login")
async def auth_email_login(payload: EmailLoginRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="email",
        action=lambda auth_service, _request_id: auth_service.login_email(
            email=payload.email,
            password=payload.password,
            device_id=payload.device_id,
        ),
    )


@app.post("/auth/email/verify")
async def auth_email_verify(payload: EmailVerifyRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="email",
        action=lambda auth_service, _request_id: auth_service.verify_email(
            email=payload.email,
            code=payload.code,
            device_id=payload.device_id,
        ),
    )


@app.post("/auth/email/verification/request")
async def auth_email_verification_request(payload: EmailVerificationRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="email",
        action=lambda auth_service, _request_id: run_in_threadpool(
            auth_service.request_email_verification,
            email=payload.email,
        ),
        on_success=lambda result, request_id: _log_email_verification_event(
            result=result,
            request_id=request_id,
            event="reissued",
        ),
    )


@app.post("/auth/email/password/reset/request")
async def auth_email_password_reset_request(payload: PasswordResetRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="email",
        action=lambda auth_service, _request_id: run_in_threadpool(
            auth_service.request_password_reset,
            email=payload.email,
        ),
    )


@app.post("/auth/email/password/reset/confirm")
async def auth_email_password_reset_confirm(payload: PasswordResetConfirmRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="email",
        action=lambda auth_service, _request_id: auth_service.confirm_password_reset(
            email=payload.email,
            code=payload.code,
            new_password=payload.new_password,
        ),
    )


@app.get("/auth/google/start")
async def auth_google_start(
    request: Request,
    redirect_uri: str | None = None,
    state: str | None = None,
):
    return _build_provider_start_redirect(
        request=request,
        provider="google",
        redirect_uri=redirect_uri,
        state=state,
    )


@app.get("/auth/google/callback")
async def auth_google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    redirect_uri: str | None = None,
):
    return _build_provider_callback_redirect(
        request=request,
        provider="google",
        code=code,
        state=state,
        error=error,
        error_description=error_description,
        redirect_uri=redirect_uri,
    )


@app.get("/auth/kakao/start")
async def auth_kakao_start(
    request: Request,
    redirect_uri: str | None = None,
    state: str | None = None,
):
    return _build_provider_start_redirect(
        request=request,
        provider="kakao",
        redirect_uri=redirect_uri,
        state=state,
    )


@app.get("/auth/kakao/callback")
async def auth_kakao_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    redirect_uri: str | None = None,
):
    return _build_provider_callback_redirect(
        request=request,
        provider="kakao",
        code=code,
        state=state,
        error=error,
        error_description=error_description,
        redirect_uri=redirect_uri,
    )


@app.get("/auth/google/logout/start")
async def auth_google_logout_start(
    request: Request,
    redirect_uri: str | None = None,
):
    return _build_provider_logout_start_redirect(
        request=request,
        provider="google",
        redirect_uri=redirect_uri,
    )


@app.get("/auth/google/logout/callback")
async def auth_google_logout_callback(
    request: Request,
    app_redirect_uri: str | None = None,
):
    return _build_provider_logout_callback_redirect(
        request=request,
        provider="google",
        app_redirect_uri=app_redirect_uri,
    )


@app.get("/auth/kakao/logout/start")
async def auth_kakao_logout_start(
    request: Request,
    redirect_uri: str | None = None,
):
    return _build_provider_logout_start_redirect(
        request=request,
        provider="kakao",
        redirect_uri=redirect_uri,
    )


@app.get("/auth/kakao/logout/callback")
async def auth_kakao_logout_callback(
    request: Request,
    app_redirect_uri: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    return _build_provider_logout_callback_redirect(
        request=request,
        provider="kakao",
        app_redirect_uri=app_redirect_uri,
        error=error,
        error_description=error_description,
    )


@app.post("/auth/google")
async def auth_google(payload: OAuthProviderRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="google",
        action=lambda auth_service, _request_id: _build_oauth_provider_login_result(
            auth_service=auth_service,
            provider="google",
            payload=payload,
            request=request,
        ),
    )


@app.post("/auth/kakao")
async def auth_kakao(payload: OAuthProviderRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider="kakao",
        action=lambda auth_service, _request_id: _build_oauth_provider_login_result(
            auth_service=auth_service,
            provider="kakao",
            payload=payload,
            request=request,
        ),
    )


@app.post("/auth/refresh")
async def auth_refresh(payload: RefreshRequest, request: Request):
    return await _run_auth_route(
        request=request,
        provider=None,
        action=lambda auth_service, _request_id: auth_service.refresh(
            refresh_token=payload.refresh_token
        ),
    )


@app.post("/auth/logout")
async def auth_logout(payload: LogoutRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        revoked_count = auth_service.logout(
            access_token=_extract_bearer_token(request),
            refresh_token=payload.refresh_token,
        )
        logger.info(
            "[Auth] logout success request_id=%s revoked_sessions=%s",
            request_id,
            revoked_count,
        )
        return {
            "ok": True,
            "revoked_sessions": revoked_count,
            "request_id": request_id,
        }
    except AuthServiceError as error:
        if error.code == "AUTH_SESSION_NOT_FOUND":
            # Idempotent logout: treat missing/expired local session as already logged out.
            logger.info(
                "[Auth] logout success request_id=%s revoked_sessions=0 idempotent=true",
                request_id,
            )
            return {
                "ok": True,
                "revoked_sessions": 0,
                "request_id": request_id,
            }
        _raise_auth_route_error(
            error=error,
            request_id=request_id,
            provider=None,
        )


@app.post("/me/media/upload")
async def post_me_media_upload(
    request: Request,
    file: UploadFile = File(...),
    scope: str = Form(...),
    linked_entry_id: str | None = Form(default=None),
):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    media_storage = _service("media_storage")
    user = _resolve_authenticated_user(request, request_id)
    normalized_scope = (scope or "").strip().lower()
    if normalized_scope not in {"profile", "history"}:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "scope must be one of: profile, history",
                "code": "MEDIA_INVALID_SCOPE",
                "request_id": request_id,
            },
        )

    mime_type = (file.content_type or "").strip().lower()
    if mime_type not in MEDIA_ALLOWED_UPLOAD_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail={
                "message": "Unsupported media content type.",
                "code": "MEDIA_UNSUPPORTED_CONTENT_TYPE",
                "request_id": request_id,
            },
        )

    try:
        payload = await file.read()

        def _store_media_upload() -> tuple[MediaUploadResult, dict[str, object]]:
            upload_result = media_storage.upload_original(
                user_id=user.user_id,
                scope=normalized_scope,
                mime_type=mime_type,
                payload=payload,
                filename=file.filename,
            )
            registered_asset_id: str | None = None
            try:
                registered_asset = auth_service.register_media_asset(
                    user_id=user.user_id,
                    scope=normalized_scope,
                    mime_type=upload_result.mime_type,
                    size_bytes=upload_result.size_bytes,
                    sha256=upload_result.sha256,
                    object_key=upload_result.object_key,
                    asset_id=upload_result.asset_id,
                    object_generation=upload_result.generation,
                )
                registered_asset_id = str(registered_asset["asset_id"])
                _register_media_retention_record(
                    asset_id=upload_result.asset_id,
                    user_id=user.user_id,
                    object_key=upload_result.object_key,
                    object_generation=upload_result.generation,
                )
            except AuthServiceError as error:
                _compensate_failed_media_upload(
                    auth_service=auth_service,
                    media_storage=media_storage,
                    upload_result=upload_result,
                    registered_asset_id=registered_asset_id,
                    request_id=request_id,
                    user_id=user.user_id,
                    scope=normalized_scope,
                    cause_code=error.code,
                )
                raise
            except AuthStateStoreError as error:
                _compensate_failed_media_upload(
                    auth_service=auth_service,
                    media_storage=media_storage,
                    upload_result=upload_result,
                    registered_asset_id=upload_result.asset_id,
                    request_id=request_id,
                    user_id=user.user_id,
                    scope=normalized_scope,
                    cause_code="AUTH_STATE_STORE_FAILED",
                )
                raise
            except RetentionStoreError as error:
                _compensate_failed_media_upload(
                    auth_service=auth_service,
                    media_storage=media_storage,
                    upload_result=upload_result,
                    registered_asset_id=registered_asset_id,
                    request_id=request_id,
                    user_id=user.user_id,
                    scope=normalized_scope,
                    cause_code="MEDIA_RETENTION_RECORD_ADD_FAILED",
                )
                raise
            return upload_result, registered_asset

        upload, asset = await run_in_threadpool(_store_media_upload)
        render_url = _build_media_render_url(request, asset_id=upload.asset_id)
        logger.info(
            "[Media] upload success request_id=%s user_id=%s asset_id=%s scope=%s bytes=%s",
            request_id,
            user.user_id,
            upload.asset_id,
            normalized_scope,
            upload.size_bytes,
        )
        return {
            "asset": {
                **asset,
                "render_url": render_url,
                "linked_entry_id": (linked_entry_id or "").strip() or None,
            },
            "request_id": request_id,
        }
    except MediaStorageError as error:
        logger.warning(
            "[Media] upload failed request_id=%s user_id=%s scope=%s code=%s status=%s",
            request_id,
            user.user_id,
            normalized_scope,
            error.code,
            error.status_code,
        )
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "message": error.message,
                "code": error.code,
                "request_id": request_id,
            },
        ) from error
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=user.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error
    except AuthStateStoreError as error:
        logger.warning(
            "[Media] upload failed request_id=%s user_id=%s scope=%s code=%s error=%s",
            request_id,
            user.user_id,
            normalized_scope,
            "AUTH_STATE_STORE_FAILED",
            str(error),
        )
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to persist auth state.",
                "code": "AUTH_STATE_STORE_FAILED",
                "request_id": request_id,
            },
        ) from error
    except RetentionStoreError as error:
        logger.warning(
            "[Media] upload failed request_id=%s user_id=%s scope=%s code=%s error=%s",
            request_id,
            user.user_id,
            normalized_scope,
            "MEDIA_RETENTION_RECORD_ADD_FAILED",
            str(error),
        )
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to register media retention record.",
                "code": "MEDIA_RETENTION_RECORD_ADD_FAILED",
                "request_id": request_id,
            },
        ) from error


@app.delete("/me/media/{asset_id}")
async def delete_me_media_asset(asset_id: str, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    media_storage = _service("media_storage")
    user = _resolve_authenticated_user(request, request_id)
    normalized_asset_id = asset_id.strip()
    if not normalized_asset_id:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "asset_id is required.",
                "code": "MEDIA_INVALID_ASSET_ID",
                "request_id": request_id,
            },
        )

    try:
        asset = await run_in_threadpool(
            auth_service.get_media_asset,
            asset_id=normalized_asset_id,
            user_id=user.user_id,
        )
        object_key = str(asset.get("object_key") or "").strip()
        if not object_key:
            raise HTTPException(
                status_code=500,
                detail={
                    "message": "Media asset storage key is missing.",
                    "code": "MEDIA_OBJECT_KEY_MISSING",
                    "request_id": request_id,
                },
            )

        object_generation = _coerce_optional_generation(asset.get("object_generation"))
        try:
            object_generation = await run_in_threadpool(
                _resolve_media_asset_generation,
                auth_service=auth_service,
                media_storage=media_storage,
                asset=asset,
                request_id=request_id,
            )
            await run_in_threadpool(
                media_storage.delete_original,
                object_key=object_key,
                generation=object_generation,
            )
        except MediaStorageError as error:
            if error.code == "MEDIA_NOT_FOUND":
                pass
            else:
                if _is_media_deletion_retryable_error(error):
                    await run_in_threadpool(
                        _schedule_media_deletion_retry_record,
                        asset_id=normalized_asset_id,
                        user_id=user.user_id,
                        object_key=object_key,
                        object_generation=object_generation,
                        request_id=request_id,
                        cause_code=error.code,
                        status_code=error.status_code,
                    )
                raise
        purged_cache_entries = await _media_render_cache_purge_asset(normalized_asset_id)
        retention_store = getattr(app.state, "retention_store", None)
        if retention_store is not None:
            try:
                await run_in_threadpool(
                    retention_store.remove,
                    normalized_asset_id,
                )
            except RetentionStoreError as error:
                raise HTTPException(
                    status_code=500,
                    detail={
                        "message": "Failed to remove media retention record.",
                        "code": "MEDIA_RETENTION_RECORD_REMOVE_FAILED",
                        "request_id": request_id,
                    },
                ) from error
        deleted = await run_in_threadpool(auth_service.delete_media_asset, asset_id=normalized_asset_id)
        if not deleted:
            raise AuthServiceError(
                code="AUTH_MEDIA_NOT_FOUND",
                message="Media asset not found.",
                status_code=404,
                user_id=user.user_id,
            )

        logger.info(
            "[Media] delete success request_id=%s user_id=%s asset_id=%s scope=%s purged_cache_entries=%s",
            request_id,
            user.user_id,
            normalized_asset_id,
            str(asset.get("scope") or "unknown"),
            purged_cache_entries,
        )
        return {
            "deleted": True,
            "asset_id": normalized_asset_id,
            "request_id": request_id,
        }
    except HTTPException:
        raise
    except MediaStorageError as error:
        logger.warning(
            "[Media] delete failed request_id=%s user_id=%s asset_id=%s code=%s status=%s",
            request_id,
            user.user_id,
            normalized_asset_id,
            error.code,
            error.status_code,
        )
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "message": error.message,
                "code": error.code,
                "request_id": request_id,
            },
        ) from error
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=user.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/media/render/{asset_id}")
async def get_media_render(
    asset_id: str,
    request: Request,
    w: int = Query(default=512),
    q: int = Query(default=75),
    fmt: str = Query(default="auto"),
    exp: int = Query(default=0),
    sig: str = Query(default=""),
):
    request_id = _request_id(request)
    try:
        now_ts = int(time.time())
        if not exp or not sig or exp < now_ts:
            raise HTTPException(
                status_code=403,
                detail={
                    "message": "Render URL is expired or invalid.",
                    "code": "MEDIA_RENDER_FORBIDDEN",
                    "request_id": request_id,
                },
            )

        allowed_widths = set(getattr(app.state, "media_render_allowed_widths", {128, 256, 512, 1024}))
        final_width = w if w in allowed_widths else int(getattr(app.state, "media_render_default_width", 512))
        quality_min = int(getattr(app.state, "media_render_quality_min", 50))
        quality_max = int(getattr(app.state, "media_render_quality_max", 85))
        final_quality = max(quality_min, min(quality_max, q))
        final_fmt = _resolve_media_format(fmt, request.headers.get("accept", ""))

        if not _verify_media_render_signature(
            asset_id=asset_id,
            width=final_width,
            quality=final_quality,
            fmt=fmt,
            exp=exp,
            sig=sig,
        ):
            raise HTTPException(
                status_code=403,
                detail={
                    "message": "Render signature verification failed.",
                    "code": "MEDIA_RENDER_FORBIDDEN",
                    "request_id": request_id,
                },
            )

        auth_service = _service("auth_service")
        media_storage = _service("media_storage")
        started_at = time.time()
        variant_key = _media_render_variant_key(
            asset_id=asset_id,
            width=final_width,
            quality=final_quality,
            target_format=final_fmt,
        )
        cached = await _media_render_cache_get(variant_key, now_ts)
        if cached is not None:
            asset = await run_in_threadpool(auth_service.get_media_asset, asset_id=asset_id)
            rendered_bytes, content_type = cached
            owner_id = str(asset.get("user_id") or "unknown")
            asset_scope = str(asset.get("scope") or "unknown")
            remaining_ttl = max(1, exp - now_ts)
            render_ms = int((time.time() - started_at) * 1000)
            logger.info(
                "[Media] render success request_id=%s user_id=%s asset_id=%s scope=%s format=%s render_ms=%s cache_hit=%s",
                request_id,
                owner_id,
                asset_id,
                asset_scope,
                content_type,
                render_ms,
                True,
            )
            return Response(
                content=rendered_bytes,
                media_type=content_type,
                headers={
                    "Cache-Control": f"public, max-age={remaining_ttl}",
                    "Vary": "Accept",
                    **_media_render_cache_diagnostic_headers(request_id=request_id, cache_hit=True),
                    "X-Media-Render-Duration-Ms": str(render_ms),
                },
            )

        def _render_variant_sync() -> MediaRenderResult:
            stage_started_at = time.time()
            asset = auth_service.get_media_asset(asset_id=asset_id)
            lookup_ms = int((time.time() - stage_started_at) * 1000)

            stage_started_at = time.time()
            source = media_storage.fetch_original(object_key=str(asset["object_key"]))
            fetch_ms = int((time.time() - stage_started_at) * 1000)

            stage_started_at = time.time()
            rendered_bytes, content_type = _render_image_bytes(
                source_bytes=source.bytes_data,
                target_width=final_width,
                target_quality=final_quality,
                target_format=final_fmt,
                target_webp_method=int(getattr(app.state, "media_render_webp_method", 4)),
            )
            transform_ms = int((time.time() - stage_started_at) * 1000)

            owner_id = str(asset.get("user_id") or "unknown")
            scope = str(asset.get("scope") or "unknown")
            return rendered_bytes, content_type, owner_id, scope, {
                "fetch": fetch_ms,
                "lookup": lookup_ms,
                "transform": transform_ms,
            }

        async def _render_variant() -> MediaRenderResult:
            render_result, limit_wait_ms = await _run_media_render_miss_limited(
                lambda: run_in_threadpool(_render_variant_sync)
            )
            rendered_bytes, content_type, owner_id, scope, stage_ms = render_result
            stage_ms["limit_wait"] = limit_wait_ms
            cache_set_started_at = time.time()
            await _media_render_cache_set(
                variant_key,
                bytes_data=rendered_bytes,
                content_type=content_type,
                now_ts=int(time.time()),
            )
            stage_ms["cache_set"] = int((time.time() - cache_set_started_at) * 1000)
            _schedule_media_render_touch_after_render(
                auth_service=auth_service,
                asset_id=asset_id,
                request_id=request_id,
            )
            return rendered_bytes, content_type, owner_id, scope, stage_ms

        rendered_bytes, content_type, owner_id, asset_scope, stage_ms = await _run_media_render_singleflight(
            variant_key,
            _render_variant,
        )
        remaining_ttl = max(1, exp - now_ts)
        render_ms = int((time.time() - started_at) * 1000)
        logger.info(
            "[Media] render success request_id=%s user_id=%s asset_id=%s scope=%s format=%s render_ms=%s cache_hit=%s stage_ms=%s",
            request_id,
            owner_id,
            asset_id,
            asset_scope,
            content_type,
            render_ms,
            False,
            stage_ms,
        )
        return Response(
            content=rendered_bytes,
            media_type=content_type,
            headers={
                "Cache-Control": f"public, max-age={remaining_ttl}",
                "Vary": "Accept",
                **_media_render_cache_diagnostic_headers(request_id=request_id, cache_hit=False),
                "X-Media-Render-Duration-Ms": str(render_ms),
                "X-Media-Render-Stage-Ms": _format_media_render_stage_header(stage_ms),
            },
        )
    except HTTPException as error:
        raise _media_render_http_exception(error, request_id=request_id) from error
    except MediaStorageError as error:
        logger.warning(
            "[Media] render failed request_id=%s asset_id=%s code=%s status=%s",
            request_id,
            asset_id,
            error.code,
            error.status_code,
        )
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "message": error.message,
                "code": error.code,
                "request_id": request_id,
            },
            headers=_media_render_cache_diagnostic_headers(request_id=request_id, cache_hit=False),
        ) from error
    except AuthServiceError as error:
        raise _media_render_http_exception(
            _auth_error_to_http_exception(error, request_id),
            request_id=request_id,
        ) from error


@app.patch("/me/history/{history_item_id}/image")
async def patch_me_history_image(
    history_item_id: str,
    payload: HistoryImagePatchRequest,
    request: Request,
):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    user = _resolve_authenticated_user(request, request_id)
    try:
        auth_service.assert_media_asset_owner(user_id=user.user_id, asset_id=payload.image_asset_id)
        history_item = auth_service.patch_history_image(
            user_id=user.user_id,
            history_item_id=history_item_id,
            image_asset_id=payload.image_asset_id,
        )
        entry = history_item.get("entry")
        if isinstance(entry, dict):
            history_item["entry"] = _decorate_history_media_entry(entry, request)
        _log_phase2_write(
            request_id=request_id,
            user_id=user.user_id,
            method="PATCH",
            path="/me/history/{history_item_id}/image",
        )
        return {"history_item": history_item, "request_id": request_id}
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=user.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/me/profile")
async def get_me_profile(request: Request):
    return await _run_me_route(
        request=request,
        action=lambda auth_service, user, _request_id: {
            "profile": _decorate_profile_media(
                auth_service.get_profile(user_id=user.user_id),
                request,
            )
        },
    )


@app.put("/me/profile")
async def put_me_profile(payload: ProfileUpdateRequest, request: Request):
    def _action(auth_service: Any, user: Any, _request_id: str) -> dict[str, Any]:
        fields_set = set(getattr(payload, "model_fields_set", set()))
        current_trip_coordinates = None
        if payload.current_trip_coordinates is not None:
            if hasattr(payload.current_trip_coordinates, "model_dump"):
                current_trip_coordinates = payload.current_trip_coordinates.model_dump()
            else:  # pragma: no cover - pydantic v1 compatibility
                current_trip_coordinates = payload.current_trip_coordinates.dict()

        sanitized_profile_image_url = None
        if "profile_image_url" in fields_set:
            sanitized_profile_image_url = _normalize_remote_media_reference(payload.profile_image_url)
            if sanitized_profile_image_url is None:
                sanitized_profile_image_url = ""

        profile = auth_service.update_profile(
            user_id=user.user_id,
            display_name=payload.display_name,
            profile_image_url=sanitized_profile_image_url,
            profile_image_asset_id=payload.profile_image_asset_id,
            gender=payload.gender,
            birth_year=payload.birth_year,
            disliked_ingredients=payload.disliked_ingredients,
            locale=payload.locale,
            accept_language=request.headers.get("Accept-Language"),
            timezone_name=payload.timezone,
            current_trip_start=payload.current_trip_start,
            current_trip_location=payload.current_trip_location,
            current_trip_coordinates=current_trip_coordinates,
            expected_updated_at=payload.expected_updated_at,
        )
        return {"profile": _decorate_profile_media(profile, request)}

    return await _run_me_route(
        request=request,
        action=_action,
        write_event=("PUT", "/me/profile"),
    )


@app.get("/me/allergies")
async def get_me_allergies(request: Request):
    return await _run_me_route(
        request=request,
        action=lambda auth_service, user, _request_id: {
            "allergies": auth_service.get_allergies(user_id=user.user_id)
        },
    )


@app.put("/me/allergies")
async def put_me_allergies(payload: AllergiesUpdateRequest, request: Request):
    return await _run_me_route(
        request=request,
        action=lambda auth_service, user, _request_id: {
            "allergies": auth_service.update_allergies(
                user_id=user.user_id,
                allergies=payload.allergies,
                dietary_restrictions=payload.dietary_restrictions,
                severity_map=payload.severity_map,
                expected_updated_at=payload.expected_updated_at,
            )
        },
        write_event=("PUT", "/me/allergies"),
    )


@app.get("/me/settings")
async def get_me_settings(request: Request):
    def _action(auth_service: Any, user: Any, request_id: str) -> dict[str, Any]:
        settings = auth_service.get_settings(user_id=user.user_id)
        _log_settings_trace(
            phase="get_response",
            request_id=request_id,
            user_id=user.user_id,
            device_id=_device_id(request),
            language=settings.get("language") if isinstance(settings, dict) else None,
            target_language=settings.get("target_language") if isinstance(settings, dict) else None,
            auto_play_audio=settings.get("auto_play_audio") if isinstance(settings, dict) else None,
            selected_emoji=settings.get("selected_emoji") if isinstance(settings, dict) else None,
            updated_at=settings.get("updated_at") if isinstance(settings, dict) else None,
        )
        return {"settings": settings}

    return await _run_me_route(
        request=request,
        action=_action,
    )


@app.put("/me/settings")
async def put_me_settings(payload: SettingsUpdateRequest, request: Request):
    fields_set = set(getattr(payload, "model_fields_set", set()))
    target_language = (
        ""
        if "target_language" in fields_set and payload.target_language is None
        else payload.target_language
    )
    selected_emoji = (
        ""
        if "selected_emoji" in fields_set and payload.selected_emoji is None
        else payload.selected_emoji
    )
    client_state = (
        {}
        if "client_state" in fields_set and payload.client_state is None
        else (
            payload.client_state.model_dump(exclude_none=False)
            if payload.client_state is not None
            else None
        )
    )

    def _action(auth_service: Any, user: Any, request_id: str) -> dict[str, Any]:
        settings = auth_service.update_settings(
            user_id=user.user_id,
            language=payload.language,
            target_language=target_language,
            auto_play_audio=payload.auto_play_audio,
            selected_emoji=selected_emoji,
            client_state=client_state,
            expected_updated_at=payload.expected_updated_at,
        )
        _log_settings_trace(
            phase="put_apply",
            request_id=request_id,
            user_id=user.user_id,
            device_id=_device_id(request),
            language=settings.get("language") if isinstance(settings, dict) else payload.language,
            target_language=settings.get("target_language") if isinstance(settings, dict) else target_language,
            auto_play_audio=(
                settings.get("auto_play_audio")
                if isinstance(settings, dict)
                else payload.auto_play_audio
            ),
            selected_emoji=(
                settings.get("selected_emoji")
                if isinstance(settings, dict)
                else selected_emoji
            ),
            updated_at=settings.get("updated_at") if isinstance(settings, dict) else None,
            fields_set=sorted(fields_set),
        )
        return {"settings": settings}

    return await _run_me_route(
        request=request,
        action=_action,
        write_event=("PUT", "/me/settings"),
    )


@app.get("/me/history")
async def get_me_history(request: Request, limit: int | None = None):
    def _action(auth_service: Any, user: Any, _request_id: str) -> dict[str, Any]:
        history = auth_service.get_history(user_id=user.user_id, limit=limit)
        decorated_history: list[dict[str, Any]] = []
        for item in history:
            entry = item.get("entry")
            if isinstance(entry, dict):
                item = {**item, "entry": _decorate_history_media_entry(entry, request)}
            decorated_history.append(item)
        return {"history": decorated_history}

    return await _run_me_route(
        request=request,
        action=_action,
    )


@app.post("/me/history")
async def post_me_history(payload: HistoryWriteRequest, request: Request):
    def _action(auth_service: Any, user: Any, _request_id: str) -> dict[str, Any]:
        entry = _sanitize_history_entry_for_persistence(payload.entry)
        image_asset_id = entry.get("image_asset_id")
        if isinstance(image_asset_id, str) and image_asset_id.strip():
            auth_service.assert_media_asset_owner(
                user_id=user.user_id,
                asset_id=image_asset_id,
            )
        history_item = auth_service.append_history(
            user_id=user.user_id,
            entry=entry,
            idempotency_key=payload.idempotency_key,
        )
        item_entry = history_item.get("entry")
        if isinstance(item_entry, dict):
            history_item["entry"] = _decorate_history_media_entry(item_entry, request)
        return {"history_item": history_item}

    return await _run_me_route(
        request=request,
        action=_action,
        write_event=("POST", "/me/history"),
    )


@app.patch("/me/history/{history_item_id}")
async def patch_me_history(
    history_item_id: str,
    payload: HistoryTimestampPatchRequest,
    request: Request,
):
    def _action(auth_service: Any, user: Any, _request_id: str) -> dict[str, Any]:
        history_item = auth_service.patch_history_timestamp(
            user_id=user.user_id,
            history_item_id=history_item_id,
            timestamp=payload.timestamp,
            expected_updated_at=payload.expected_updated_at,
        )
        entry = history_item.get("entry")
        if isinstance(entry, dict):
            history_item["entry"] = _decorate_history_media_entry(entry, request)
        return {"history_item": history_item}

    return await _run_me_route(
        request=request,
        action=_action,
        write_event=("PATCH", "/me/history"),
    )


@app.delete("/me/history/{history_item_id}")
async def delete_me_history(history_item_id: str, request: Request):
    return await _run_me_route(
        request=request,
        action=lambda auth_service, user, _request_id: {
            "deleted": auth_service.delete_history_item(
                user_id=user.user_id,
                history_item_id=history_item_id,
            )
        },
        write_event=("DELETE", "/me/history"),
    )


@app.get("/me/deletion-requests/latest")
async def get_me_latest_deletion_request(request: Request):
    def _action(_auth_service: Any, user: Any, _request_id: str) -> dict[str, Any]:
        storage = getattr(app.state, "deletion_queue_storage", None)
        snapshot = storage.get_latest_status_for_user(user.user_id) if storage is not None else None
        return {"deletion_request": _serialize_deletion_status(snapshot)}

    return await _run_me_route(
        request=request,
        action=_action,
    )


@app.post("/me/deletion-requests")
async def post_me_deletion_request(payload: DeletionRequestCreateRequest, request: Request):
    def _action(_auth_service: Any, user: Any, _request_id: str) -> dict[str, Any]:
        producer = getattr(app.state, "deletion_queue_producer", None)
        consumer = getattr(app.state, "deletion_queue_consumer", None)
        storage = getattr(app.state, "deletion_queue_storage", None)
        if producer is None or consumer is None or storage is None:
            raise raise_service_unavailable("deletion_queue")

        target = DeletionTarget(payload.target)
        item = producer.enqueue_user_deletion(
            user_id=user.user_id,
            target=target,
            reason="user_requested",
            request_id=_request_id,
        )
        consumer.consume_queue_id(item.queue_id)
        snapshot = storage.get_status(item.queue_id)
        return {"deletion_request": _serialize_deletion_status(snapshot)}

    return await _run_me_route(
        request=request,
        action=_action,
        write_event=("POST", "/me/deletion-requests"),
    )


@app.post("/analyze/jobs", response_model=AnalysisJobSubmitResponseContract, status_code=202)
async def submit_analysis_job(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
    mode: str = Form("food"),
    idempotency_key: str | None = Form(None),
):
    request_id = _request_id(request)
    normalized_idempotency_key = _normalize_idempotency_key(
        header_value=request.headers.get("Idempotency-Key"),
        form_value=idempotency_key,
    )
    normalized_mode = (mode or "").strip().lower()
    if normalized_mode not in {"food", "label", "smart"}:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid analyze job mode.",
                "code": ErrorCode.ANALYZE_FAILED,
                "request_id": request_id,
            },
        )

    _apply_analysis_rate_limit(request=request, endpoint="/analyze/jobs", request_id=request_id)
    slot_acquired = _try_acquire_analysis_slot(endpoint="/analyze/jobs", request_id=request_id)
    _assert_analysis_job_remote_worker_available(request_id=request_id)
    started_at = time.perf_counter()

    try:
        contents, content_type = await _read_analysis_job_upload(file=file, request_id=request_id)
        job_payload = _call_with_supported_kwargs(
            create_analysis_job_payload,
            {
                "request_id": request_id,
                "mode": normalized_mode,
                "allergy_info": allergy_info,
                "iso_country_code": iso_country_code,
                "locale": locale,
                "content_type": content_type,
                "image_bytes": contents,
                "image_sha256": hashlib.sha256(contents).hexdigest(),
                "poll_after_ms": _analysis_job_poll_after_ms(),
            },
        )
        store = _analysis_job_store()
        idempotency_user_id = _resolve_analysis_job_idempotency_user_id(
            request=request,
            idempotency_key=normalized_idempotency_key,
        )
        try:
            create_job_result = await run_in_threadpool(
                submit_analysis_job_record,
                store=store,
                payload=job_payload,
                user_id=idempotency_user_id,
                idempotency_key=normalized_idempotency_key,
            )
        except AnalysisJobStoreError as error:
            logger.exception(
                "[AnalysisJob] submit failed request_id=%s mode=%s bytes=%d backend=%s error=%s",
                request_id,
                normalized_mode,
                len(contents),
                type(store).__name__,
                str(error),
            )
            raise _analysis_job_store_http_exception(request_id=request_id, action="submit") from error
        accepted_record = _build_analysis_job_accepted_record(
            job_payload=job_payload,
            create_job_result=create_job_result,
        )
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info(
            "[AnalysisJob] accepted request_id=%s job_id=%s mode=%s bytes=%d latency_ms=%d",
            request_id,
            accepted_record["job_id"],
            normalized_mode,
            len(contents),
            elapsed_ms,
        )
        submit_payload = _serialize_analysis_job_submit_response(record=accepted_record)
        retry_after = str(max(1, int(submit_payload["poll_after_ms"]) // 1000))
        response.headers["Retry-After"] = retry_after
        return JSONResponse(status_code=202, content=submit_payload, headers={"Retry-After": retry_after})
    finally:
        if slot_acquired:
            _release_analysis_slot(endpoint="/analyze/jobs")


@app.get("/analyze/jobs/{job_id}", response_model=AnalysisJobStatusResponseContract)
async def get_analysis_job_status(request: Request, job_id: str):
    request_id = _request_id(request)
    _apply_analysis_rate_limit(request=request, endpoint="/analyze/jobs/status", request_id=request_id)
    store = _analysis_job_store()
    try:
        record = await run_in_threadpool(store.get_job, job_id=job_id)
    except AnalysisJobStoreError as error:
        logger.exception(
            "[AnalysisJob] poll failed request_id=%s job_id=%s backend=%s error=%s",
            request_id,
            job_id,
            type(store).__name__,
            str(error),
        )
        raise _analysis_job_store_http_exception(request_id=request_id, action="poll") from error
    if record is None:
        raise HTTPException(
            status_code=404,
            detail={
                "message": "Analysis job not found.",
                "code": ErrorCode.ANALYZE_FAILED,
                "request_id": request_id,
            },
        )
    payload = _analysis_job_status_payload(record=record)
    logger.info(
        "[AnalysisJob] poll request_id=%s job_id=%s status=%s poll_after_ms=%s",
        request_id,
        job_id,
        payload.get("status"),
        payload.get("poll_after_ms"),
    )
    return payload


@app.post("/analyze", response_model=AnalysisResponseContract)
async def analyze_food(
    request: Request,
    file: UploadFile = File(...), 
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    request_id = _request_id(request)
    _apply_analysis_rate_limit(request=request, endpoint="/analyze", request_id=request_id)
    slot_acquired = _try_acquire_analysis_slot(endpoint="/analyze", request_id=request_id)
    started_at = time.perf_counter()

    try:
        async def _operation():
            preprocess_started_at = time.perf_counter()
            contents = await file.read()
            image = await run_in_threadpool(decode_upload_to_image, contents)
            preprocess_elapsed_ms = int((time.perf_counter() - preprocess_started_at) * 1000)

            prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
            return await _analyze_food_image_with_policy(
                image,
                allergy_info,
                prompt_country_code,
                request_id,
                started_at,
                preprocess_elapsed_ms,
            )

        result = await run_with_error_policy(
            endpoint="/analyze",
            policy=EndpointErrorPolicy(code=ErrorCode.ANALYZE_FAILED, status_code=500, user_message="Analyze failed"),
            operation=_operation,
            request_id=request_id,
        )
        if isinstance(result, dict):
            result.setdefault("request_id", request_id)
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        if isinstance(result, dict) and "latency_ms" not in result:
            result["latency_ms"] = _build_latency_ms_payload(
                total_ms=elapsed_ms,
                preprocess_ms=None,
                extract_ms=None,
                assess_ms=None,
                source_lookup_ms=None,
                allergen_analysis_ms=None,
            )
        logger.info(
            "[Server] Analyze completed request_id=%s prompt_version=%s used_model=%s elapsed_ms=%d",
            request_id,
            result.get("prompt_version") if isinstance(result, dict) else None,
            result.get("used_model") if isinstance(result, dict) else None,
            elapsed_ms,
        )
        return result
    finally:
        if slot_acquired:
            _release_analysis_slot(endpoint="/analyze")


async def _analyze_food_image_with_policy(
    image: Image.Image,
    allergy_info: str,
    prompt_country_code: str,
    request_id: str,
    total_started_at: float,
    preprocess_elapsed_ms: int,
    *,
    job_mode: bool = False,
) -> dict[str, Any]:
    analyst = _service("analyst")
    cost_guardrail = getattr(app.state, "analysis_cost_guardrail", None) or getattr(app.state, "label_cost_guardrail", None)
    estimated_cost = _env_float("FOOD_ESTIMATED_COST_USD_PER_REQUEST", 0.006)
    estimated_tokens = _env_int("FOOD_ESTIMATED_TOKENS_PER_REQUEST", 2500)
    cost_reservation: Any = None

    if _is_analysis_cost_guardrail_enabled() and cost_guardrail:
        decision = _reserve_label_cost(
            cost_guardrail,
            reservation_key=f"{request_id}:food-analysis",
            estimated_cost_usd=estimated_cost,
            estimated_tokens=estimated_tokens,
        )
        cost_reservation = decision
        decision_action = _label_cost_action(decision)
        logger.info(
            "[Server] Food cost guardrail request_id=%s action=%s ratio=%.3f projected_total_cost_usd=%.4f",
            request_id,
            decision_action,
            _label_cost_ratio(decision),
            _label_cost_projected_total(decision),
        )
        if decision_action == CostGuardrailAction.FALLBACK:
            total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
            fallback = get_safe_fallback_response(
                "이번 달 AI 분석 예산 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
            )
            fallback["request_id"] = request_id
            fallback["prompt_version"] = ANALYSIS_PROMPT_VERSION
            fallback["used_model"] = getattr(analyst, "model_name", None)
            fallback["analysis_diagnostics"] = {
                "origin": "food_photo",
                "fallback_used": True,
                "fallback_reason": "budget_fallback",
                "finish_reason": None,
                "truncated": False,
                "usage_source": "not_chargeable",
            }
            fallback["latency_ms"] = _build_latency_ms_payload(
                total_ms=total_elapsed_ms,
                preprocess_ms=preprocess_elapsed_ms,
                extract_ms=None,
                assess_ms=None,
                source_lookup_ms=None,
                allergen_analysis_ms=None,
            )
            _reconcile_label_cost(
                cost_guardrail,
                reservation=cost_reservation,
                chargeable=False,
                cost_usd=0.0,
                tokens=0,
                provider_total_tokens=None,
                provider_thought_tokens=None,
                fallback_used=True,
                truncated=False,
            )
            return fallback

    try:
        result = await run_in_threadpool(
            analyst.analyze_food_job_json if job_mode else analyst.analyze_food_json,
            image,
            allergy_info,
            prompt_country_code,
        )
    except Exception:
        if _is_analysis_cost_guardrail_enabled() and cost_guardrail:
            _reconcile_label_cost(
                cost_guardrail,
                reservation=cost_reservation,
                chargeable=False,
                cost_usd=0.0,
                tokens=0,
                provider_total_tokens=None,
                provider_thought_tokens=None,
                fallback_used=False,
                truncated=False,
            )
        raise

    if not isinstance(result, dict):
        if _is_analysis_cost_guardrail_enabled() and cost_guardrail:
            _reconcile_label_cost(
                cost_guardrail,
                reservation=cost_reservation,
                chargeable=False,
                cost_usd=0.0,
                tokens=0,
                provider_total_tokens=None,
                provider_thought_tokens=None,
                fallback_used=False,
                truncated=False,
            )
        return result

    food_chargeable = bool(result.pop("_food_chargeable", True))
    food_observability = _extract_food_observability(result)
    _strip_internal_analysis_metadata(result)
    total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
    result["request_id"] = request_id
    result["latency_ms"] = _build_latency_ms_payload(
        total_ms=total_elapsed_ms,
        preprocess_ms=preprocess_elapsed_ms,
        extract_ms=None,
        assess_ms=None,
        source_lookup_ms=None,
        allergen_analysis_ms=None,
    )
    food_usage_total_tokens = food_observability["usage_total_tokens"]
    food_usage_prompt_tokens = food_observability["usage_prompt_tokens"]
    food_usage_candidate_tokens = food_observability["usage_candidate_tokens"]
    food_usage_thought_tokens = food_observability["usage_thought_tokens"]
    recorded_tokens = food_usage_total_tokens if isinstance(food_usage_total_tokens, int) else estimated_tokens
    usage_source = "provider_usage_metadata" if isinstance(food_usage_total_tokens, int) else "estimated"
    result["analysis_diagnostics"] = _build_public_analysis_diagnostics(food_observability, usage_source)
    logger.info(
        "[Server] Food observability summary request_id=%s used_model=%s fallback_used=%s fallback_reason=%s finish_reason=%s truncated=%s usage_source=%s usage_prompt_tokens=%s usage_candidate_tokens=%s usage_total_tokens=%s usage_thought_tokens=%s",
        request_id,
        food_observability["used_model"],
        food_observability["fallback_used"],
        food_observability["fallback_reason"],
        food_observability["finish_reason"],
        food_observability["truncated"],
        usage_source,
        food_usage_prompt_tokens,
        food_usage_candidate_tokens,
        food_usage_total_tokens,
        food_usage_thought_tokens,
    )
    if _is_analysis_cost_guardrail_enabled() and cost_guardrail and food_chargeable:
        _reconcile_label_cost(
            cost_guardrail,
            reservation=cost_reservation,
            chargeable=True,
            cost_usd=estimated_cost,
            tokens=recorded_tokens,
            provider_total_tokens=food_usage_total_tokens,
            provider_thought_tokens=food_usage_thought_tokens,
            fallback_used=bool(food_observability["fallback_used"]),
            truncated=bool(food_observability["truncated"]),
        )
    elif _is_analysis_cost_guardrail_enabled() and cost_guardrail:
        _reconcile_label_cost(
            cost_guardrail,
            reservation=cost_reservation,
            chargeable=False,
            cost_usd=0.0,
            tokens=0,
            provider_total_tokens=food_usage_total_tokens,
            provider_thought_tokens=food_usage_thought_tokens,
            fallback_used=bool(food_observability["fallback_used"]),
            truncated=bool(food_observability["truncated"]),
        )
    return result


async def _analyze_food_job_image_with_policy(
    image: Image.Image,
    allergy_info: str,
    prompt_country_code: str,
    request_id: str,
    total_started_at: float,
    preprocess_elapsed_ms: int,
) -> dict[str, Any]:
    return await _analyze_food_image_with_policy(
        image,
        allergy_info,
        prompt_country_code,
        request_id,
        total_started_at,
        preprocess_elapsed_ms,
        job_mode=True,
    )


async def _analyze_label_image_with_policy(
    image: Image.Image,
    allergy_info: str,
    prompt_country_code: str,
    locale: str | None,
    request_id: str,
    total_started_at: float,
    preprocess_elapsed_ms: int,
    *,
    raise_on_quota_429: bool = False,
) -> dict[str, Any]:
    analyst = _service("analyst")
    cost_guardrail = getattr(app.state, "label_cost_guardrail", None)
    rollout_controller = getattr(app.state, "label_rollout_controller", None)
    rollout_auto_manager = getattr(app.state, "label_rollout_auto_manager", None)
    kpi_thresholds = getattr(app.state, "label_rollout_kpi_thresholds", None) or KpiThresholds()

    quality = await run_in_threadpool(evaluate_label_image_quality, image)
    logger.info(
        "[Server] Label quality gate request_id=%s passed=%s failed_checks=%s metrics={blur:%.2f,contrast:%.2f,text_density:%.4f,glare:%.4f}",
        request_id,
        quality.passed,
        quality.failed_checks,
        quality.metrics.blur_score,
        quality.metrics.contrast_score,
        quality.metrics.text_density_score,
        quality.metrics.glare_ratio,
    )

    if not quality.passed:
        total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
        fallback = get_safe_fallback_response(
            "라벨 사진 품질이 낮아 분석할 수 없습니다. 초점을 맞추고 반사를 줄여 다시 촬영해주세요."
        )
        fallback["request_id"] = request_id
        fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
        fallback["used_model"] = analyst.label_model_name
        fallback["_label_fallback_reason"] = "quality_rejected"
        fallback["latency_ms"] = _build_latency_ms_payload(
            total_ms=total_elapsed_ms,
            preprocess_ms=preprocess_elapsed_ms,
            extract_ms=0,
            assess_ms=0,
            source_lookup_ms=None,
            allergen_analysis_ms=None,
        )
        logger.info(
            "[Server] Label analysis quality-rejected request_id=%s prompt_version=%s used_model=%s elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
            request_id,
            fallback.get("prompt_version"),
            fallback.get("used_model"),
            preprocess_elapsed_ms,
            0,
            0,
            total_elapsed_ms,
        )
        return fallback

    kpi_input = load_kpi_input_from_env()
    kpi_gate_passed = evaluate_kpi_gate(kpi_input, kpi_thresholds)
    if rollout_controller and rollout_auto_manager:
        auto_config = rollout_auto_manager.reconcile(rollout_controller.config, kpi_gate_passed=kpi_gate_passed)
        rollout_controller = LabelRolloutController(auto_config)
        app.state.label_rollout_controller = rollout_controller
    rollout_decision = (
        rollout_controller.decide(request_id, kpi_gate_passed=kpi_gate_passed)
        if rollout_controller
        else None
    )
    assess_enabled = rollout_decision.route_to_new if rollout_decision else True
    if rollout_decision:
        logger.info(
            "[Server] Label rollout decision request_id=%s stage=%s percentage=%d bucket=%d kpi_gate_passed=%s route_to_new=%s",
            request_id,
            rollout_decision.stage,
            rollout_decision.percentage,
            rollout_decision.bucket,
            rollout_decision.kpi_gate_passed,
            rollout_decision.route_to_new,
        )

    primary_estimated_cost = _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST", 0.02)
    estimated_cost = primary_estimated_cost
    estimated_tokens = _env_int("LABEL_ESTIMATED_TOKENS_PER_REQUEST", 1500)
    cost_reservation: Any = None
    if _is_label_cost_guardrail_enabled() and cost_guardrail:
        reservation_estimated_cost = _label_reservation_estimated_cost(analyst, primary_estimated_cost)
        decision = _reserve_label_cost(
            cost_guardrail,
            reservation_key=f"{request_id}:label-analysis",
            estimated_cost_usd=reservation_estimated_cost,
            estimated_tokens=estimated_tokens,
        )
        cost_reservation = decision
        decision_action = _label_cost_action(decision)
        logger.info(
            "[Server] Label cost guardrail request_id=%s action=%s ratio=%.3f projected_total_cost_usd=%.4f",
            request_id,
            decision_action,
            _label_cost_ratio(decision),
            _label_cost_projected_total(decision),
        )
        if decision_action == CostGuardrailAction.WARN:
            logger.warning(
                "[Server] Label cost guardrail warn request_id=%s ratio=%.3f threshold=0.70",
                request_id,
                _label_cost_ratio(decision),
            )
        elif decision_action == CostGuardrailAction.DEGRADE:
            assess_enabled = False
            estimated_cost = _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE", 0.012)
            estimated_tokens = _env_int("LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE", 900)
        elif decision_action == CostGuardrailAction.FALLBACK:
            total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
            fallback = get_safe_fallback_response(
                "이번 달 라벨 분석 예산 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
            )
            fallback["request_id"] = request_id
            fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            fallback["used_model"] = analyst.label_model_name
            fallback["_label_fallback_reason"] = "budget_fallback"
            fallback["latency_ms"] = _build_latency_ms_payload(
                total_ms=total_elapsed_ms,
                preprocess_ms=preprocess_elapsed_ms,
                extract_ms=0,
                assess_ms=0,
                source_lookup_ms=None,
                allergen_analysis_ms=None,
            )
            logger.warning(
                "[Server] Label analysis budget-fallback request_id=%s prompt_version=%s used_model=%s elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
                request_id,
                fallback.get("prompt_version"),
                fallback.get("used_model"),
                preprocess_elapsed_ms,
                0,
                0,
                total_elapsed_ms,
            )
            _reconcile_label_cost(
                cost_guardrail,
                reservation=cost_reservation,
                chargeable=False,
                cost_usd=0.0,
                tokens=0,
                provider_total_tokens=None,
                provider_thought_tokens=None,
                fallback_used=True,
                truncated=False,
            )
            return fallback

    try:
        result = await run_in_threadpool(
            analyst.analyze_label_json,
            image,
            allergy_info,
            prompt_country_code,
            locale,
            assess_enabled,
        )
    except Exception:
        if _is_label_cost_guardrail_enabled() and cost_guardrail:
            try:
                _reconcile_label_cost(
                    cost_guardrail,
                    reservation=cost_reservation,
                    chargeable=False,
                    cost_usd=0.0,
                    tokens=0,
                    provider_total_tokens=None,
                    provider_thought_tokens=None,
                    fallback_used=False,
                    truncated=False,
                )
            except Exception:
                logger.exception(
                    "[Server] Label cost reservation release failed",
                    extra={"request_id": request_id},
                )
        raise
    label_error_type = result.pop("_label_error_type", None) if isinstance(result, dict) else None
    label_chargeable = bool(result.pop("_label_chargeable", True)) if isinstance(result, dict) else True
    label_timings = result.pop("_label_timings", {}) if isinstance(result, dict) else {}
    if isinstance(result, dict) and label_error_type == "quota_exhausted_429":
        result["_label_fallback_reason"] = label_error_type
    label_observability = _extract_label_observability(result) if isinstance(result, dict) else _extract_label_observability({})
    if isinstance(result, dict):
        for key in list(result.keys()):
            if key.startswith("_label_"):
                result.pop(key, None)
    extract_elapsed_ms = int(label_timings.get("extract_ms", 0))
    assess_elapsed_ms = int(label_timings.get("assess_ms", 0))
    total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
    result["request_id"] = request_id
    result["latency_ms"] = _build_latency_ms_payload(
        total_ms=total_elapsed_ms,
        preprocess_ms=preprocess_elapsed_ms,
        extract_ms=extract_elapsed_ms,
        assess_ms=assess_elapsed_ms,
        source_lookup_ms=None,
        allergen_analysis_ms=None,
    )
    label_usage_total_tokens = label_observability["usage_total_tokens"]
    label_usage_thought_tokens = label_observability["usage_thought_tokens"]
    label_recorded_tokens = label_usage_total_tokens if isinstance(label_usage_total_tokens, int) else estimated_tokens
    label_usage_source = "provider_usage_metadata" if isinstance(label_usage_total_tokens, int) else "estimated"
    if bool(label_observability["fallback_used"]) and _is_pro_model_tier(label_observability["used_model"]):
        estimated_cost = _label_actual_estimated_cost(primary_estimated_cost, label_observability["used_model"])
    result["label_diagnostics"] = _build_public_label_diagnostics(
        label_observability,
        label_error_type,
        label_usage_source,
    )
    logger.info(
        "[Server] Label observability",
        extra={
            "request_id": request_id,
            "prompt_version": result.get("prompt_version"),
            "used_model": result.get("used_model"),
            "label_primary_model": label_observability["primary_model"],
            "label_used_model": label_observability["used_model"],
            "label_fallback_used": label_observability["fallback_used"],
            "label_fallback_reason": label_observability["fallback_reason"],
            "label_diagnostic_reason": label_observability["diagnostic_reason"],
            "label_extract_finish_reason": label_observability["extract_finish_reason"],
            "label_assess_finish_reason": label_observability["assess_finish_reason"],
            "label_assess_skipped": label_observability["assess_skipped"],
            "label_assess_skip_reason": label_observability["assess_skip_reason"],
            "label_parse_status": label_observability["parse_status"],
            "label_parse_repaired": label_observability["parse_repaired"],
            "label_repair_strategy": label_observability["repair_strategy"],
            "label_partial": label_observability["partial"],
            "label_truncated": label_observability["truncated"],
            "label_usage_source": label_usage_source,
            "label_usage_prompt_tokens": label_observability["usage_prompt_tokens"],
            "label_usage_candidate_tokens": label_observability["usage_candidate_tokens"],
            "label_usage_thought_tokens": label_usage_thought_tokens,
            "label_usage_total_tokens": label_usage_total_tokens,
            "label_chargeable": label_chargeable,
        },
    )
    logger.info(
        "[Server] Label observability summary request_id=%s used_model=%s fallback_used=%s fallback_reason=%s diagnostic_reason=%s error_type=%s extract_finish_reason=%s assess_finish_reason=%s assess_skipped=%s assess_skip_reason=%s parse_status=%s parse_repaired=%s repair_strategy=%s partial=%s truncated=%s usage_source=%s usage_prompt_tokens=%s usage_candidate_tokens=%s usage_total_tokens=%s usage_thought_tokens=%s",
        request_id,
        label_observability["used_model"],
        label_observability["fallback_used"],
        label_observability["fallback_reason"],
        label_observability["diagnostic_reason"],
        label_error_type,
        label_observability["extract_finish_reason"],
        label_observability["assess_finish_reason"],
        label_observability["assess_skipped"],
        label_observability["assess_skip_reason"],
        label_observability["parse_status"],
        label_observability["parse_repaired"],
        label_observability["repair_strategy"],
        label_observability["partial"],
        label_observability["truncated"],
        label_usage_source,
        label_observability["usage_prompt_tokens"],
        label_observability["usage_candidate_tokens"],
        label_usage_total_tokens,
        label_usage_thought_tokens,
    )

    if label_error_type == "quota_exhausted_429":
        retry_after_seconds = _env_int("UPSTREAM_429_RETRY_AFTER_SECONDS", 15)
        logger.warning(
            "[Server] Label analysis quota-429 request_id=%s returning=429 retry_after_seconds=%d elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
            request_id,
            retry_after_seconds,
            preprocess_elapsed_ms,
            extract_elapsed_ms,
            assess_elapsed_ms,
            total_elapsed_ms,
        )
        if raise_on_quota_429:
            if _is_label_cost_guardrail_enabled() and cost_guardrail:
                _reconcile_label_cost(
                    cost_guardrail,
                    reservation=cost_reservation,
                    chargeable=False,
                    cost_usd=0.0,
                    tokens=0,
                    provider_total_tokens=label_usage_total_tokens,
                    provider_thought_tokens=label_usage_thought_tokens,
                    fallback_used=bool(label_observability["fallback_used"]),
                    truncated=bool(label_observability["truncated"]),
                )
            raise _build_scoped_rate_limit_http_exception(
                request_id=request_id,
                retry_after_seconds=retry_after_seconds,
                code="UPSTREAM_RATE_LIMITED",
                message="Label analysis is temporarily rate-limited. Please retry shortly.",
                retry_scope="provider:label",
                retryable_by_client=False,
            )

    logger.info(
        "[Server] Label analysis completed request_id=%s prompt_version=%s used_model=%s elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
        request_id,
        result.get("prompt_version"),
        result.get("used_model"),
        preprocess_elapsed_ms,
        extract_elapsed_ms,
        assess_elapsed_ms,
        total_elapsed_ms,
    )
    if _is_label_cost_guardrail_enabled() and cost_guardrail and label_chargeable:
        usage = _reconcile_label_cost(
            cost_guardrail,
            reservation=cost_reservation,
            chargeable=True,
            cost_usd=estimated_cost,
            tokens=label_recorded_tokens,
            provider_total_tokens=label_usage_total_tokens,
            provider_thought_tokens=label_usage_thought_tokens,
            fallback_used=bool(label_observability["fallback_used"]),
            truncated=bool(label_observability["truncated"]),
        )
        if usage is not None and hasattr(usage, "period_key"):
            logger.info(
                "[Server] Label cost usage updated",
                extra={
                    "request_id": request_id,
                    "month": usage.period_key,
                    "request_cost_usd": estimated_cost,
                    "request_tokens": label_recorded_tokens,
                    "request_tokens_source": label_usage_source,
                    "total_cost_usd": usage.total_cost_usd,
                    "total_tokens": usage.total_tokens,
                    "request_count": usage.request_count,
                    "provider_reported_tokens": usage.provider_reported_tokens,
                    "provider_reported_thought_tokens": usage.provider_reported_thought_tokens,
                    "fallback_count": usage.fallback_count,
                    "truncated_count": usage.truncated_count,
                },
            )
    elif _is_label_cost_guardrail_enabled() and cost_guardrail:
        _reconcile_label_cost(
            cost_guardrail,
            reservation=cost_reservation,
            chargeable=False,
            cost_usd=0.0,
            tokens=0,
            provider_total_tokens=label_usage_total_tokens,
            provider_thought_tokens=label_usage_thought_tokens,
            fallback_used=bool(label_observability["fallback_used"]),
            truncated=bool(label_observability["truncated"]),
        )
        logger.info(
            "[Server] Label cost usage skipped request_id=%s reason=non_chargeable_result",
            request_id,
        )
    return result


async def _analyze_label_image_with_policy_for_http(
    image: Image.Image,
    allergy_info: str,
    prompt_country_code: str,
    locale: str | None,
    request_id: str,
    total_started_at: float,
    preprocess_elapsed_ms: int,
) -> dict[str, Any]:
    return await _analyze_label_image_with_policy(
        image,
        allergy_info,
        prompt_country_code,
        locale,
        request_id,
        total_started_at,
        preprocess_elapsed_ms,
        raise_on_quota_429=True,
    )


@app.post("/analyze/label", response_model=AnalysisResponseContract)
async def analyze_label(
    request: Request,
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    """
    Perform OCR nutrition analysis on a label image.
    """
    request_id = _request_id(request)
    _apply_analysis_rate_limit(request=request, endpoint="/analyze/label", request_id=request_id)
    slot_acquired = _try_acquire_analysis_slot(endpoint="/analyze/label", request_id=request_id)
    total_started_at = time.perf_counter()

    async def _operation():
        logger.info(
            "[Server] Label analysis request received request_id=%s locale=%s",
            request_id,
            locale,
        )
        preprocess_started_at = time.perf_counter()
        contents = await file.read()
        image = await run_in_threadpool(decode_upload_to_image, contents)
        preprocess_elapsed_ms = int((time.perf_counter() - preprocess_started_at) * 1000)
        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
        return await _analyze_label_image_with_policy(
            image,
            allergy_info,
            prompt_country_code,
            locale,
            request_id,
            total_started_at,
            preprocess_elapsed_ms,
            raise_on_quota_429=True,
        )

    try:
        return await run_with_error_policy(
            endpoint="/analyze/label",
            policy=EndpointErrorPolicy(
                code=ErrorCode.ANALYZE_LABEL_FAILED,
                status_code=500,
                user_message="Label analysis failed",
            ),
            operation=_operation,
            request_id=request_id,
        )
    finally:
        if slot_acquired:
            _release_analysis_slot(endpoint="/analyze/label")

@app.post("/analyze/smart", response_model=AnalysisResponseContract)
async def analyze_smart(
    request: Request,
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    """
    Smart routing endpoint for Gallery uploads.
    Classifies image (Food vs Label) and routes to specific analysis.
    """
    request_id = _request_id(request)
    _apply_analysis_rate_limit(request=request, endpoint="/analyze/smart", request_id=request_id)
    slot_acquired = _try_acquire_analysis_slot(endpoint="/analyze/smart", request_id=request_id)
    started_at = time.perf_counter()

    try:
        async def _operation():
            smart_router = _service("smart_router")
            logger.info("[Server] Smart analysis request received request_id=%s.", request_id)
            preprocess_started_at = time.perf_counter()
            contents = await file.read()
            image = await run_in_threadpool(decode_upload_to_image, contents)
            preprocess_elapsed_ms = int((time.perf_counter() - preprocess_started_at) * 1000)

            prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
            analyst = _service("analyst")
            smart_cost_guardrail = getattr(app.state, "analysis_cost_guardrail", None) or getattr(app.state, "label_cost_guardrail", None)
            smart_router_estimated_cost = _env_float("SMART_ROUTER_ESTIMATED_COST_USD_PER_REQUEST", 0.001)
            smart_router_estimated_tokens = _env_int("SMART_ROUTER_ESTIMATED_TOKENS_PER_REQUEST", 300)
            smart_reservation_estimated_cost = smart_router_estimated_cost + _smart_downstream_reservation_estimated_cost(analyst)
            smart_reservation_estimated_tokens = smart_router_estimated_tokens + _smart_downstream_reservation_estimated_tokens()
            smart_reservation: Any = None
            smart_router_settled = False

            def _settle_smart_router_reservation() -> None:
                nonlocal smart_router_settled
                if smart_router_settled:
                    return
                smart_router_settled = True
                if not (_is_analysis_cost_guardrail_enabled() and smart_cost_guardrail and smart_reservation):
                    return
                _reconcile_label_cost(
                    smart_cost_guardrail,
                    reservation=smart_reservation,
                    chargeable=True,
                    cost_usd=smart_router_estimated_cost,
                    tokens=smart_router_estimated_tokens,
                    provider_total_tokens=None,
                    provider_thought_tokens=None,
                    fallback_used=False,
                    truncated=False,
                )

            async def _run_label_after_smart_router(
                label_image: Image.Image,
                label_allergy_info: str,
                label_prompt_country_code: str,
                label_locale: str | None,
                label_request_id: str,
                label_total_started_at: float,
                label_preprocess_elapsed_ms: int,
            ) -> dict[str, Any]:
                _settle_smart_router_reservation()
                return await _analyze_label_image_with_policy_for_http(
                    label_image,
                    label_allergy_info,
                    label_prompt_country_code,
                    label_locale,
                    label_request_id,
                    label_total_started_at,
                    label_preprocess_elapsed_ms,
                )

            async def _run_food_after_smart_router(
                food_image: Image.Image,
                food_allergy_info: str,
                food_prompt_country_code: str,
                food_request_id: str,
                food_total_started_at: float,
                food_preprocess_elapsed_ms: int,
            ) -> dict[str, Any]:
                _settle_smart_router_reservation()
                return await _analyze_food_image_with_policy(
                    food_image,
                    food_allergy_info,
                    food_prompt_country_code,
                    food_request_id,
                    food_total_started_at,
                    food_preprocess_elapsed_ms,
                )

            if _is_analysis_cost_guardrail_enabled() and smart_cost_guardrail:
                smart_decision = _reserve_label_cost(
                    smart_cost_guardrail,
                    reservation_key=f"{request_id}:smart-router",
                    estimated_cost_usd=smart_reservation_estimated_cost,
                    estimated_tokens=smart_reservation_estimated_tokens,
                )
                smart_reservation = smart_decision
                smart_decision_action = _label_cost_action(smart_decision)
                logger.info(
                    "[Server] Smart router cost guardrail request_id=%s action=%s ratio=%.3f projected_total_cost_usd=%.4f reservation_estimated_cost_usd=%.4f",
                    request_id,
                    smart_decision_action,
                    _label_cost_ratio(smart_decision),
                    _label_cost_projected_total(smart_decision),
                    smart_reservation_estimated_cost,
                )
                if smart_decision_action == CostGuardrailAction.FALLBACK:
                    fallback = get_safe_fallback_response(
                        "이번 달 AI 분석 예산 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
                    )
                    fallback["request_id"] = request_id
                    fallback["prompt_version"] = ANALYSIS_PROMPT_VERSION
                    fallback["used_model"] = "gemini-2.0-flash"
                    fallback["analysis_diagnostics"] = {
                        "origin": "smart_route",
                        "fallback_used": True,
                        "fallback_reason": "budget_fallback",
                        "finish_reason": None,
                        "truncated": False,
                        "usage_source": "not_chargeable",
                    }
                    _reconcile_label_cost(
                        smart_cost_guardrail,
                        reservation=smart_reservation,
                        chargeable=False,
                        cost_usd=0.0,
                        tokens=0,
                        provider_total_tokens=None,
                        provider_thought_tokens=None,
                        fallback_used=True,
                        truncated=False,
                    )
                    return fallback
            try:
                result = await smart_router.route_analysis(
                    image=image,
                    allergy_info=allergy_info,
                    iso_country_code=prompt_country_code,
                    locale=locale,
                    request_id=request_id,
                    total_started_at=started_at,
                    preprocess_elapsed_ms=preprocess_elapsed_ms,
                    label_analysis_runner=_run_label_after_smart_router,
                    food_analysis_runner=_run_food_after_smart_router,
                )
                if isinstance(result, dict):
                    result = _build_smart_analysis_diagnostics_result(result)
            finally:
                _settle_smart_router_reservation()
            return result

        result = await run_with_error_policy(
            endpoint="/analyze/smart",
            policy=EndpointErrorPolicy(
                code=ErrorCode.ANALYZE_SMART_FAILED,
                status_code=500,
                user_message="Smart analysis failed",
            ),
            operation=_operation,
            request_id=request_id,
        )
        if isinstance(result, dict):
            result["request_id"] = request_id
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        if isinstance(result, dict) and "latency_ms" not in result:
            result["latency_ms"] = _build_latency_ms_payload(
                total_ms=elapsed_ms,
                preprocess_ms=None,
                extract_ms=None,
                assess_ms=None,
                source_lookup_ms=None,
                allergen_analysis_ms=None,
            )
        logger.info(
            "[Server] Smart analysis completed request_id=%s prompt_version=%s used_model=%s elapsed_ms=%d",
            request_id,
            result.get("prompt_version") if isinstance(result, dict) else None,
            result.get("used_model") if isinstance(result, dict) else None,
            elapsed_ms,
        )
        return result
    finally:
        if slot_acquired:
            _release_analysis_slot(endpoint="/analyze/smart")

@app.post("/lookup/barcode", response_model=BarcodeLookupResponseContract)
async def lookup_barcode(
    request: Request,
    barcode: str = Form(...),
    allergy_info: str = Form("None"),
    locale: str | None = Form(None),
):
    """
    Lookup product by barcode.
    Full SoC Implementation: Controller -> Service -> Infrastructure (DataGo/OFF)
    If ingredients are found and user has allergies, run Gemini allergen analysis.
    """
    request_id = _request_id(request)
    parent_request_id = _parent_request_id(request)
    _apply_analysis_rate_limit(request=request, endpoint="/lookup/barcode", request_id=request_id)
    slot_acquired = _try_acquire_analysis_slot(endpoint="/lookup/barcode", request_id=request_id)
    started_at = time.perf_counter()
    try:
        try:
            barcode_service = _service("barcode_service")
            source_lookup_elapsed_ms = 0
            allergen_analysis_elapsed_ms: int | None = None
            allergy_profile_present = bool(allergy_info and allergy_info.strip().lower() != "none")
            logger.info(
                "[Server] Lookup request request_id=%s parent_request_id=%s barcode=%s allergy_profile_present=%s locale=%s",
                request_id,
                parent_request_id or "none",
                barcode,
                allergy_profile_present,
                locale,
            )
            lookup_started_at = time.perf_counter()
            result = await barcode_service.get_product_info(barcode)
            source_lookup_elapsed_ms = int((time.perf_counter() - lookup_started_at) * 1000)
            logger.info(
                "[Server] Barcode source lookup done request_id=%s elapsed_ms=%d found=%s",
                request_id,
                source_lookup_elapsed_ms,
                bool(result),
            )

            if not result:
                elapsed_ms = int((time.perf_counter() - started_at) * 1000)
                upstream_failure_getter = getattr(barcode_service, "get_last_upstream_failure", None)
                upstream_failure = (
                    upstream_failure_getter()
                    if callable(upstream_failure_getter)
                    else None
                )
                if isinstance(upstream_failure, dict) and upstream_failure.get("kind") == "http_429":
                    retry_after_seconds = _env_int("UPSTREAM_429_RETRY_AFTER_SECONDS", 15)
                    logger.warning(
                        "[Server] Barcode lookup upstream-429 request_id=%s source=%s retry_after_seconds=%d elapsed_ms={source_lookup:%d,total:%d}",
                        request_id,
                        upstream_failure.get("source"),
                        retry_after_seconds,
                        source_lookup_elapsed_ms,
                        elapsed_ms,
                    )
                    raise _build_scoped_rate_limit_http_exception(
                        request_id=request_id,
                        retry_after_seconds=retry_after_seconds,
                        code="UPSTREAM_RATE_LIMITED",
                        message="Barcode upstream is rate limited. Please retry shortly.",
                        retry_scope="provider:barcode",
                        retryable_by_client=False,
                    )
                logger.info(
                    "[Server] Lookup complete request_id=%s elapsed_ms=%d found=false",
                    request_id,
                    elapsed_ms,
                )
                return {
                    "found": False,
                    "message": "Product not found in any database",
                    "request_id": request_id,
                    "latency_ms": _build_latency_ms_payload(
                        total_ms=elapsed_ms,
                        preprocess_ms=None,
                        extract_ms=None,
                        assess_ms=None,
                        source_lookup_ms=source_lookup_elapsed_ms,
                        allergen_analysis_ms=None,
                    ),
                }

            used_model = None
            prompt_version = None
            if result.get("ingredients") and allergy_profile_present:
                logger.info(
                    "[Server] Running allergen analysis request_id=%s ingredient_count=%d",
                    request_id,
                    len(result["ingredients"]),
                )
                analyst = _service("analyst")
                original_ingredients = result["ingredients"]
                allergen_result: dict[str, Any]
                barcode_observability: dict[str, Any]
                barcode_cost_guardrail = getattr(app.state, "analysis_cost_guardrail", None) or getattr(app.state, "label_cost_guardrail", None)
                barcode_estimated_cost = _env_float("BARCODE_ALLERGEN_ESTIMATED_COST_USD_PER_REQUEST", 0.001)
                barcode_estimated_tokens = _env_int("BARCODE_ALLERGEN_ESTIMATED_TOKENS_PER_REQUEST", 500)
                barcode_reservation: Any = None
                barcode_chargeable = False
                if _is_analysis_cost_guardrail_enabled() and barcode_cost_guardrail:
                    barcode_reservation = _reserve_label_cost(
                        barcode_cost_guardrail,
                        reservation_key=f"{request_id}:barcode-allergen-analysis",
                        estimated_cost_usd=barcode_estimated_cost,
                        estimated_tokens=barcode_estimated_tokens,
                    )
                    barcode_decision_action = _label_cost_action(barcode_reservation)
                    logger.info(
                        "[Server] Barcode allergen cost guardrail request_id=%s action=%s ratio=%.3f projected_total_cost_usd=%.4f",
                        request_id,
                        barcode_decision_action,
                        _label_cost_ratio(barcode_reservation),
                        _label_cost_projected_total(barcode_reservation),
                    )
                    if barcode_decision_action == CostGuardrailAction.FALLBACK:
                        allergen_result = _barcode_allergen_budget_fallback(list(original_ingredients), locale)
                        barcode_observability = _extract_barcode_observability(allergen_result)
                        allergen_analysis_elapsed_ms = 0
                        _reconcile_label_cost(
                            barcode_cost_guardrail,
                            reservation=barcode_reservation,
                            chargeable=False,
                            cost_usd=0.0,
                            tokens=0,
                            provider_total_tokens=None,
                            provider_thought_tokens=None,
                            fallback_used=True,
                            truncated=False,
                        )
                    else:
                        analysis_started_at = time.perf_counter()
                        try:
                            allergen_result = await run_in_threadpool(
                                analyst.analyze_barcode_ingredients,
                                original_ingredients,
                                allergy_info,
                                locale,
                            )
                        except Exception:
                            _reconcile_label_cost(
                                barcode_cost_guardrail,
                                reservation=barcode_reservation,
                                chargeable=False,
                                cost_usd=0.0,
                                tokens=0,
                                provider_total_tokens=None,
                                provider_thought_tokens=None,
                                fallback_used=False,
                                truncated=False,
                            )
                            raise
                        finally:
                            allergen_analysis_elapsed_ms = int((time.perf_counter() - analysis_started_at) * 1000)
                        barcode_observability = _extract_barcode_observability(allergen_result)
                        barcode_chargeable = bool(barcode_observability["chargeable"])
                        barcode_usage_total_tokens = barcode_observability["usage_total_tokens"]
                        barcode_usage_thought_tokens = barcode_observability["usage_thought_tokens"]
                        barcode_recorded_tokens = (
                            barcode_usage_total_tokens
                            if isinstance(barcode_usage_total_tokens, int)
                            else barcode_estimated_tokens
                        )
                        _reconcile_label_cost(
                            barcode_cost_guardrail,
                            reservation=barcode_reservation,
                            chargeable=barcode_chargeable,
                            cost_usd=barcode_estimated_cost if barcode_chargeable else 0.0,
                            tokens=barcode_recorded_tokens if barcode_chargeable else 0,
                            provider_total_tokens=barcode_usage_total_tokens,
                            provider_thought_tokens=barcode_usage_thought_tokens,
                            fallback_used=False,
                            truncated=bool(barcode_observability["truncated"]),
                        )
                else:
                    analysis_started_at = time.perf_counter()
                    allergen_result = await run_in_threadpool(
                        analyst.analyze_barcode_ingredients,
                        original_ingredients,
                        allergy_info,
                        locale,
                    )
                    allergen_analysis_elapsed_ms = int((time.perf_counter() - analysis_started_at) * 1000)
                    barcode_observability = _extract_barcode_observability(allergen_result)
                used_model = allergen_result.get("used_model")
                prompt_version = allergen_result.get("prompt_version")
                if barcode_observability["chargeable"] is False:
                    barcode_usage_source = "not_chargeable"
                elif isinstance(barcode_observability["usage_total_tokens"], int):
                    barcode_usage_source = "provider_usage_metadata"
                else:
                    barcode_usage_source = "estimated"
                logger.info(
                    "[Server] Allergen analysis done request_id=%s elapsed_ms=%d used_model=%s prompt_version=%s fallback_used=%s fallback_reason=%s error_type=%s finish_reason=%s truncated=%s usage_source=%s usage_prompt_tokens=%s usage_candidate_tokens=%s usage_total_tokens=%s usage_thought_tokens=%s",
                    request_id,
                    allergen_analysis_elapsed_ms,
                    used_model,
                    prompt_version,
                    barcode_observability["fallback_used"],
                    barcode_observability["fallback_reason"],
                    barcode_observability["error_type"],
                    barcode_observability["finish_reason"],
                    barcode_observability["truncated"],
                    barcode_usage_source,
                    barcode_observability["usage_prompt_tokens"],
                    barcode_observability["usage_candidate_tokens"],
                    barcode_observability["usage_total_tokens"],
                    barcode_observability["usage_thought_tokens"],
                )

                result["safetyStatus"] = allergen_result.get("safetyStatus", "SAFE")
                result["coachMessage"] = allergen_result.get("coachMessage", "")
                result["ingredients"] = _select_barcode_ingredients_after_allergen_analysis(
                    original_ingredients=list(original_ingredients),
                    analyzed_ingredients=allergen_result.get("ingredients"),
                )
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.info(
                "[Server] Lookup complete request_id=%s elapsed_ms=%d found=true used_model=%s prompt_version=%s",
                request_id,
                elapsed_ms,
                used_model,
                prompt_version,
            )
            return {
                "found": True,
                "data": result,
                "request_id": request_id,
                "used_model": used_model,
                "prompt_version": prompt_version,
                "latency_ms": _build_latency_ms_payload(
                    total_ms=elapsed_ms,
                    preprocess_ms=None,
                    extract_ms=None,
                    assess_ms=None,
                    source_lookup_ms=source_lookup_elapsed_ms,
                    allergen_analysis_ms=allergen_analysis_elapsed_ms,
                ),
            }

        except HTTPException:
            raise
        except Exception as e:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            logger.exception(
                "[Server] Barcode Lookup Error request_id=%s code=%s elapsed_ms=%d error=%s",
                request_id,
                ErrorCode.BARCODE_LOOKUP_FAILED,
                elapsed_ms,
                e,
            )
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "Barcode lookup failed",
                    "code": ErrorCode.BARCODE_LOOKUP_FAILED,
                    "request_id": request_id,
                },
            ) from e
    finally:
        if slot_acquired:
            _release_analysis_slot(endpoint="/lookup/barcode")

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
