from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
# Build Trigger: 2026-02-10 12:40 (After Pipeline Credits Increase)
import logging
import os
import time
from typing import Any

from backend.modules.server_bootstrap import (
    decode_upload_to_image,
    initialize_services,
    load_environment,
    log_environment_debug,
)
from backend.modules.analyst_core.prompts import LABEL_2PASS_PROMPT_VERSION
from backend.modules.analyst_core.response_utils import get_safe_fallback_response
from backend.modules.ops.cost_guardrail import (
    CostGuardrailAction,
    CostGuardrailService,
    InMemoryMonthlyUsageStorage,
)
from backend.modules.ops.data_retention import (
    InMemoryRetentionStore,
    JsonFileRetentionStore,
    LocalFileRetentionCleanupAdapter,
    NoOpRetentionCleanupAdapter,
    RetentionCleanupJob,
    RetentionPolicyConfig,
)
from backend.modules.ops.deletion_queue import (
    DeletionQueueConsumer,
    DeletionQueueProducer,
    InMemoryDeletionQueueStorage,
    JsonFileDeletionQueueStorage,
    NoOpDeletionHandler,
)
from backend.modules.ops.rollout_control import (
    InMemoryRolloutStateStore,
    JsonFileRolloutStateStore,
    KpiThresholds,
    LabelRolloutAutoManager,
    LabelRolloutController,
    RolloutConfig,
    evaluate_kpi_gate,
    load_kpi_input_from_env,
)
from backend.modules.quality.label_quality_gate import evaluate_label_image_quality
from backend.modules.runtime_guardrails import (
    EndpointErrorPolicy,
    ErrorCode,
    raise_service_unavailable,
    run_in_threadpool,
    run_with_error_policy,
)
from backend.modules.contracts.analysis_response import AnalysisResponseContract
from backend.modules.contracts.barcode_response import BarcodeLookupResponseContract

load_environment()
log_environment_debug()

app = FastAPI()

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


def _is_label_429_returns_503_enabled() -> bool:
    return os.environ.get("LABEL_429_RETURNS_503_ENABLED", "0").strip() == "1"


@app.on_event("startup")
async def _startup() -> None:
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
    app.state.retention_policy = RetentionPolicyConfig.from_env(os.environ.get)
    retention_store_backend = _env_str("RETENTION_STORE_BACKEND", "memory").lower()
    if retention_store_backend == "file":
        retention_store = JsonFileRetentionStore(_env_str("RETENTION_STORE_PATH", "/tmp/foodlens_retention_store.json"))
    else:
        retention_store = InMemoryRetentionStore()

    retention_delete_backend = _env_str("RETENTION_DELETE_BACKEND", "noop").lower()
    if retention_delete_backend == "local_file":
        delete_roots = [part.strip() for part in _env_str("RETENTION_DELETE_ROOTS", "").split(",") if part.strip()]
        cleanup_adapter = LocalFileRetentionCleanupAdapter(delete_roots)
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
    else:
        deletion_storage = InMemoryDeletionQueueStorage()
    app.state.deletion_queue_producer = DeletionQueueProducer(deletion_storage)
    app.state.deletion_queue_consumer = DeletionQueueConsumer(deletion_storage, NoOpDeletionHandler())


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


def resolve_prompt_country_code(iso_country_code: str, locale: str | None) -> str:
    """
    Resolve language/country code used by AI prompt.
    Priority: app UI locale override > request iso country code > US fallback.
    """
    if locale:
        mapped = LOCALE_TO_ISO.get(locale.strip().lower())
        if mapped:
            return mapped

    if iso_country_code:
        normalized = iso_country_code.strip().upper()
        if normalized:
            return normalized

    return "US"

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Food Lens API is running"}

@app.get("/debug/models")
async def debug_models():
    """Trigger model listing debug."""
    analyst = _service("analyst")
    await analyst.debug_list_models()
    return {"status": "triggered", "message": "Check server logs for model list"}

