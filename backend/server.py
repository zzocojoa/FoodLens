from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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
from typing import Any, Awaitable, Callable, Literal
import requests
from pydantic import BaseModel
from PIL import Image, ImageOps

from backend.modules.server_bootstrap import (
    decode_upload_to_image,
    initialize_services,
    load_environment,
    log_environment_debug,
)
from backend.modules.analyst_core.prompts import LABEL_2PASS_PROMPT_VERSION
from backend.modules.analyst_core.response_utils import get_safe_fallback_response
from backend.modules.ops.cost_guardrail import CostGuardrailAction
from backend.modules.ops.cost_guardrail import (
    CostGuardrailService,
    InMemoryMonthlyUsageStorage,
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
from backend.modules.analysis_jobs import (
    AnalysisJobWorker,
    build_analysis_job_store_from_env,
    build_nutrition_cache_store_from_env,
    create_analysis_job_payload,
    NutritionEnrichmentService,
    serialize_job_status_response,
    serialize_job_submit_response,
)
from backend.modules.auth.service import AuthServiceError, InMemoryAuthSessionService
from backend.modules.media.service import (
    MediaStorageError,
    build_media_storage_from_env,
)
from backend.modules.nutrition import lookup_nutrition

load_environment()
log_environment_debug()

app = FastAPI()
_cors_config = build_cors_config_from_env()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_config.allow_origins,
    allow_origin_regex=_cors_config.allow_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-Id", "X-Device-Id"],
    expose_headers=["Retry-After"],
)

logger = logging.getLogger("foodlens.api")
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")


def _is_openapi_export_mode() -> bool:
    return os.environ.get("OPENAPI_EXPORT_ONLY") == "1"


def _is_label_cost_guardrail_enabled() -> bool:
    return os.environ.get("LABEL_COST_GUARDRAIL_ENABLED", "0").strip() == "1"


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


def _is_label_rollout_auto_enabled() -> bool:
    return os.environ.get("LABEL_ROLLOUT_AUTO_ENABLED", "0").strip() == "1"


def _retention_cleanup_interval_seconds() -> float:
    return max(5.0, _env_float("RETENTION_CLEANUP_INTERVAL_SECONDS", 3600.0))


def _deletion_queue_interval_seconds() -> float:
    return max(1.0, _env_float("DELETION_QUEUE_INTERVAL_SECONDS", 30.0))


def _deletion_queue_max_batch() -> int:
    return max(1, _env_int("DELETION_QUEUE_MAX_BATCH", 20))


def _analysis_job_worker_count() -> int:
    return max(1, _env_int("ANALYSIS_JOB_WORKER_COUNT", 1))


def _analysis_job_lease_seconds() -> int:
    return max(15, _env_int("ANALYSIS_JOB_LEASE_SECONDS", 90))


def _analysis_job_poll_after_ms() -> int:
    return max(250, _env_int("ANALYSIS_JOB_POLL_AFTER_MS", 1000))


def _analysis_job_poll_interval_seconds() -> float:
    return max(0.1, _env_float("ANALYSIS_JOB_POLL_INTERVAL_SECONDS", 0.5))


def _analysis_job_max_upload_bytes() -> int:
    return max(128 * 1024, _env_int("ANALYSIS_JOB_MAX_UPLOAD_BYTES", 900_000))


def _analysis_job_allowed_content_types() -> set[str]:
    raw = _env_str("ANALYSIS_JOB_ALLOWED_CONTENT_TYPES", ",".join(sorted(MEDIA_ALLOWED_UPLOAD_CONTENT_TYPES)))
    return {part.strip().lower() for part in raw.split(",") if part.strip()}


def _initialize_phase5_runtime() -> None:
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
            retention_store=retention_store,
        )
    app.state.deletion_queue_consumer = DeletionQueueConsumer(deletion_storage, deletion_handler)
    app.state.retention_cleanup_task = asyncio.create_task(_retention_cleanup_loop())
    app.state.deletion_queue_task = asyncio.create_task(_deletion_queue_loop())


