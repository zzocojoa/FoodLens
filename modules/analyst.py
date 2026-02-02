import os
import vertexai
from vertexai.generative_models import GenerativeModel, Image as VertexImage, Part, HarmCategory, HarmBlockThreshold
from PIL import Image
import json
import io
import base64
import tempfile
from modules.nutrition import lookup_nutrition
from google.api_core import retry
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable

class FoodAnalyst:
    def __init__(self):
        # Configure Vertex AI
        project_id = os.getenv("GCP_PROJECT_ID")
        location = os.getenv("GCP_LOCATION", "us-central1")
        service_account_json = os.getenv("GCP_SERVICE_ACCOUNT_JSON")

        if service_account_json:
            try:
                # For Render/Cloud deployment where file upload is difficult
                # Write JSON content to a temporary file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                    f.write(service_account_json)
                    temp_cred_path = f.name
                
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_cred_path
                print(f"Vertex AI: Using temporary credentials from environment variable")
            except Exception as e:
                print(f"Warning: Failed to process Service Account JSON: {e}")

        if not project_id:
            print("Warning: GCP_PROJECT_ID not found in environment variables. Vertex AI might fail.")
        else:
            vertexai.init(project=project_id, location=location)
            
        model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-1.5-flash")
        self.model = GenerativeModel(model_name)

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
        
        # Configure generation and safety
        generation_config = {
            "temperature": 0.2,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 1024,
            "response_mime_type": "application/json",
        }

        safety_settings = {
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

        try:
            # Convert PIL Image to Vertex AI Image format
            img_byte_arr = io.BytesIO()
            food_image.save(img_byte_arr, format='JPEG')
            vertex_image = VertexImage.from_bytes(img_byte_arr.getvalue())

            # Define Retry Policy for 429 (Resource Exhausted)
            # Initial allowed delay 2.0s, multiplier 2.0, max delay 30s, total timeout 60s
            retry_policy = retry.Retry(
                predicate=retry.if_exception_type(ResourceExhausted, ServiceUnavailable),
                initial=2.0,
                maximum=30.0,
                multiplier=2.0,
                timeout=60.0
            )

            print("Vertex AI: Sending request with exponential backoff for 429/503 errors...")

            # Generate response using Vertex AI with retry wrapper
            # Note: We wrap the call lambda or use the retry object to call the method
            response = retry_policy(self.model.generate_content)(
                [prompt, vertex_image],
                generation_config=generation_config,
                safety_settings=safety_settings
            )
            
            # Handle potential markdown code block wrapping (though response_mime_type helps)
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
            # Check for specific quota errors in the message
            error_msg = str(e)
            if "429" in error_msg or "Resource exhausted" in error_msg or "Quota" in error_msg:
                error_msg = "Enterprise AI Quota issue. Please check Vertex AI billing or limits."
            
            # Return a fallback error JSON
            return {
                "foodName": "Error Analyzing Food",
                "safetyStatus": "CAUTION",
                "confidence": 0,
                "ingredients": [],
                "raw_result": error_msg
            }
