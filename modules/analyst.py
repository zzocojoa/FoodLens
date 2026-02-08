import os
import atexit
import random
import threading
import time
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
import traceback

# ISO 3166-1 alpha-2 country code → Primary language mapping
# Used for translation card generation and localization
ISO_COUNTRY_TO_LANGUAGE = {
    # East Asia
    "KR": "Korean",
    "JP": "Japanese",
    "CN": "Chinese (Simplified)",
    "TW": "Chinese (Traditional)",
    "HK": "Chinese (Traditional)",
    
    # Southeast Asia
    "TH": "Thai",
    "VN": "Vietnamese",
    "ID": "Indonesian",
    "MY": "Malay",
    "PH": "Filipino/English",
    "SG": "English",
    
    # South Asia
    "IN": "Hindi/English",
    
    # Europe
    "FR": "French",
    "DE": "German",
    "IT": "Italian",
    "ES": "Spanish",
    "PT": "Portuguese",
    "NL": "Dutch",
    "PL": "Polish",
    "RU": "Russian",
    "GR": "Greek",
    "TR": "Turkish",
    
    # Americas
    "US": "English",
    "CA": "English/French",
    "MX": "Spanish",
    "BR": "Portuguese",
    "AR": "Spanish",
    
    # Oceania
    "AU": "English",
    "NZ": "English",
    
    # Middle East
    "AE": "Arabic",
    "SA": "Arabic",
    "IL": "Hebrew",
    
    # Default fallback
    "GB": "English",
    "UK": "English",
}

def get_language_for_country(iso_code: str) -> str:
    """Returns the primary language for a given ISO country code."""
    return ISO_COUNTRY_TO_LANGUAGE.get(iso_code.upper(), "English")

# Standard allergen categories (based on FDA/EU major allergens)
# Maps common user inputs to standardized allergen names
STANDARD_ALLERGENS = {
    # Peanuts
    "peanut": "Peanut",
    "peanuts": "Peanut",
    "땅콩": "Peanut",
    
    # Tree Nuts
    "tree nut": "Tree Nut",
    "tree nuts": "Tree Nut",
    "treenut": "Tree Nut",  # profile.tsx compatibility
    "nuts": "Tree Nut",
    "almond": "Tree Nut (Almond)",
    "walnut": "Tree Nut (Walnut)",
    "cashew": "Tree Nut (Cashew)",
    "pistachio": "Tree Nut (Pistachio)",
    "견과류": "Tree Nut",
    "호두": "Tree Nut (Walnut)",
    "아몬드": "Tree Nut (Almond)",
    
    # Dairy/Milk
    "milk": "Milk/Dairy",
    "dairy": "Milk/Dairy",
    "lactose": "Milk/Dairy",
    "우유": "Milk/Dairy",
    "유제품": "Milk/Dairy",
    
    # Eggs
    "egg": "Egg",
    "eggs": "Egg",
    "계란": "Egg",
    "달걀": "Egg",
    
    # Wheat/Gluten
    "wheat": "Wheat/Gluten",
    "gluten": "Wheat/Gluten",
    "밀": "Wheat/Gluten",
    "글루텐": "Wheat/Gluten",
    
    # Soy
    "soy": "Soy",
    "soybean": "Soy",
    "soybeans": "Soy",
    "대두": "Soy",
    "콩": "Soy",
    
    # Fish
    "fish": "Fish",
    "생선": "Fish",
    
    # Shellfish
    "shellfish": "Shellfish",
    "shrimp": "Shellfish (Shrimp)",
    "crab": "Shellfish (Crab)",
    "lobster": "Shellfish (Lobster)",
    "갑각류": "Shellfish",
    "새우": "Shellfish (Shrimp)",
    "게": "Shellfish (Crab)",
    
    # Sesame
    "sesame": "Sesame",
    "참깨": "Sesame",
    
    # Sulfites
    "sulfite": "Sulfite",
    "sulfites": "Sulfite",
    "아황산염": "Sulfite",
}

