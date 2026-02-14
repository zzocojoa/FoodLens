import os
import atexit
import threading
import time
import vertexai
from vertexai.generative_models import GenerativeModel, Image as VertexImage
from PIL import Image
import json
import io
import tempfile
from backend.modules.analyst_core.allergen_utils import (
    format_allergens_for_prompt,
)
from backend.modules.analyst_core.postprocess import enrich_with_nutrition
from backend.modules.analyst_core.prompts import (
    LABEL_2PASS_PROMPT_VERSION,
    LABEL_PROMPT_VERSION,
    build_analysis_prompt,
    build_barcode_ingredients_prompt,
    build_label_assess_prompt,
    build_label_prompt,
)
from backend.modules.analyst_core.response_utils import (
    get_safe_fallback_response,
    parse_ai_response,
    sanitize_response,
    strip_box2d,
)
from backend.modules.analyst_core.schemas import (
    build_barcode_allergen_schema,
    build_food_response_schema,
    build_label_response_schema,
)
from backend.modules.analyst_runtime.generation import (
    generate_with_retry_and_fallback,
    generate_with_semaphore,
)
from backend.modules.analyst_runtime.safety import build_default_safety_settings
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
        self.label_model_name = os.getenv("GEMINI_LABEL_MODEL_NAME") or "gemini-2.5-pro"
        
        # [DEBUG] Log model initialization details
        print(f"[Model Debug] GEMINI_MODEL_NAME env: {os.getenv('GEMINI_MODEL_NAME')}")
        print(f"[Model Debug] Using model: {self.model_name}")
        print(f"[Model Debug] GEMINI_LABEL_MODEL_NAME env: {os.getenv('GEMINI_LABEL_MODEL_NAME')}")
        print(f"[Model Debug] Using label model: {self.label_model_name}")
        
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
        # === END DEBUG ===

        if service_account_json:
            try:
                # Validate JSON format before writing
                import json
                json.loads(service_account_json)
                print("[Credential Debug] ✓ Service account JSON parsing successful")
                
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

    def _build_label_prompt(self, allergy_info: str, locale: str, iso_current_country: str) -> str:
        """Constructs the nutrition label OCR prompt."""
        return build_label_prompt(allergy_info, locale, iso_current_country)

    def _build_label_assess_prompt(
        self,
        normalized_allergens: str,
        ingredients: list[str],
        locale: str,
        iso_current_country: str,
    ) -> str:
        return build_label_assess_prompt(normalized_allergens, ingredients, locale, iso_current_country)

    def analyze_label_json(
        self,
        label_image: Image.Image,
        allergy_info: str = "None",
        iso_current_country: str = "US",
        locale: str | None = None,
        assess_enabled: bool = True,
    ):
        """
        Analyzes a nutrition label image using OCR and extracts nutritional info.
        """
        normalized_allergens = format_allergens_for_prompt(allergy_info)
        normalized_locale = (locale or "en-US").strip() or "en-US"
        prompt = self._build_label_prompt(normalized_allergens, normalized_locale, iso_current_country)
        
        # Schema for OCR (similar to food but focused on nutrition)
        response_schema = build_label_response_schema()

        generation_config = {
            "temperature": 0.1, # Low temperature for OCR precision
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        assess_generation_config = {
            "temperature": 0.1,
            "response_mime_type": "application/json",
            "response_schema": build_barcode_allergen_schema(),
        }

        safety_settings = build_default_safety_settings()

        try:
            vertex_image = self._prepare_vertex_image(label_image)

            # Label analysis model is configurable via GEMINI_LABEL_MODEL_NAME.
            model = GenerativeModel(self.label_model_name)
            extract_started_at = time.perf_counter()
            response = generate_with_semaphore(
                model=model,
                contents=[prompt, vertex_image],
                generation_config=generation_config,
                safety_settings=safety_settings,
                semaphore=FoodAnalyst._request_semaphore,
            )
            extract_elapsed_ms = int((time.perf_counter() - extract_started_at) * 1000)
            
            extract_result = self._parse_ai_response(response.text)
            extract_result = self._sanitize_response(extract_result)

            assess_elapsed_ms = 0
            assess_failed = False
            ingredients = extract_result.get("ingredients", [])
            ingredient_names = [
                str(item.get("name", "")).strip()
                for item in ingredients
                if isinstance(item, dict) and str(item.get("name", "")).strip()
            ]

            if ingredient_names and assess_enabled:
                assess_started_at = time.perf_counter()
                try:
                    assess_prompt = self._build_label_assess_prompt(
                        normalized_allergens,
                        ingredient_names,
                        normalized_locale,
                        iso_current_country,
                    )
                    assess_response = generate_with_semaphore(
                        model=model,
                        contents=[assess_prompt],
                        generation_config=assess_generation_config,
                        safety_settings=safety_settings,
                        semaphore=FoodAnalyst._request_semaphore,
                    )
                    assess_result = self._parse_ai_response(assess_response.text)
                    assess_result = self._sanitize_response(assess_result)

                    assess_ingredients = assess_result.get("ingredients", [])
                    assess_map = {}
                    for assess_item in assess_ingredients:
                        if not isinstance(assess_item, dict):
                            continue
                        key = str(assess_item.get("name", "")).strip().lower()
                        if not key:
                            continue
                        assess_map[key] = assess_item

                    merged_ingredients = []
                    for ingredient in ingredients:
                        if not isinstance(ingredient, dict):
                            continue
                        key = str(ingredient.get("name", "")).strip().lower()
                        assess_item = assess_map.get(key)
                        if assess_item:
                            ingredient["isAllergen"] = bool(assess_item.get("isAllergen", False))
                            ingredient["riskReason"] = assess_item.get("riskReason")
                        else:
                            ingredient["isAllergen"] = bool(ingredient.get("isAllergen", False))
                        merged_ingredients.append(ingredient)

                    extract_result["ingredients"] = merged_ingredients
                    assess_status = assess_result.get("safetyStatus")
                    if assess_status in ("SAFE", "CAUTION", "DANGER"):
                        extract_result["safetyStatus"] = assess_status
                    coach_message = assess_result.get("coachMessage")
                    if coach_message and not extract_result.get("raw_result"):
                        extract_result["raw_result"] = str(coach_message)

                except Exception as assess_error:
                    assess_failed = True
                    print(f"[Label Assess Error] {assess_error}")
                    extract_result["safetyStatus"] = "CAUTION"
                    extract_result["raw_result"] = (
                        str(extract_result.get("raw_result", "")).strip()
                        + " 알러지 위험 판정이 불완전하여 주의(CAUTION)로 처리했습니다."
                    ).strip()
                finally:
                    assess_elapsed_ms = int((time.perf_counter() - assess_started_at) * 1000)
            elif not ingredient_names:
                extract_result["safetyStatus"] = "CAUTION"
                extract_result["raw_result"] = (
                    str(extract_result.get("raw_result", "")).strip()
                    + " 성분 추출이 충분하지 않아 주의(CAUTION)로 처리했습니다."
                ).strip()
            else:
                extract_result["_label_degraded"] = True

            result = extract_result
            result["used_model"] = self.label_model_name
            result["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            result["_label_timings"] = {
                "extract_ms": extract_elapsed_ms,
                "assess_ms": assess_elapsed_ms,
            }
            if assess_failed:
                result["_label_partial"] = True
            
            return result
            
        except Exception as e:
            print(f"[Label OCR Error] {e}")
            traceback.print_exc()
            fallback = self._get_safe_fallback_response("라벨 분석 중 오류가 발생했습니다.")
            fallback["used_model"] = self.label_model_name
            fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            fallback["_label_timings"] = {
                "extract_ms": 0,
                "assess_ms": 0,
            }
            return fallback

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
        safety_settings = build_default_safety_settings()

        try:
            vertex_image = self._prepare_vertex_image(food_image)
            response = generate_with_retry_and_fallback(
                primary_model=self.model,
                primary_model_name=self.model_name,
                fallback_model_name="gemini-2.0-flash",
                contents=[prompt, vertex_image],
                generation_config=generation_config,
                safety_settings=safety_settings,
                semaphore=FoodAnalyst._request_semaphore,
                retry_stats=FoodAnalyst._retry_stats,
            )
            

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

        safety_settings = build_default_safety_settings()

        try:
            print(f"\n[Allergen Analysis] Analyzing {len(ingredients)} ingredients against: {normalized_allergens}")
            
            response = generate_with_semaphore(
                model=self.model,
                contents=[prompt],  # Text-only, no image
                generation_config=generation_config,
                safety_settings=safety_settings,
                semaphore=FoodAnalyst._request_semaphore,
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
