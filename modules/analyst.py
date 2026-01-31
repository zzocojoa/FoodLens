import os
import google.generativeai as genai
from PIL import Image
import json
import io
import base64
from modules.nutrition import lookup_nutrition

class FoodAnalyst:
    def __init__(self):
        # Configure Gemini API
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            print("Warning: GOOGLE_API_KEY not found in environment variables")
        else:
            genai.configure(api_key=api_key)
            
        model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-2.0-flash")
        self.model = genai.GenerativeModel(model_name)

    def analyze_food_json(self, food_image: Image.Image, allergy_info: str = "None", iso_current_country: str = "US"):
        """
        Analyzes the food image and returns a JSON object with safety status,
        ingredients, and food name, considering the user's allergy info.
        Also generates a translated allergy card based on the current country.
        """
        
        prompt = f"""
        You are an expert nutritionist and food safety AI.
        
        Analyze this food image.
        The user has the following allergies/dietary restrictions: {allergy_info}.
        The user is currently in a country with ISO code: {iso_current_country}.
        
        Identify the food name.
        Classify the food origin as one of: "korean", "western", "asian", "single_ingredient", or "other".
        - "korean": Korean dishes (김치찌개, 비빔밥, 불고기, etc.)
        - "western": Western dishes (pasta, pizza, steak, etc.)
        - "asian": Other Asian dishes (sushi, pad thai, mapo tofu, etc.)
        - "single_ingredient": Simple single items (orange, banana, egg, chicken breast, etc.)
        - "other": Everything else
        
        List the likely ingredients.
        Determine if the food is SAFE, CAUTION, or DANGER based on the visible ingredients and the user's restrictions.
        Provide a confidence score (0-100) for how certain you are about the food identification.

        [Traveler Allergy Card Generation]
        If the user has allergies (`{allergy_info}` is not "None"), generate a translation card in the LOCAL LANGUAGE of the country code `{iso_current_country}`.
        The card text should be a polite request to remove or warn about the specific allergens found in this dish. 
        Example (if in Thailand, Peanut Allergy): "ฉัน패้ถั่วลิสงครับ ช่วยระวังไม่ให้มีถั่วลิสงในอาหารนี้ได้ไหมครับ" (I am allergic to peanuts. Can you please ensure there are no peanuts in this dish?)
        If `{iso_current_country}` is 'US' or 'UK' or English-speaking, just provide the English text.
        If the user has NO allergies, set "text" to null.
        
        If the image is not food, return "Not Food" as the food name and DANGER with low confidence.
        
        Return ONLY a valid JSON object with the following structure:
        {{
            "foodName": "Name of the food",
            "foodOrigin": "korean" | "western" | "asian" | "single_ingredient" | "other",
            "safetyStatus": "SAFE" | "CAUTION" | "DANGER",
            "confidence": 85,
            "ingredients": [
                {{ 
                    "name": "ingredient name", 
                    "isAllergen": boolean,
                    "box_2d": [ymin, xmin, ymax, xmax]
                }}
            ],
            "translationCard": {{
                "language": "Target Language Name (e.g. Thai, French)",
                "text": "Translated Alert Message in Local Script",
                "audio_query": "English description for TTS (e.g. 'Say I have peanut allergy in Thai')"
            }},
            "raw_result": "A brief 1-sentence explanation of why it is safe or not."
        }}
        """
        
        try:
            # Generate response using Gemini API with PIL image
            response = self.model.generate_content([prompt, food_image])
            
            # Handle potential markdown code block wrapping
            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]
            
            result = json.loads(text)
            print(f"AI Response JSON: {json.dumps(result, indent=2)}")  # Debug log
            
            # Lookup nutrition data using multi-tier API system
            food_name = result.get("foodName", "")
            food_origin = result.get("foodOrigin", "unknown")
            
            if food_name and food_name not in ["Error Analyzing Food", "Not Food"]:
                nutrition_data = lookup_nutrition(food_name, food_origin)
                if nutrition_data:
                    result["nutrition"] = nutrition_data
                    print(f"Nutrition Data ({nutrition_data.get('dataSource', 'Unknown')}): {json.dumps(nutrition_data, indent=2)}")
            
            return result
            
        except Exception as e:
            print(f"Error in analysis: {e}")
            # Return a fallback error JSON
            return {
                "foodName": "Error Analyzing Food",
                "safetyStatus": "CAUTION",
                "confidence": 0,
                "ingredients": [],
                "raw_result": f"Could not analyze image due to error: {str(e)}"
            }