def normalize_allergens(raw_input: str) -> list[str]:
    """
    Normalizes free-text allergy input to a list of standard allergen names.
    
    Args:
        raw_input: User's free-text allergy description (e.g., "peanut, 우유, shellfish")
    
    Returns:
        List of standardized allergen names (e.g., ["Peanut", "Milk/Dairy", "Shellfish"])
    """
    if not raw_input or raw_input.lower() in ["none", "없음", "no", ""]:
        return []
    
    # Split by common delimiters
    import re
    tokens = re.split(r'[,;/\s]+', raw_input.lower().strip())
    
    normalized = []
    for token in tokens:
        token = token.strip()
        if token in STANDARD_ALLERGENS:
            allergen = STANDARD_ALLERGENS[token]
            if allergen not in normalized:
                normalized.append(allergen)
        elif token and len(token) > 1:
            # Unknown allergen - keep as-is but capitalize
            formatted = token.capitalize()
            if formatted not in normalized:
                normalized.append(formatted)
    
    return normalized

def format_allergens_for_prompt(raw_input: str) -> str:
    """
    Formats allergy input for the AI prompt as a structured list.
    
    Args:
        raw_input: User's free-text allergy description
    
    Returns:
        Formatted string for prompt (e.g., "Peanut, Milk/Dairy, Shellfish")
    """
    normalized = normalize_allergens(raw_input)
    if not normalized:
        return "None"
    return ", ".join(normalized)

