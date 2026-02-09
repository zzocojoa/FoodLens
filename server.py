from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import uvicorn
from modules.analyst import FoodAnalyst
from modules.barcode.service import BarcodeService # Import Barcode Service
from PIL import Image
import io
import json
from dotenv import load_dotenv

import os

# Load Env
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path)
print(f"DEBUG: Loaded .env from {dotenv_path}")
print(f"DEBUG: MAX_OUTPUT_TOKENS check -> {os.getenv('GEMINI_MODEL_NAME')}")

app = FastAPI()

# Initialize Analyst
# This uses the same logic as app.py (Vertex AI or Gemini API)
analyst = FoodAnalyst()
barcode_service = BarcodeService() # Initialize Service

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

@app.post("/lookup/barcode")
async def lookup_barcode(barcode: str = Form(...)):
    """
    Lookup product by barcode.
    Full SoC Implementation: Controller -> Service -> Infrastructure (DataGo/OFF)
    """
    try:
        print(f"[Server] Lookup request for barcode: {barcode}")
        result = await barcode_service.get_product_info(barcode)
        
        if not result:
            # Return 404 or just found:False? 
            # Client expects JSON, so let's return clean structure
            return {"found": False, "message": "Product not found in any database"}
            
        return {"found": True, "data": result}
        
    except Exception as e:
        print(f"[Server] Barcode Lookup Error: {e}")
        # Don't crash client, just return error
        return {"found": False, "error": str(e)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