@app.post("/analyze", response_model=AnalysisResponseContract)
async def analyze_food(
    file: UploadFile = File(...), 
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
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

    return await run_with_error_policy(
        endpoint="/analyze",
        policy=EndpointErrorPolicy(code=ErrorCode.ANALYZE_FAILED, status_code=500, user_message="Analyze failed"),
        operation=_operation,
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
    request_id = request.headers.get("X-Request-Id") or os.urandom(4).hex()
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

        if label_error_type == "quota_exhausted_429" and _is_label_429_returns_503_enabled():
            logger.warning(
                "[Server] Label analysis quota-429 request_id=%s returning=503 elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
                request_id,
                preprocess_elapsed_ms,
                extract_elapsed_ms,
                assess_elapsed_ms,
                total_elapsed_ms,
            )
            raise HTTPException(
                status_code=503,
                detail={
                    "message": "Label analysis is temporarily rate-limited. Please retry shortly.",
                    "code": ErrorCode.ANALYZE_LABEL_FAILED,
                    "request_id": request_id,
                },
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

    return await run_with_error_policy(
        endpoint="/analyze/label",
        policy=EndpointErrorPolicy(
            code=ErrorCode.ANALYZE_LABEL_FAILED,
            status_code=500,
            user_message="Label analysis failed",
        ),
        operation=_operation,
    )

@app.post("/analyze/smart", response_model=AnalysisResponseContract)
async def analyze_smart(
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    """
    Smart routing endpoint for Gallery uploads.
    Classifies image (Food vs Label) and routes to specific analysis.
    """
    async def _operation():
        smart_router = _service("smart_router")
        logger.info("[Server] Smart analysis request received.")
        contents = await file.read()
        image = await run_in_threadpool(decode_upload_to_image, contents)

        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
        return await smart_router.route_analysis(
            image=image,
            allergy_info=allergy_info,
            iso_country_code=prompt_country_code,
            locale=locale,
        )

    return await run_with_error_policy(
        endpoint="/analyze/smart",
        policy=EndpointErrorPolicy(
            code=ErrorCode.ANALYZE_SMART_FAILED,
            status_code=500,
            user_message="Smart analysis failed",
        ),
        operation=_operation,
    )

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
    request_id = request.headers.get("X-Request-Id") or os.urandom(4).hex()
    started_at = time.perf_counter()
    try:
        barcode_service = _service("barcode_service")
        logger.info(
            "[Server] Lookup request request_id=%s barcode=%s allergy_info=%s locale=%s",
            request_id,
            barcode,
            allergy_info,
            locale,
        )
        lookup_started_at = time.perf_counter()
        result = await barcode_service.get_product_info(barcode)
        logger.info(
            "[Server] Barcode source lookup done request_id=%s elapsed_ms=%d found=%s",
            request_id,
            int((time.perf_counter() - lookup_started_at) * 1000),
            bool(result),
        )
        
        if not result:
            logger.info(
                "[Server] Lookup complete request_id=%s elapsed_ms=%d found=false",
                request_id,
                int((time.perf_counter() - started_at) * 1000),
            )
            return {"found": False, "message": "Product not found in any database"}
        
        # Run allergen analysis if ingredients exist and user has allergies
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
            )
            logger.info(
                "[Server] Allergen analysis done request_id=%s elapsed_ms=%d",
                request_id,
                int((time.perf_counter() - analysis_started_at) * 1000),
            )
            
            # Merge allergen analysis into result
            result["safetyStatus"] = allergen_result.get("safetyStatus", "SAFE")
            result["coachMessage"] = allergen_result.get("coachMessage", "")
            
            # Replace simple string list with enriched ingredient objects
            result["ingredients"] = allergen_result.get("ingredients", result["ingredients"])
        logger.info(
            "[Server] Lookup complete request_id=%s elapsed_ms=%d found=true",
            request_id,
            int((time.perf_counter() - started_at) * 1000),
        )
        return {"found": True, "data": result}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "[Server] Barcode Lookup Error request_id=%s code=%s error=%s",
            request_id,
            ErrorCode.BARCODE_LOOKUP_FAILED,
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

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