class FoodAnalyst:
    # Class-level storage for temp credential file path (for cleanup)
    _temp_cred_path: str | None = None
    
    # Concurrency control: limit simultaneous Vertex AI requests
    # Prevents thundering herd on 429 recovery
    _request_semaphore = threading.Semaphore(3)  # Max 3 concurrent requests
    
    # Retry tracking for operational monitoring
    _retry_stats = {"total_retries": 0, "last_429_time": None}

    async def debug_list_models(self):
        """Debug method to list available models in the project."""
        try:
            from google.cloud import aiplatform
            print("\n[DEBUG] Listing available Vertex AI models...")
            models = aiplatform.Model.list()
            print(f"[DEBUG] Found {len(models)} custom models.")
            for m in models:
                print(f" - {m.display_name} ({m.resource_name})")
            
            # List foundation models
            print("[DEBUG] Listing Foundation Models:")
            from vertexai.preview.generative_models import GenerativeModel
            # Note: SDK doesn't have a direct 'list_foundation_models', 
            # so we try to instantiate common ones to check availability
            common_models = ["gemini-1.5-pro-002", "gemini-1.5-flash-002", "gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.0-pro"]
            for m_name in common_models:
                try:
                    GenerativeModel(m_name)
                    print(f" - {m_name}: AVAILABLE")
                except Exception as e:
                    print(f" - {m_name}: UNAVAILABLE ({str(e)})")
                    
        except Exception as e:
            print(f"[DEBUG] Error listing models: {e}")
            import traceback
            traceback.print_exc()

    def __init__(self):
        self._configure_vertex_ai()
        self.model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-2.0-flash")
        
        # [DEBUG] Log model initialization details
        print(f"[Model Debug] GEMINI_MODEL_NAME env: {os.getenv('GEMINI_MODEL_NAME')}")
        print(f"[Model Debug] Using model: {self.model_name}")
        
        try:
            self.model = GenerativeModel(self.model_name)
            print(f"[Model Debug] ✓ GenerativeModel created successfully")
        except Exception as e:
            print(f"[Model Debug] ✗ GenerativeModel creation FAILED: {e}")
            traceback.print_exc()
            raise

    def _configure_vertex_ai(self):
        """
        Configures Vertex AI credentials and initialization.
        
        Security Notes:
        ---------------
        The current implementation uses `GCP_SERVICE_ACCOUNT_JSON` environment variable
        containing raw JSON, which is convenient for PaaS like Render but less secure.
        
        Recommended Alternatives (P0 Security Improvements):
        1. **Google Secret Manager**: Store credentials in Secret Manager and fetch at runtime.
           - Requires `google-cloud-secret-manager` library.
           - Example: `client.access_secret_version(name="projects/PROJECT_ID/secrets/SA_KEY/versions/latest")`
        2. **Volume Mount**: Mount the service account JSON as a file in a secure volume.
           - Set `GOOGLE_APPLICATION_CREDENTIALS` to the mounted path directly.
        3. **Workload Identity (GKE/Cloud Run)**: If running on GCP, use Workload Identity
           to automatically bind a Kubernetes service account to a GCP service account.
           - No credentials file needed; ADC handles authentication.
        """
        project_id = os.getenv("GCP_PROJECT_ID")
        location = os.getenv("GCP_LOCATION", "us-central1")
        service_account_json = os.getenv("GCP_SERVICE_ACCOUNT_JSON")
        
        # === DEBUG LOGGING ===
        print(f"[Credential Debug] GCP_PROJECT_ID: {project_id}")
        print(f"[Credential Debug] GCP_LOCATION: {location}")
        print(f"[Credential Debug] GCP_SERVICE_ACCOUNT_JSON exists: {bool(service_account_json)}")
        if service_account_json:
            print(f"[Credential Debug] JSON length: {len(service_account_json)} chars")
            print(f"[Credential Debug] JSON starts with: {service_account_json[:50]}...")
            print(f"[Credential Debug] Contains 'private_key': {'private_key' in service_account_json}")
        # === END DEBUG ===

        if service_account_json:
            try:
                # Validate JSON format before writing
                import json
                parsed = json.loads(service_account_json)
                print(f"[Credential Debug] ✓ JSON parsing successful, keys: {list(parsed.keys())}")
                
                # For Render/Cloud deployment where file upload is difficult
                # Write JSON content to a temporary file
                # NOTE: This file is deleted on process exit via atexit hook.
                with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                    f.write(service_account_json)
                    FoodAnalyst._temp_cred_path = f.name
                
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FoodAnalyst._temp_cred_path
                print(f"[Credential Debug] ✓ Temp file created: {FoodAnalyst._temp_cred_path}")
                print(f"[Credential Debug] ✓ GOOGLE_APPLICATION_CREDENTIALS set")
                
                # Register cleanup handler
                atexit.register(FoodAnalyst._cleanup_temp_credentials)
                
            except json.JSONDecodeError as e:
                print(f"[Credential Debug] ✗ JSON parsing FAILED: {e}")
                print(f"[Credential Debug] First 100 chars: {repr(service_account_json[:100])}")
            except Exception as e:
                print(f"[Credential Debug] ✗ Credential setup FAILED: {e}")
        else:
            print(f"[Credential Debug] ✗ GCP_SERVICE_ACCOUNT_JSON not found in environment!")

        if not project_id:
            print("Warning: GCP_PROJECT_ID not found in environment variables. Vertex AI might fail.")
        else:
            vertexai.init(project=project_id, location=location)
            print(f"[Credential Debug] ✓ Vertex AI initialized (project={project_id}, location={location})")

    @staticmethod
    def _cleanup_temp_credentials():
        """Cleans up the temporary credentials file on process exit."""
        if FoodAnalyst._temp_cred_path and os.path.exists(FoodAnalyst._temp_cred_path):
            try:
                os.remove(FoodAnalyst._temp_cred_path)
                print(f"Vertex AI: Cleaned up temporary credentials file.")
            except Exception as e:
                print(f"Warning: Failed to clean up temp credentials: {e}")

    def _build_analysis_prompt(self, allergy_info: str, iso_current_country: str) -> str:
        """Constructs the analysis prompt based on user context."""
        return f"""
        # [System Prompt: Food Lens Expert Engine v3.2 - Context Engineered]

        **ROLE**
        You are an elite Food Nutritionist and Safety Analyst for the 'Food Lens' app. Your expertise lies in identifying global cuisines from visual cues and assessing allergen risks with high precision.

        **TASK**
        Analyze the provided food image to:
        1.  Identify the specific Dish Name and Cuisine.
        2.  Detect visible ingredients with bounding boxes.
        3.  Assess Safety verification against user allergies.
        4.  Provide a structured JSON output.

        **CONTEXT DATA**
        - **User Allergy Profile**: `{allergy_info}`
        - **User Location (ISO)**: `{iso_current_country}`

        **CRITICAL RULES (MUST FOLLOW)**
        
        1.  **DISH IDENTIFICATION (NO "UNKNOWN")**
            -   You MUST identify the dish. Do not return "Unknown Dish".
            -   Reason through the visual components (protein, starch, sauce, utensils) to infer the most likely specific dish name.
            -   *Example*: If you see broth, noodles, and red spice -> "Spicy Ramen" or "Jjamppong", NOT "Noodle Soup".

        2.  **NAMING CONVENTION**
            -   Use standard, specific proper nouns (e.g., "Pork Belly", "Carbonara").
            -   Avoid generic terms like "Lunch", "Plate", "Appetizer".
            -   Do NOT include descriptive adjectives in the `foodName` field (e.g., "Delicious Pizza" -> "Pizza").

        3.  **VISUAL VERIFICATION (ANTI-HALLUCINATION)**
            -   Only list ingredients clearly visible in the image.
            -   Do NOT infer hidden ingredients (e.g., do not list "Sugar" or "Salt" unless visible).
            -   If an ingredient looks like a puree/paste but you are unsure, label it generically (e.g., "Yellow Sauce", "Red Paste") rather than guessing a specific fruit/veg that causes allergen false positives.

        4.  **SAFETY STATUS & ALLERGENS**
            -   **`isAllergen`**: Set to `true` ONLY if the ingredient is visually confirmed AND matches `{allergy_info}`.
            -   **`safetyStatus` Enum**:
                -   `"SAFE"`: No allergens detected.
                -   `"CAUTION"`: Ambiguous ingredients or potential cross-contamination risk.
                -   `"DANGER"`: Confirmed presence of `{allergy_info}`.
            -   If unsure, prefer `"CAUTION"` over `"DANGER"`.

        5.  **COORDINATES**
            -   `bbox` is MANDATORY for all ingredients: `[ymin, xmin, ymax, xmax]` (0-1000 scale).

        **OUTPUT FORMAT (JSON ONLY)**
        Return raw JSON with no markdown formatting.
        {{
           "foodName": "Specific Dish Name",
           "foodName_en": "English Name",
           "foodName_ko": "Korean Name",
           "foodOrigin": "Cuisine Origin (e.g., Korean, Italian)",
           "safetyStatus": "SAFE" | "CAUTION" | "DANGER",
           "confidence": 0-100,
           "ingredients": [
                {{
                  "name": "Ingredient Name",
                  "bbox": [ymin, xmin, ymax, xmax],
                  "confidence_score": 0.00,
                  "isAllergen": boolean,
                  "riskReason": "Explanation if allergen"
                }}
            ],
           "translationCard": {{
             "language": "{iso_current_country}",
             "text": "Polite safety warning or confirmation in local language."
           }},
           "raw_result": "Brief 1-sentence summary"
        }}
        """

    def _prepare_vertex_image(self, pil_image: Image.Image) -> VertexImage:
        """Converts PIL image to Vertex AI format."""
        img_byte_arr = io.BytesIO()
        pil_image.save(img_byte_arr, format='JPEG')
        return VertexImage.from_bytes(img_byte_arr.getvalue())

    def _parse_ai_response(self, response_text: str) -> dict:
        """
        Cleans and parses the AI JSON response with robust recovery logic.
        
        Recovery Strategy:
        1. Strip markdown code block wrappers (```json ... ```)
        2. If standard parsing fails, extract from first '{' to last '}'
        3. On complete failure, return safe fallback and log internally
        """
        # === DIAGNOSTIC LOGGING START ===
        print(f"\n{'='*60}")
        print(f"[PARSE DEBUG] Raw response length: {len(response_text)} chars")
        print(f"[PARSE DEBUG] First 200 chars: {repr(response_text[:200])}")
        print(f"[PARSE DEBUG] Last 100 chars: {repr(response_text[-100:] if len(response_text) > 100 else response_text)}")
        print(f"{'='*60}")
        # === DIAGNOSTIC LOGGING END ===
        
        text = response_text.strip()
        
        # Step 1: Remove markdown code block wrappers
        original_text = text
        if text.startswith("```json"):
            text = text[7:]
            print(f"[PARSE DEBUG] Stripped ```json prefix")
        if text.startswith("```"):
            text = text[3:]
            print(f"[PARSE DEBUG] Stripped ``` prefix")
        if text.endswith("```"):
            text = text[:-3]
            print(f"[PARSE DEBUG] Stripped ``` suffix")
        text = text.strip()
        
        if text != original_text:
            print(f"[PARSE DEBUG] After markdown cleanup: {repr(text[:200])}")
        
        # Step 2: Try standard JSON parsing
        try:
            result = json.loads(text)
            print(f"[PARSE DEBUG] ✓ Standard JSON parse SUCCESS")
            return result
        except json.JSONDecodeError as e:
            print(f"[PARSE DEBUG] ✗ Standard JSON parse FAILED: {e}")
            print(f"[PARSE DEBUG] Error at position {e.pos}: {repr(text[max(0,e.pos-20):e.pos+20])}")
        
        # Step 3: Recovery - extract from first { to last }
        try:
            first_brace = text.find('{')
            last_brace = text.rfind('}')
            print(f"[PARSE DEBUG] Brace positions: first={first_brace}, last={last_brace}")
            
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                extracted = text[first_brace:last_brace + 1]
                print(f"[PARSE DEBUG] Extracted content length: {len(extracted)}")
                print(f"[PARSE DEBUG] Extracted first 200: {repr(extracted[:200])}")
                
                result = json.loads(extracted)
                print(f"[PARSE DEBUG] ✓ Brace extraction recovery SUCCESS")
                return result
        except json.JSONDecodeError as e:
            print(f"[PARSE DEBUG] ✗ Brace extraction recovery FAILED: {e}")
            print(f"[PARSE DEBUG] Error at position {e.pos}: {repr(extracted[max(0,e.pos-30):e.pos+30])}")
        
        # Step 4: Complete failure - return safe fallback
        print(f"[PARSE DEBUG] ✗✗ ALL PARSING ATTEMPTS FAILED")
        print(f"[PARSE DEBUG] Full raw response:\n{response_text}")
        print(f"{'='*60}\n")
        return self._get_safe_fallback_response("AI 응답을 처리할 수 없습니다. 다시 시도해주세요.")

    def _get_safe_fallback_response(self, user_message: str) -> dict:
        """
        Returns a safe, user-friendly fallback JSON when parsing fails.
        Internal errors are logged but NOT exposed to the user.
        
        This response matches the normal schema structure to prevent
        frontend parsing issues.
        """
        return {
            "foodName": "분석 오류",
            "foodName_en": "Analysis Error",
            "foodName_ko": "분석 오류",
            "canonicalFoodId": "error",
            "foodOrigin": "unknown",
            "safetyStatus": "CAUTION",
            "confidence": 0,
            "ingredients": [],
            "translationCard": {
                "language": "Korean",
                "text": None,
                "audio_query": None
            },
            "raw_result": user_message
        }

    def _strip_box2d(self, result: dict) -> dict:
        """
        Removes box_2d fields from ingredients.
        
        LMM-generated bounding boxes are often unreliable for production use.
        If precise bbox detection is needed, use a dedicated Vision API model.
        """
        if "ingredients" in result and isinstance(result["ingredients"], list):
            for ingredient in result["ingredients"]:
                if isinstance(ingredient, dict) and "box_2d" in ingredient:
                    del ingredient["box_2d"]
        return result

    def _enrich_with_nutrition(self, result: dict) -> dict:
        """
        Enriches the analysis result with nutrition data for each ingredient.
        Also calculates total nutrition across all ingredients.
        """
        food_origin = result.get("foodOrigin", "unknown")
        
        # Skip for error states
        error_names = ["Error Analyzing Food", "Not Food", "분석 오류"]
        if result.get("foodName", "") in error_names:
            return result
        
        # Initialize total nutrition accumulator
        total_nutrition = {
            "calories": 0,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "fiber": 0,
            "sodium": 0,
            "sugar": 0,
            "servingSize": "100g (total)",
            "dataSource": "Multiple Sources"
        }
        sources = set()
        has_any_nutrition = False
        
        # Per-ingredient nutrition lookup
        ingredients = result.get("ingredients", [])
        for ingredient in ingredients:
            if not isinstance(ingredient, dict):
                continue
            
            ing_name = ingredient.get("name", "")
            if not ing_name:
                continue
            
            # Lookup nutrition for this ingredient
            nutrition_data = lookup_nutrition(ing_name, food_origin)
            
            if nutrition_data and nutrition_data.get("calories") is not None:
                ingredient["nutrition"] = nutrition_data
                has_any_nutrition = True
                
                # Accumulate totals (safe addition with None handling)
                for key in ["calories", "protein", "carbs", "fat", "fiber", "sodium", "sugar"]:
                    if nutrition_data.get(key) is not None:
                        total_nutrition[key] = (total_nutrition.get(key) or 0) + float(nutrition_data[key])
                
                sources.add(nutrition_data.get("dataSource", "Unknown"))
                print(f"  ↳ {ing_name}: {nutrition_data.get('calories')} kcal ({nutrition_data.get('dataSource')})")
            else:
                print(f"  ↳ {ing_name}: No nutrition data found")
        
        # Set total nutrition if any data was found
        if has_any_nutrition:
            total_nutrition["dataSource"] = " + ".join(sources) if sources else "Unknown"
            result["nutrition"] = total_nutrition
            print(f"Total Nutrition: {total_nutrition['calories']:.1f} kcal from {len(sources)} source(s)")
        else:
            # Fallback: try main food name if no ingredient data
            name_variants = [result.get("foodName_en"), result.get("foodName"), result.get("canonicalFoodId", "").replace("_", " ")]
            for name in name_variants:
                if not name:
                    continue
                nutrition_data = lookup_nutrition(name, food_origin)
                if nutrition_data and nutrition_data.get("calories") is not None:
                    result["nutrition"] = nutrition_data
                    print(f"Nutrition Data ({nutrition_data.get('dataSource')}): fallback to '{name}'")
                    break
        
        return result

    def _sanitize_response(self, result: dict) -> dict:
        """
        App-level content sanitization (P2: Second layer defense).
        
        Defense-in-depth measures alongside Vertex AI's built-in safety filters:
        1. Length limits (prevent injection/overflow)
        2. URL/script pattern blocking
        3. Minimal profanity blocklist (platform filter handles most cases)
        """
        import re
        
        # Configuration
        MAX_TEXT_LENGTH = 500  # Max chars for user-facing text fields
        MAX_FOOD_NAME_LENGTH = 100
        
        # Dangerous patterns (injection prevention)
        DANGEROUS_PATTERNS = [
            r'https?://\S+',  # URLs
            r'<script.*?>.*?</script>',  # Script tags
            r'javascript:',  # JS protocol
            r'data:text/html',  # Data URIs
            r'on\w+\s*=',  # Event handlers (onclick, onerror, etc.)
        ]
        
        # Minimal profanity blocklist (rely on platform filter for comprehensive coverage)
        BLOCKLIST_PATTERNS = [
            r'\b(fuck|shit|bitch|asshole)\b',
            r'\b(nigger|faggot)\b',
        ]
        
        dangerous_regex = re.compile('|'.join(DANGEROUS_PATTERNS), re.IGNORECASE | re.DOTALL)
        blocklist_regex = re.compile('|'.join(BLOCKLIST_PATTERNS), re.IGNORECASE)
        
        def sanitize_text(text: str, max_length: int = MAX_TEXT_LENGTH) -> str:
            if not text or not isinstance(text, str):
                return text
            
            # Length limit
            if len(text) > max_length:
                text = text[:max_length] + "..."
                print(f"[Internal Log] Text truncated to {max_length} chars.")
            
            # Block dangerous patterns (URLs, scripts)
            if dangerous_regex.search(text):
                print(f"[Internal Log] Dangerous pattern detected, sanitizing.")
                text = dangerous_regex.sub("[링크 제거됨]", text)
            
            # Minimal profanity filter
            if blocklist_regex.search(text):
                print(f"[Internal Log] Blocklist pattern detected, sanitizing.")
                return "[내용 필터링됨]"
            
            return text
        
        # Sanitize user-facing text fields
        if "foodName" in result:
            result["foodName"] = sanitize_text(result["foodName"], MAX_FOOD_NAME_LENGTH)
        if "foodName_en" in result:
            result["foodName_en"] = sanitize_text(result["foodName_en"], MAX_FOOD_NAME_LENGTH)
        if "foodName_ko" in result:
            result["foodName_ko"] = sanitize_text(result["foodName_ko"], MAX_FOOD_NAME_LENGTH)
        if "raw_result" in result:
            result["raw_result"] = sanitize_text(result["raw_result"])
        if "translationCard" in result and result["translationCard"]:
            if "text" in result["translationCard"]:
                result["translationCard"]["text"] = sanitize_text(result["translationCard"]["text"])
        
        return result

    def analyze_food_json(self, food_image: Image.Image, allergy_info: str = "None", iso_current_country: str = "US"):
        """
        Analyzes the food image and returns a JSON object with safety status,
        ingredients, and food name, considering the user's allergy info.
        Also generates a translated allergy card based on the current country.
        """
        # Normalize allergen input for consistent AI judgment
        normalized_allergens = format_allergens_for_prompt(allergy_info)
        prompt = self._build_analysis_prompt(normalized_allergens, iso_current_country)
        
        # Define Schema for Structured Output (Strict Mode)
        response_schema = {
            "type": "OBJECT",
            "properties": {
                "foodName": {"type": "STRING"},
                "foodName_en": {"type": "STRING"},
                "foodName_ko": {"type": "STRING"},
                "canonicalFoodId": {"type": "STRING"},
                "foodOrigin": {"type": "STRING"},
                "safetyStatus": {"type": "STRING", "enum": ["SAFE", "CAUTION", "DANGER"]},
                "confidence": {"type": "INTEGER"},
                "ingredients": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "name": {"type": "STRING"},
                            "bbox": {
                                "type": "ARRAY",
                                "items": {"type": "INTEGER"}
                            },
                            "isAllergen": {"type": "BOOLEAN"}
                        },
                        "required": ["name", "bbox", "isAllergen"]
                    }
                },
                "translationCard": {
                    "type": "OBJECT",
                    "properties": {
                        "language": {"type": "STRING"},
                        "text": {"type": "STRING"},
                        "audio_query": {"type": "STRING"}
                    }
                },
                "raw_result": {"type": "STRING"}
            },
            "required": ["foodName", "ingredients", "safetyStatus"]
        }

        # Configure generation and safety
        generation_config = {
            "temperature": 0.2,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 4096,
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        # Safety Settings (P2: Balanced approach)
        # - BLOCK_LOW_AND_ABOVE: Block most inappropriate content
        # - Second layer filtering at app level via _sanitize_response()
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        }

        try:
            # Concurrency control: acquire semaphore to prevent thundering herd
            with FoodAnalyst._request_semaphore:
                vertex_image = self._prepare_vertex_image(food_image)
                
                # Add random jitter before request (0-500ms) to spread load
                jitter_ms = random.uniform(0, 500) / 1000
                time.sleep(jitter_ms)

                # Define Retry Policy for 429 (Resource Exhausted) with jitter
                def on_retry_error(exception):
                    """Callback to track retry attempts for monitoring."""
                    FoodAnalyst._retry_stats["total_retries"] += 1
                    if "429" in str(exception) or "ResourceExhausted" in str(type(exception).__name__):
                        FoodAnalyst._retry_stats["last_429_time"] = time.time()
                    print(f"[Internal Log] Retry triggered: {type(exception).__name__}")
                
                retry_policy = retry.Retry(
                    predicate=retry.if_exception_type(ResourceExhausted, ServiceUnavailable),
                    initial=2.0,
                    maximum=30.0,
                    multiplier=2.0,
                    timeout=60.0,
                    on_error=on_retry_error
                )

                print(f"Vertex AI: Sending request (jitter={jitter_ms:.3f}s, concurrent slots={FoodAnalyst._request_semaphore._value}/3)...")

                # [DEBUG] Log generation config details
                print(f"[API Debug] Model name: {self.model_name}")
                print(f"[API Debug] Has response_schema: {'response_schema' in generation_config}")
                print(f"[API Debug] Generation config keys: {list(generation_config.keys())}")

                try:
                    # [Primary Attempt]
                    response = retry_policy(self.model.generate_content)(
                        [prompt, vertex_image],
                        generation_config=generation_config,
                        safety_settings=safety_settings
                    )
                    print(f"[API Debug] ✓ Primary model response received")
                except Exception as e:
                    # [Fallback Logic]
                    # If primary model fails (404, 429, etc.), switch to backup
                    print(f"[Model Fallback] Primary model ({self.model_name}) failed: {e}")
                    print(f"[Model Fallback] Error type: {type(e).__name__}")
                    print(f"[Model Fallback] Full traceback:")
                    traceback.print_exc()
                    print("[Model Fallback] Switching to backup model: gemini-2.0-flash")
                    
                    try:
                        backup_model = GenerativeModel("gemini-2.0-flash")
                        # Reuse same config/safety settings
                        response = retry_policy(backup_model.generate_content)(
                            [prompt, vertex_image],
                            generation_config=generation_config,
                            safety_settings=safety_settings
                        )
                    except Exception as fallback_error:
                        print(f"[Model Fallback] Backup model also failed: {fallback_error}")
                        raise fallback_error  # Re-raise if both fail
            

            print(f"[Internal Log] Finish Reason: {response.candidates[0].finish_reason}")
            result = self._parse_ai_response(response.text)
            # result = self._strip_box2d(result)  # ENABLED: Keep bbox data from v3.0 prompt
            print(f"AI Response JSON: {json.dumps(result, indent=2)}")  # Debug log
            
            result = self._enrich_with_nutrition(result)
            result = self._sanitize_response(result)  # P2: App-level content filter
            
            # Attach model info for debugging/verification
            result["used_model"] = self.model_name
            
            return result
            
        except Exception as e:
            # Log internal error (NOT exposed to user)
            error_msg = str(e)
            print(f"[Internal Log] Analysis error: {error_msg}")
            print(f"[Internal Log] Retry stats: {FoodAnalyst._retry_stats}")
            
            # Determine user-friendly message (hide internal details)
            if "429" in error_msg or "Resource exhausted" in error_msg or "Quota" in error_msg:
                # UX: Include specific retry time guidance
                user_msg = "서버가 바쁩니다. 15~30초 후 다시 시도해주세요."
            elif "timeout" in error_msg.lower():
                user_msg = "분석 시간이 초과되었습니다. 다시 시도해주세요."
            else:
                user_msg = "이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요."
            
            # Return unified fallback schema (reuse existing method)
            return self._get_safe_fallback_response(user_msg)
