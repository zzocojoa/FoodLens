from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import uvicorn
# Build Trigger: 2026-02-10 12:40 (After Pipeline Credits Increase)
from modules.analyst import FoodAnalyst
from modules.smart_router import SmartRouter # Import SmartRouter
from modules.barcode.service import BarcodeService # Import Barcode Service
from PIL import Image
import io
import json
from dotenv import load_dotenv

import os

# Load Env
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
    print(f"[Startup] Loaded .env from {dotenv_path}")
else:
    print(f"[Startup] Warning: .env not found at {dotenv_path}. Using environment variables.")

# Detailed Environment Logging
print("--- [Server Debug Environment] ---")
print(f"PORT: {os.getenv('PORT', '8000')}")
print(f"GEMINI_MODEL_NAME: {os.getenv('GEMINI_MODEL_NAME', 'Not set')}")
print(f"KOREAN_FDA_API_KEY: {'[SET]' if os.getenv('KOREAN_FDA_API_KEY') else '[MISSING]'}")

# Check Service Account JSON (A frequent source of errors on Render)
sa_json = os.getenv('GCP_SERVICE_ACCOUNT_JSON', '')
print(f"GCP_SERVICE_ACCOUNT_JSON Raw Length: {len(sa_json)}")
if sa_json:
    try:
        # Check if it looks like JSON
        if sa_json.strip().startswith('{') and sa_json.strip().endswith('}'):
            parsed_sa = json.loads(sa_json)
            print(f"[Startup] ✓ GCP_SERVICE_ACCOUNT_JSON parsed successfully. Project: {parsed_sa.get('project_id')}")
        else:
            print("[Startup] ⚠️ WARNING: GCP_SERVICE_ACCOUNT_JSON is incomplete or improperly formatted.")
            print(f"[Startup] Text starts with: {repr(sa_json[:30])}")
            print(f"[Startup] Text ends with: {repr(sa_json[-30:])}")
            if sa_json.strip().startswith('{') and not sa_json.strip().endswith('}'):
                print("[Startup] 🛑 ERROR: JSON is truncated! This usually happens if .env has multiple lines for one variable.")
                print("[Startup] FIX: Wrap the entire JSON in single quotes in your Environment Variables or .env file.")
    except Exception as e:
        print(f"[Startup] ✗ Error parsing GCP_SERVICE_ACCOUNT_JSON: {e}")
        # Log more context for debugging
        print(f"[Startup] Raw content sample: {repr(sa_json[:100])}...")

app = FastAPI()

# Initialize Analyst
# This uses the same logic as app.py (Vertex AI or Gemini API)
try:
    print("[Startup] Initializing FoodAnalyst...")
    analyst = FoodAnalyst()
    print("[Startup] ✓ FoodAnalyst initialized.")
    print("[Startup] ✓ FoodAnalyst initialized.")
    barcode_service = BarcodeService() # Initialize Service
    print("[Startup] ✓ BarcodeService initialized.")
    smart_router = SmartRouter(analyst) # Initialize SmartRouter with the analyst instance
    print("[Startup] ✓ SmartRouter initialized.")
except Exception as e:
    print(f"[Startup] ✗ FAILED to initialize services: {e}")
    traceback.print_exc()
    # On Render, the build will fail if this fails during startup check

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
    iso_country_code: str = Form("US")
):
    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Analyze using JSON-specific method
        data = analyst.analyze_food_json(
            food_image=image, 
            allergy_info=allergy_info,
            iso_current_country=iso_country_code
        )
        return data
        
            
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/label")
async def analyze_label(
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US")
):
    """
    Perform OCR nutrition analysis on a label image.
    """
    try:
        print(f"[Server] Label analysis request received.")
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        data = analyst.analyze_label_json(
            label_image=image,
            allergy_info=allergy_info,
            iso_current_country=iso_country_code
        )
        return data
        
    except Exception as e:
        print(f"[Server] Label Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/smart")
async def analyze_smart(
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US")
):
    """
    Smart routing endpoint for Gallery uploads.
    Classifies image (Food vs Label) and routes to specific analysis.
    """
    try:
        print(f"[Server] Smart analysis request received.")
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Delegate to SmartRouter
        result = await smart_router.route_analysis(
            image=image,
            allergy_info=allergy_info,
            iso_country_code=iso_country_code
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
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