@app.on_event("startup")
async def _startup() -> None:
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
    app.state.media_render_sign_bucket_seconds = max(0, _env_int("MEDIA_RENDER_SIGN_BUCKET_SECONDS", 3600))
    app.state.media_render_cache_enabled = os.environ.get("MEDIA_RENDER_CACHE_ENABLED", "1").strip() == "1"
    app.state.media_render_cache_max_items = max(1, _env_int("MEDIA_RENDER_CACHE_MAX_ITEMS", 256))
    app.state.media_render_cache_ttl_seconds = max(1, _env_int("MEDIA_RENDER_CACHE_TTL_SECONDS", 300))
    app.state.media_render_cache = OrderedDict()
    app.state.media_render_cache_lock = asyncio.Lock()
    app.state.media_render_inflight_tasks = {}
    app.state.media_render_inflight_lock = asyncio.Lock()
    logger.info(
        "[Auth] state backend initialized backend=%s",
        getattr(app.state.auth_service, "state_backend", "memory"),
    )
    logger.info(
        "[Media] storage enabled=%s",
        getattr(app.state.media_storage, "enabled", False),
    )
    app.state.analysis_job_store = build_analysis_job_store_from_env(os.environ.get)
    app.state.analysis_nutrition_cache_store = build_nutrition_cache_store_from_env(os.environ.get)
    app.state.analysis_nutrition_service = NutritionEnrichmentService(
        cache_store=app.state.analysis_nutrition_cache_store,
        lookup_func=lookup_nutrition,
        budget_seconds=_env_float("ANALYSIS_NUTRITION_BUDGET_SECONDS", 3.0),
        max_parallelism=max(1, _env_int("ANALYSIS_NUTRITION_MAX_PARALLELISM", 4)),
    )
    app.state.analysis_job_workers = [
        AnalysisJobWorker(
            store=app.state.analysis_job_store,
            nutrition_service=app.state.analysis_nutrition_service,
            get_analyst=lambda: _service("analyst"),
            get_smart_router=lambda: _service("smart_router"),
            decode_image=decode_upload_to_image,
            resolve_prompt_country_code=resolve_prompt_country_code,
            lease_seconds=_analysis_job_lease_seconds(),
            poll_interval_seconds=_analysis_job_poll_interval_seconds(),
            worker_id=f"worker-{index + 1}",
        )
        for index in range(_analysis_job_worker_count())
    ]
    for worker in app.state.analysis_job_workers:
        worker.start()
    logger.info(
        "[AnalysisJob] workers initialized count=%d backend=%s",
        len(app.state.analysis_job_workers),
        type(app.state.analysis_job_store).__name__,
    )
    _initialize_phase5_runtime()

    if _is_openapi_export_mode():
        app.state.analyst = None
        app.state.barcode_service = None
        app.state.smart_router = None
        logger.info("[Startup] OPENAPI_EXPORT_ONLY=1, runtime service initialization skipped.")
        return

    analyst, barcode_service, smart_router = initialize_services()
    app.state.analyst = analyst
    app.state.barcode_service = barcode_service
    app.state.smart_router = smart_router
    app.state.label_cost_guardrail = CostGuardrailService(
        InMemoryMonthlyUsageStorage(),
        monthly_budget_usd=_env_float("LABEL_MONTHLY_BUDGET_USD", 10.0),
    )
    logger.info(
        "[LabelCostGuardrail] enabled=%s monthly_budget_usd=%.2f warn_ratio=%.2f degrade_ratio=%.2f fallback_ratio=%.2f",
        _is_label_cost_guardrail_enabled(),
        _env_float("LABEL_MONTHLY_BUDGET_USD", 10.0),
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


@app.on_event("shutdown")
async def _shutdown() -> None:
    for worker in list(getattr(app.state, "analysis_job_workers", [])):
        await worker.stop()
    for task_name in ("retention_cleanup_task", "deletion_queue_task"):
        task = getattr(app.state, task_name, None)
        if task is None:
            continue
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def _service(name: str) -> Any:
    service = getattr(app.state, name, None)
    if service is None:
        raise raise_service_unavailable(name)
    return service

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


async def _media_render_cache_get(variant_key: str, now_ts: int) -> tuple[bytes, str] | None:
    if not bool(getattr(app.state, "media_render_cache_enabled", False)):
        return None
    cache = getattr(app.state, "media_render_cache", None)
    lock = getattr(app.state, "media_render_cache_lock", None)
    if cache is None or lock is None:
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
    if not bool(getattr(app.state, "media_render_cache_enabled", False)):
        return
    cache = getattr(app.state, "media_render_cache", None)
    lock = getattr(app.state, "media_render_cache_lock", None)
    if cache is None or lock is None:
        return
    ttl_seconds = max(1, int(getattr(app.state, "media_render_cache_ttl_seconds", 300)))
    max_items = max(1, int(getattr(app.state, "media_render_cache_max_items", 256)))
    async with lock:
        cache[variant_key] = {
            "bytes_data": bytes_data,
            "content_type": content_type,
            "expires_at": now_ts + ttl_seconds,
        }
        cache.move_to_end(variant_key)
        while len(cache) > max_items:
            cache.popitem(last=False)


async def _run_media_render_singleflight(
    variant_key: str,
    render_factory: Callable[[], Awaitable[tuple[bytes, str, str, str]]],
) -> tuple[bytes, str, str, str]:
    inflight_tasks = getattr(app.state, "media_render_inflight_tasks", None)
    inflight_lock = getattr(app.state, "media_render_inflight_lock", None)
    if inflight_tasks is None or inflight_lock is None:
        return await render_factory()

    created = False
    async with inflight_lock:
        task = inflight_tasks.get(variant_key)
        if task is None:
            task = asyncio.create_task(render_factory())
            inflight_tasks[variant_key] = task
            created = True

    try:
        return await task
    finally:
        if created:
            async with inflight_lock:
                existing = inflight_tasks.get(variant_key)
                if existing is task:
                    inflight_tasks.pop(variant_key, None)


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
) -> tuple[bytes, str]:
    with Image.open(io.BytesIO(source_bytes)) as image:
        image = ImageOps.exif_transpose(image)
        if target_width > 0 and image.width > target_width:
            ratio = target_width / float(image.width)
            target_height = max(1, int(round(image.height * ratio)))
            image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)

        out = io.BytesIO()
        if target_format == "webp":
            image.save(out, format="WEBP", quality=target_quality, method=6)
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
) -> None:
    retention_store = getattr(app.state, "retention_store", None)
    if retention_store is None:
        return
    retention_store.add(
        RetentionRecord(
            record_id=asset_id,
            data_class=RetentionDataClass.ORIGINAL,
            created_at=datetime.now(timezone.utc),
            user_id=user_id,
            storage_key=object_key,
        )
    )


