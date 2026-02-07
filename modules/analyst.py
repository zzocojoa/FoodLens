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

    def __init__(self):
        self._configure_vertex_ai()
        self.model_name = os.getenv("GEMINI_MODEL_NAME", "gemini-1.5-flash")
        
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
        # [System Prompt: Food Lens Expert Engine v3.2 - Complete Response Edition]

        ## 1. Role & Identity
        You are an expert nutritionist, food safety AI, and the core analysis engine for the iOS app 'Food Lens'. You will analyze the uploaded image through a 3-stage reasoning logic (Dish Identification -> Contextual Probability -> Texture Verification) and output the result as a single-layer JSON (Flat JSON).

        ## 2. Mandatory Analysis Logic
        1. **Dish Identification**: Determine the cuisine origin (korean, western, etc.) and specific name based on table setting and utensils.
        2. **Main Protein/Ingredient Detection (REQUIRED)**: Always identify the MAIN protein or dominant ingredient first (meat, seafood, tofu, etc.). Name the dish based on this.
        3. **Contextual Probability**: Adjust the probability of visual ingredients based on the standard recipe of the identified dish.
        4. **Texture Verification**: Verify detailed textures such as muscle fibers (meat), leaf veins (vegetables), and gloss (processed foods).

        ## 3. Constraints & Input Data
        - **Input Variables**: User allergy info `{allergy_info}`, Current ISO country code `{iso_current_country}`.
        
        - **Visual Verification Rule (CRITICAL - NO HALLUCINATION)**:
          - ⚠️ ONLY identify ingredients that are CLEARLY VISIBLE in the image
          - ❌ DO NOT guess or hallucinate ingredients based on common recipes
          - ❌ DO NOT assume ingredients exist because they are "typically" in a dish
          - ✅ If you cannot visually confirm an ingredient, DO NOT include it
        
        - **Allergen Detection Rule (CONSERVATIVE)**:
          - isAllergen: true ONLY if BOTH conditions are met:
            1. The ingredient is VISUALLY CONFIRMED in the image (not guessed)
            2. AND the ingredient matches user's allergy_info: `{allergy_info}`
          - ❌ NEVER mark isAllergen: true for guessed/uncertain ingredients
          - If uncertain, mark isAllergen: false (err on the side of caution for false positives)
        
        - **Naming Rule (엄격 준수)**: 
          - Use ONLY standard proper nouns. NO modifiers or descriptions allowed.
          - ❌ FORBIDDEN: "Unknown Dish", "Unknown", "Amuse-bouche", "Appetizer", "Main Dish", "Entree", "Platter"
          - ❌ FORBIDDEN descriptive names: "Gnocchi with Chicken Wings", "Spicy Ramen"
          - ✅ ALWAYS name based on the MAIN visible protein/ingredient (e.g., "Pork Belly", "Grilled Chicken", "Bibimbap")
          - If no clear main dish, name the most prominent visible ingredient (e.g., "Mushroom Plate", "Vegetable Medley")
        
        - **safetyStatus Rule (MANDATORY ENUM)**:
          - Must be EXACTLY one of: "SAFE", "CAUTION", "DANGER"
          - SAFE: No allergens detected for this user
          - CAUTION: Possible allergens or uncertain ingredients
          - DANGER: Confirmed allergen present (isAllergen: true exists)
        
        - **Coordinate Rule**: All Bounding Boxes must use normalized coordinates [ymin, xmin, ymax, xmax] (0-1000 scale).
        - **MANDATORY**: `bbox` field is REQUIRED for every ingredient. If invisible, use [0,0,0,0]. DO NOT OMIT THIS FIELD.
        - **Translation**: Generate a polite allergy warning in the language of `{iso_current_country}`.
        - **Response Cleanliness Rule (CRITICAL)**:
          - translationCard.text must be CONCISE (max 150 characters)
          - DO NOT add unnecessary whitespace, newlines, or padding
          - End JSON cleanly - NO trailing characters after the closing }}
          - Output ONLY valid JSON, nothing else

        ## 4. Output Format (Flat JSON Only) - ALL FIELDS MANDATORY
        All fields must be at the root level (no nested objects, except for lists).
        
        Return ONLY a valid JSON object with ALL of these fields:
        {{
           "foodName": "Main Dish Name (NEVER use 'Unknown')",
           "foodName_en": "English name of the dish",
           "foodName_ko": "Korean name of the dish",
           "canonicalFoodId": "lowercase_underscore_id",
           "foodOrigin": "korean|western|japanese|chinese|etc",
           "confidence": 85,
           "safetyStatus": "SAFE|CAUTION|DANGER",
           "ingredients": [
                {{
                  "name": "Ingredient Name",
                  "bbox": [100, 200, 300, 400],
                  "isAllergen": false,
                  "riskReason": "Visible ingredient"
                }}
            ],
           "translationCard": {{
               "language": "ko",
               "text": "Short allergy warning (max 150 chars)",
               "audio_query": "TTS version"
           }}
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
        
        # Step 0: Normalize excessive newlines (prevent JSON parsing failures)
        import re
        text = re.sub(r'\n{3,}', '\n', text)  # 3+ consecutive newlines -> 1
        text = re.sub(r'\\n{3,}', '\\n', text)  # Escaped \n spam -> single \n
        
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
