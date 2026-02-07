from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import uvicorn
from modules.analyst import FoodAnalyst
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

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Food Lens API is running"}

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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
