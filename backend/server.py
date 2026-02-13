from fastapi import FastAPI, UploadFile, File, Form, HTTPException
# Build Trigger: 2026-02-10 12:40 (After Pipeline Credits Increase)
import os
from modules.server_bootstrap import (
    decode_upload_to_image,
    initialize_services,
    load_environment,
    log_environment_debug,
)

load_environment()
log_environment_debug()

app = FastAPI()

# Initialize Analyst
# This uses the same logic as app.py (Vertex AI or Gemini API)
analyst, barcode_service, smart_router = initialize_services()

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
    await analyst.debug_list_models()
    return {"status": "triggered", "message": "Check server logs for model list"}

@app.post("/analyze")
async def analyze_food(
    file: UploadFile = File(...), 
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    try:
        # Read image
        contents = await file.read()
        image = decode_upload_to_image(contents)
        
        # Analyze using JSON-specific method
        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)

        data = analyst.analyze_food_json(
            food_image=image, 
            allergy_info=allergy_info,
            iso_current_country=prompt_country_code
        )
        return data
        
            
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/label")
async def analyze_label(
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    """
    Perform OCR nutrition analysis on a label image.
    """
    try:
        print(f"[Server] Label analysis request received.")
        contents = await file.read()
        image = decode_upload_to_image(contents)
        
        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)

        data = analyst.analyze_label_json(
            label_image=image,
            allergy_info=allergy_info,
            iso_current_country=prompt_country_code
        )
        return data
        
    except Exception as e:
        print(f"[Server] Label Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/smart")
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
    try:
        print(f"[Server] Smart analysis request received.")
        contents = await file.read()
        image = decode_upload_to_image(contents)
        
        # Delegate to SmartRouter
        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)

        result = await smart_router.route_analysis(
            image=image,
            allergy_info=allergy_info,
            iso_country_code=prompt_country_code
        )
        return result
        
    except Exception as e:
        print(f"[Server] Smart Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/lookup/barcode")
async def lookup_barcode(barcode: str = Form(...), allergy_info: str = Form("None")):
    """
    Lookup product by barcode.
    Full SoC Implementation: Controller -> Service -> Infrastructure (DataGo/OFF)
    If ingredients are found and user has allergies, run Gemini allergen analysis.
    """
    try:
        print(f"[Server] Lookup request for barcode: {barcode}, allergy_info: {allergy_info}")
        result = await barcode_service.get_product_info(barcode)
        
        if not result:
            return {"found": False, "message": "Product not found in any database"}
        
        # Run allergen analysis if ingredients exist and user has allergies
        if result.get("ingredients") and allergy_info and allergy_info.lower() != "none":
            print(f"[Server] Running allergen analysis on {len(result['ingredients'])} ingredients...")
            allergen_result = analyst.analyze_barcode_ingredients(
                ingredients=result["ingredients"],
                allergy_info=allergy_info
            )
            
            # Merge allergen analysis into result
            result["safetyStatus"] = allergen_result.get("safetyStatus", "SAFE")
            result["coachMessage"] = allergen_result.get("coachMessage", "")
            
            # Replace simple string list with enriched ingredient objects
            result["ingredients"] = allergen_result.get("ingredients", result["ingredients"])
        
        return {"found": True, "data": result}
        
    except Exception as e:
        print(f"[Server] Barcode Lookup Error: {e}")
        return {"found": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
