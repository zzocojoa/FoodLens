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
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    """
    Perform OCR nutrition analysis on a label image.
    """
    async def _operation():
        analyst = _service("analyst")
        logger.info("[Server] Label analysis request received.")
        contents = await file.read()
        image = await run_in_threadpool(decode_upload_to_image, contents)

        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
        result = await run_in_threadpool(
            analyst.analyze_label_json,
            image,
            allergy_info,
            prompt_country_code,
            locale,
        )
        logger.info("[Server] Label analysis completed. used_model=%s", result.get("used_model"))
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
