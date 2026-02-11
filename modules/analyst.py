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
from modules.analyst_core.allergen_utils import (
    format_allergens_for_prompt,
    get_language_for_country,
    normalize_allergens,
)
from modules.analyst_core.postprocess import enrich_with_nutrition
from modules.analyst_core.prompts import (
    build_analysis_prompt,
    build_barcode_ingredients_prompt,
    build_label_prompt,
)
from modules.analyst_core.response_utils import (
    get_safe_fallback_response,
    parse_ai_response,
    sanitize_response,
    strip_box2d,
)
from modules.analyst_core.schemas import (
    build_barcode_allergen_schema,
    build_food_response_schema,
    build_label_response_schema,
)
from google.api_core import retry
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
import traceback

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
        return build_analysis_prompt(allergy_info, iso_current_country)

    def _prepare_vertex_image(self, pil_image: Image.Image) -> VertexImage:
        """Converts PIL image to Vertex AI format."""
        img_byte_arr = io.BytesIO()
        pil_image.save(img_byte_arr, format='JPEG')
        return VertexImage.from_bytes(img_byte_arr.getvalue())

    def _parse_ai_response(self, response_text: str) -> dict:
        return parse_ai_response(response_text)

    def _get_safe_fallback_response(self, user_message: str) -> dict:
        return get_safe_fallback_response(user_message)

    def _strip_box2d(self, result: dict) -> dict:
        return strip_box2d(result)

    def _enrich_with_nutrition(self, result: dict) -> dict:
        return enrich_with_nutrition(result)

    def _sanitize_response(self, result: dict) -> dict:
        return sanitize_response(result)

    def _build_label_prompt(self, allergy_info: str) -> str:
        """Constructs the nutrition label OCR prompt."""
        return build_label_prompt(allergy_info)

    def analyze_label_json(self, label_image: Image.Image, allergy_info: str = "None", iso_current_country: str = "US"):
        """
        Analyzes a nutrition label image using OCR and extracts nutritional info.
        """
        normalized_allergens = format_allergens_for_prompt(allergy_info)
        prompt = self._build_label_prompt(normalized_allergens)
        
        # Schema for OCR (similar to food but focused on nutrition)
        response_schema = build_label_response_schema()

        generation_config = {
            "temperature": 0.1, # Low temperature for OCR precision
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        safety_settings = {
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        }

        try:
            with FoodAnalyst._request_semaphore:
                vertex_image = self._prepare_vertex_image(label_image)
                
                # Using 2.0 Flash for speed and OCR capability
                model = GenerativeModel("gemini-2.0-flash")
                
                response = model.generate_content(
                    [prompt, vertex_image],
                    generation_config=generation_config,
                    safety_settings=safety_settings
                )
            
            result = self._parse_ai_response(response.text)
            result = self._sanitize_response(result)
            result["used_model"] = "gemini-2.0-flash-ocr"
            
            return result
            
        except Exception as e:
            print(f"[Label OCR Error] {e}")
            traceback.print_exc()
            return self._get_safe_fallback_response("라벨 분석 중 오류가 발생했습니다.")

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
        response_schema = build_food_response_schema()

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

    def analyze_barcode_ingredients(self, ingredients: list, allergy_info: str = "None") -> dict:
        """
        Analyzes a list of ingredient names (from barcode API) against the user's
        allergy profile using Gemini. Text-only call (no image).
        
        Returns:
            {
                "safetyStatus": "SAFE" | "CAUTION" | "DANGER",
                "ingredients": [
                    {"name": "밀가루", "isAllergen": true, "riskReason": "Contains wheat/gluten"},
                    {"name": "설탕", "isAllergen": false, "riskReason": ""}
                ]
            }
        """
        normalized_allergens = format_allergens_for_prompt(allergy_info)
        
        # If no allergies or no ingredients, skip API call entirely
        if normalized_allergens == "None" or not ingredients:
            return {
                "safetyStatus": "SAFE",
                "coachMessage": "등록된 알러지 성분이 감지되지 않았습니다. 안심하고 드세요.",
                "ingredients": [
                    {"name": ing, "isAllergen": False, "riskReason": ""} 
                    for ing in ingredients
                ]
            }
        
        prompt = build_barcode_ingredients_prompt(normalized_allergens, ingredients)

        response_schema = build_barcode_allergen_schema()

        generation_config = {
            "temperature": 0.1,  # Low temperature for precise allergen matching
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        safety_settings = {
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        }

        try:
            print(f"\n[Allergen Analysis] Analyzing {len(ingredients)} ingredients against: {normalized_allergens}")
            
            with FoodAnalyst._request_semaphore:
                response = self.model.generate_content(
                    [prompt],  # Text-only, no image
                    generation_config=generation_config,
                    safety_settings=safety_settings
                )
            
            result = self._parse_ai_response(response.text)
            
            # 8. Deduplication (Case-insensitive)
            # Gemini might occasionally hallucinate or return redundant entries
            raw_ingredients = result.get("ingredients", [])
            unique_ingredients = []
            seen_names = set()
            for ing in raw_ingredients:
                if not isinstance(ing, dict): continue
                name = ing.get("name", "").strip()
                if not name: continue
                normalized = name.lower()
                if normalized not in seen_names:
                    seen_names.add(normalized)
                    unique_ingredients.append(ing)
            result["ingredients"] = unique_ingredients

            print(f"[Allergen Analysis] Result: safetyStatus={result.get('safetyStatus')}")
            
            # Log flagged allergens
            flagged = [i for i in result.get("ingredients", []) if i.get("isAllergen")]
            if flagged:
                print(f"[Allergen Analysis] ⚠️  Flagged: {[f['name'] for f in flagged]}")
            else:
                print(f"[Allergen Analysis] ✓ No allergens detected.")
            
            return result
            
        except Exception as e:
            print(f"[Allergen Analysis] Error: {e}")
            traceback.print_exc()
            # Fail-safe: return CAUTION if analysis fails (don't risk saying SAFE)
            # Apply deduplication to input ingredients as well
            unique_input = []
            seen_input_names = set()
            for ing in ingredients:
                normalized = ing.strip().lower()
                if normalized and normalized not in seen_input_names:
                    seen_input_names.add(normalized)
                    unique_input.append(ing.strip())

            return {
                "safetyStatus": "CAUTION",
                "coachMessage": "알러지 분석 중 오류가 발생했습니다. 성분표를 직접 확인해주세요.",
                "ingredients": [
                    {"name": ing, "isAllergen": False, "riskReason": ""} 
                    for ing in unique_input
                ]
            }