def _delete_media_retention_record(record: RetentionRecord) -> bool:
    media_storage = _service("media_storage")
    auth_service = _service("auth_service")
    if record.storage_key:
        try:
            media_storage.delete_original(object_key=record.storage_key)
        except MediaStorageError as error:
            if error.code != "MEDIA_NOT_FOUND":
                raise
    if record.record_id:
        auth_service.delete_media_asset(asset_id=record.record_id)
    return True


async def _retention_cleanup_loop() -> None:
    try:
        while True:
            await asyncio.sleep(_retention_cleanup_interval_seconds())
            job = getattr(app.state, "retention_cleanup_job", None)
            if job is None:
                continue
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
    except asyncio.CancelledError:
        return


async def _deletion_queue_loop() -> None:
    try:
        while True:
            await asyncio.sleep(_deletion_queue_interval_seconds())
            consumer = getattr(app.state, "deletion_queue_consumer", None)
            if consumer is None:
                continue
            for _ in range(_deletion_queue_max_batch()):
                result = await run_in_threadpool(consumer.consume_once)
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
    raise build_rate_limit_http_exception(
        request_id=request_id,
        retry_after_seconds=decision.retry_after_seconds,
        code="API_RATE_LIMITED",
        message="Too many requests. Please retry shortly.",
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
    raise build_rate_limit_http_exception(
        request_id=request_id,
        retry_after_seconds=retry_after_seconds,
        code="API_RATE_LIMITED",
        message="Server is busy. Please retry shortly.",
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
        upload = media_storage.upload_original(
            user_id=user.user_id,
            scope=normalized_scope,
            mime_type=mime_type,
            payload=payload,
            filename=file.filename,
        )
        asset = auth_service.register_media_asset(
            user_id=user.user_id,
            scope=normalized_scope,
            mime_type=upload.mime_type,
            size_bytes=upload.size_bytes,
            sha256=upload.sha256,
            object_key=upload.object_key,
            asset_id=upload.asset_id,
        )
        _register_media_retention_record(
            asset_id=upload.asset_id,
            user_id=user.user_id,
            object_key=upload.object_key,
        )
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
    auth_service = _service("auth_service")
    media_storage = _service("media_storage")
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

    try:
        started_at = time.time()
        variant_key = _media_render_variant_key(
            asset_id=asset_id,
            width=final_width,
            quality=final_quality,
            target_format=final_fmt,
        )
        cached = await _media_render_cache_get(variant_key, now_ts)
        if cached is not None:
            rendered_bytes, content_type = cached
            remaining_ttl = max(1, exp - now_ts)
            logger.info(
                "[Media] render success request_id=%s user_id=%s asset_id=%s scope=%s format=%s render_ms=%s cache_hit=%s",
                request_id,
                "unknown",
                asset_id,
                "unknown",
                content_type,
                int((time.time() - started_at) * 1000),
                True,
            )
            return Response(
                content=rendered_bytes,
                media_type=content_type,
                headers={
                    "Cache-Control": f"public, max-age={remaining_ttl}",
                    "Vary": "Accept",
                    "X-Request-Id": request_id,
                },
            )

        async def _render_variant() -> tuple[bytes, str, str, str]:
            asset = auth_service.get_media_asset(asset_id=asset_id)
            source = media_storage.fetch_original(object_key=str(asset["object_key"]))
            rendered_bytes, content_type = await run_in_threadpool(
                _render_image_bytes,
                source_bytes=source.bytes_data,
                target_width=final_width,
                target_quality=final_quality,
                target_format=final_fmt,
            )
            auth_service.touch_media_asset(asset_id=asset_id)
            owner_id = str(asset.get("user_id") or "unknown")
            scope = str(asset.get("scope") or "unknown")
            await _media_render_cache_set(
                variant_key,
                bytes_data=rendered_bytes,
                content_type=content_type,
                now_ts=int(time.time()),
            )
            return rendered_bytes, content_type, owner_id, scope

        rendered_bytes, content_type, owner_id, asset_scope = await _run_media_render_singleflight(
            variant_key,
            _render_variant,
        )
        remaining_ttl = max(1, exp - now_ts)
        logger.info(
            "[Media] render success request_id=%s user_id=%s asset_id=%s scope=%s format=%s render_ms=%s cache_hit=%s",
            request_id,
            owner_id,
            asset_id,
            asset_scope,
            content_type,
            int((time.time() - started_at) * 1000),
            False,
        )
        return Response(
            content=rendered_bytes,
            media_type=content_type,
            headers={
                "Cache-Control": f"public, max-age={remaining_ttl}",
                "Vary": "Accept",
                "X-Request-Id": request_id,
            },
        )
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
        ) from error
    except AuthServiceError as error:
        raise _auth_error_to_http_exception(error, request_id) from error


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
):
    request_id = _request_id(request)
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
    started_at = time.perf_counter()

    try:
        contents, content_type = await _read_analysis_job_upload(file=file, request_id=request_id)
        job_payload = create_analysis_job_payload(
            request_id=request_id,
            mode=normalized_mode,
            allergy_info=allergy_info,
            iso_country_code=iso_country_code,
            locale=locale,
            content_type=content_type,
            image_bytes=contents,
            image_sha256=hashlib.sha256(contents).hexdigest(),
            poll_after_ms=_analysis_job_poll_after_ms(),
        )
        store = _analysis_job_store()
        await run_in_threadpool(
            store.create_job,
            job_id=job_payload.job_id,
            request_id=job_payload.request_id,
            mode=job_payload.mode,
            allergy_info=job_payload.allergy_info,
            iso_country_code=job_payload.iso_country_code,
            locale=job_payload.locale,
            content_type=job_payload.content_type,
            image_base64=job_payload.image_base64,
            image_sha256=job_payload.image_sha256,
            accepted_at=job_payload.accepted_at,
            poll_after_ms=job_payload.poll_after_ms,
        )
        accepted_record = {
            "job_id": job_payload.job_id,
            "request_id": job_payload.request_id,
            "status": "queued",
            "accepted_at": job_payload.accepted_at,
            "poll_after_ms": job_payload.poll_after_ms,
        }
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        logger.info(
            "[AnalysisJob] accepted request_id=%s job_id=%s mode=%s bytes=%d latency_ms=%d",
            request_id,
            job_payload.job_id,
            normalized_mode,
            len(contents),
            elapsed_ms,
        )
        response.headers["Retry-After"] = str(max(1, job_payload.poll_after_ms // 1000))
        return serialize_job_submit_response(record=accepted_record)
    finally:
        if slot_acquired:
            _release_analysis_slot(endpoint="/analyze/jobs")


@app.get("/analyze/jobs/{job_id}", response_model=AnalysisJobStatusResponseContract)
async def get_analysis_job_status(request: Request, job_id: str):
    request_id = _request_id(request)
    _apply_analysis_rate_limit(request=request, endpoint="/analyze/jobs/status", request_id=request_id)
    record = await run_in_threadpool(_analysis_job_store().get_job, job_id=job_id)
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
            analyst = _service("analyst")
            contents = await file.read()
            image = await run_in_threadpool(decode_upload_to_image, contents)

            prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
            return await run_in_threadpool(
                analyst.analyze_food_json,
                image,
                allergy_info,
                prompt_country_code,
            )

        result = await run_with_error_policy(
            endpoint="/analyze",
            policy=EndpointErrorPolicy(code=ErrorCode.ANALYZE_FAILED, status_code=500, user_message="Analyze failed"),
            operation=_operation,
            request_id=request_id,
        )
        if isinstance(result, dict):
            result["request_id"] = request_id
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        if isinstance(result, dict):
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
        analyst = _service("analyst")
        cost_guardrail = getattr(app.state, "label_cost_guardrail", None)
        rollout_controller = getattr(app.state, "label_rollout_controller", None)
        rollout_auto_manager = getattr(app.state, "label_rollout_auto_manager", None)
        kpi_thresholds = getattr(app.state, "label_rollout_kpi_thresholds", KpiThresholds())
        logger.info(
            "[Server] Label analysis request received request_id=%s locale=%s",
            request_id,
            locale,
        )
        preprocess_started_at = time.perf_counter()
        contents = await file.read()
        image = await run_in_threadpool(decode_upload_to_image, contents)
        preprocess_elapsed_ms = int((time.perf_counter() - preprocess_started_at) * 1000)

        quality = evaluate_label_image_quality(image)
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

        estimated_cost = _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST", 0.02)
        estimated_tokens = _env_int("LABEL_ESTIMATED_TOKENS_PER_REQUEST", 1500)
        if _is_label_cost_guardrail_enabled() and cost_guardrail:
            decision = cost_guardrail.evaluate(projected_cost_usd=estimated_cost)
            logger.info(
                "[Server] Label cost guardrail request_id=%s action=%s ratio=%.3f projected_total_cost_usd=%.4f",
                request_id,
                decision.action,
                decision.ratio,
                decision.projected_total_cost_usd,
            )
            if decision.action == CostGuardrailAction.WARN:
                logger.warning(
                    "[Server] Label cost guardrail warn request_id=%s ratio=%.3f threshold=0.70",
                    request_id,
                    decision.ratio,
                )
            elif decision.action == CostGuardrailAction.DEGRADE:
                assess_enabled = False
                estimated_cost = _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE", 0.012)
                estimated_tokens = _env_int("LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE", 900)
            elif decision.action == CostGuardrailAction.FALLBACK:
                total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
                fallback = get_safe_fallback_response(
                    "이번 달 라벨 분석 예산 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
                )
                fallback["request_id"] = request_id
                fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
                fallback["used_model"] = analyst.label_model_name
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
                return fallback

        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
        result = await run_in_threadpool(
            analyst.analyze_label_json,
            image,
            allergy_info,
            prompt_country_code,
            locale,
            assess_enabled,
        )
        label_error_type = result.pop("_label_error_type", None) if isinstance(result, dict) else None
        label_chargeable = bool(result.pop("_label_chargeable", True)) if isinstance(result, dict) else True
        label_timings = result.pop("_label_timings", {}) if isinstance(result, dict) else {}
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
            raise build_rate_limit_http_exception(
                request_id=request_id,
                retry_after_seconds=retry_after_seconds,
                code="UPSTREAM_RATE_LIMITED",
                message="Label analysis is temporarily rate-limited. Please retry shortly.",
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
            usage = cost_guardrail.record(cost_usd=estimated_cost, tokens=estimated_tokens)
            logger.info(
                "[Server] Label cost usage updated request_id=%s month=%s total_cost_usd=%.4f total_tokens=%d",
                request_id,
                usage.period_key,
                usage.total_cost_usd,
                usage.total_tokens,
            )
        elif _is_label_cost_guardrail_enabled() and cost_guardrail:
            logger.info(
                "[Server] Label cost usage skipped request_id=%s reason=non_chargeable_result",
                request_id,
            )
        return result

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
            contents = await file.read()
            image = await run_in_threadpool(decode_upload_to_image, contents)

            prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
            return await smart_router.route_analysis(
                image=image,
                allergy_info=allergy_info,
                iso_country_code=prompt_country_code,
                locale=locale,
            )

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
        if isinstance(result, dict):
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
            logger.info(
                "[Server] Lookup request request_id=%s parent_request_id=%s barcode=%s allergy_info=%s locale=%s",
                request_id,
                parent_request_id or "none",
                barcode,
                allergy_info,
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
                    raise build_rate_limit_http_exception(
                        request_id=request_id,
                        retry_after_seconds=retry_after_seconds,
                        code="UPSTREAM_RATE_LIMITED",
                        message="Barcode upstream is rate limited. Please retry shortly.",
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
            if result.get("ingredients") and allergy_info and allergy_info.lower() != "none":
                logger.info(
                    "[Server] Running allergen analysis request_id=%s ingredient_count=%d",
                    request_id,
                    len(result["ingredients"]),
                )
                analyst = _service("analyst")
                analysis_started_at = time.perf_counter()
                allergen_result = await run_in_threadpool(
                    analyst.analyze_barcode_ingredients,
                    result["ingredients"],
                    allergy_info,
                    locale,
                )
                allergen_analysis_elapsed_ms = int((time.perf_counter() - analysis_started_at) * 1000)
                used_model = allergen_result.get("used_model")
                prompt_version = allergen_result.get("prompt_version")
                logger.info(
                    "[Server] Allergen analysis done request_id=%s elapsed_ms=%d used_model=%s prompt_version=%s",
                    request_id,
                    allergen_analysis_elapsed_ms,
                    used_model,
                    prompt_version,
                )

                result["safetyStatus"] = allergen_result.get("safetyStatus", "SAFE")
                result["coachMessage"] = allergen_result.get("coachMessage", "")
                result["ingredients"] = allergen_result.get("ingredients", result["ingredients"])
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
