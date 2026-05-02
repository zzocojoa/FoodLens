import atexit
import logging
import os
import time
from typing import Any, TypedDict
from google.api_core.exceptions import ResourceExhausted
import vertexai
from vertexai.generative_models import GenerativeModel, Image as VertexImage
from PIL import Image
import json
import io
import tempfile
from backend.modules.analyst_core.allergen_utils import format_allergens_for_prompt
from backend.modules.analyst_core.postprocess import enrich_with_nutrition
from backend.modules.analyst_core.prompts import (
    ANALYSIS_PROMPT_VERSION,
    BARCODE_INGREDIENTS_PROMPT_VERSION,
    LABEL_2PASS_PROMPT_VERSION,
    LABEL_PROMPT_VERSION,
)
from backend.modules.analyst_core.prompts import (
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
    build_food_job_response_schema,
    build_food_response_schema,
    build_label_response_schema,
)
from backend.modules.analyst_runtime.generation import (
    create_request_semaphore,
    generate_with_429_backoff,
    generate_with_retry_and_fallback,
    generate_with_semaphore,
)
from backend.modules.analyst_runtime.safety import build_default_safety_settings
import traceback


logger = logging.getLogger("foodlens.analyst_runtime")


LABEL_PRIMARY_MODEL_DEFAULT = "gemini-2.5-flash"
LABEL_PRO_FALLBACK_MODEL_DEFAULT = "gemini-2.5-pro"


class ProviderUsageRecord(TypedDict, total=False):
    provider: str
    route: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int
    thoughts_tokens: int
    total_tokens: int
    source: str


def _read_usage_field(metadata: object, field_name: str) -> object:
    if isinstance(metadata, dict):
        return metadata.get(field_name)
    return getattr(metadata, field_name, None)


def _read_usage_int(metadata: object, field_names: tuple[str, ...]) -> int | None:
    for field_name in field_names:
        raw_value = _read_usage_field(metadata, field_name)
        if raw_value is None or isinstance(raw_value, bool):
            continue
        try:
            parsed_value = int(raw_value)
        except (TypeError, ValueError):
            continue
        if parsed_value >= 0:
            return parsed_value
    return None


def extract_provider_usage_record(
    response: object,
    *,
    route: str,
    model_name: str,
) -> ProviderUsageRecord | None:
    metadata = getattr(response, "usage_metadata", None)
    if metadata is None:
        return None

    prompt_tokens = _read_usage_int(metadata, ("prompt_token_count", "prompt_tokens", "input_tokens"))
    completion_tokens = _read_usage_int(
        metadata,
        ("candidates_token_count", "completion_tokens", "output_tokens"),
    )
    cached_tokens = _read_usage_int(metadata, ("cached_content_token_count", "cached_tokens"))
    thoughts_tokens = _read_usage_int(metadata, ("thoughts_token_count", "thought_tokens", "reasoning_tokens"))
    total_tokens = _read_usage_int(metadata, ("total_token_count", "total_tokens"))

    if total_tokens is None:
        additive_counts = [
            value
            for value in (prompt_tokens, completion_tokens, thoughts_tokens)
            if value is not None
        ]
        if additive_counts:
            total_tokens = sum(additive_counts)

    if not any(
        value is not None and value > 0
        for value in (prompt_tokens, completion_tokens, cached_tokens, thoughts_tokens, total_tokens)
    ):
        return None

    usage_record: ProviderUsageRecord = {
        "provider": "google_vertex_ai",
        "route": route,
        "model": model_name,
        "source": "provider_usage_metadata",
    }
    if prompt_tokens is not None:
        usage_record["prompt_tokens"] = prompt_tokens
    if completion_tokens is not None:
        usage_record["completion_tokens"] = completion_tokens
    if cached_tokens is not None:
        usage_record["cached_tokens"] = cached_tokens
    if thoughts_tokens is not None:
        usage_record["thoughts_tokens"] = thoughts_tokens
    if total_tokens is not None:
        usage_record["total_tokens"] = total_tokens
    return usage_record


def _read_env_str(name: str, fallback: str) -> str:
    raw_value = os.getenv(name)
    if raw_value is None:
        return fallback
    normalized = raw_value.strip()
    if not normalized:
        return fallback
    return normalized


def _read_env_bool(name: str, fallback: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return fallback
    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be one of 1,true,yes,on,0,false,no,off")


def _is_pro_model_name(model_name: str) -> bool:
    return "pro" in model_name.strip().lower()


def _resolve_label_primary_model_name() -> str:
    explicit_primary = os.getenv("GEMINI_LABEL_PRIMARY_MODEL_NAME")
    legacy_primary = os.getenv("GEMINI_LABEL_MODEL_NAME")
    candidate = (explicit_primary or legacy_primary or LABEL_PRIMARY_MODEL_DEFAULT).strip()
    if not candidate:
        return LABEL_PRIMARY_MODEL_DEFAULT
    if _is_pro_model_name(candidate) and not _read_env_bool("GEMINI_LABEL_ALLOW_PRO_PRIMARY", False):
        logger.warning(
            "[LabelModelPolicy] pro primary blocked",
            extra={"requested_model": candidate, "selected_model": LABEL_PRIMARY_MODEL_DEFAULT},
        )
        return LABEL_PRIMARY_MODEL_DEFAULT
    return candidate


def _resolve_label_fallback_model_name(primary_model_name: str) -> str:
    fallback_model_name = _read_env_str("GEMINI_LABEL_FALLBACK_MODEL_NAME", LABEL_PRO_FALLBACK_MODEL_DEFAULT)
    if fallback_model_name == primary_model_name:
        return ""
    return fallback_model_name


def _normalize_runtime_locale(locale: str | None) -> str:
    if not locale:
        return "en-US"

    normalized = locale.strip().lower()
    if normalized.startswith("ko"):
        return "ko-KR"
    if normalized.startswith("en"):
        return "en-US"
    if normalized.startswith("ja"):
        return "ja-JP"
    if normalized.startswith("zh"):
        return "zh-Hans"
    if normalized.startswith("th"):
        return "th-TH"
    if normalized.startswith("vi"):
        return "vi-VN"
    return "en-US"


def _is_korean_runtime_locale(locale: str | None) -> bool:
    return _normalize_runtime_locale(locale).lower().startswith("ko")


class FoodAnalyst:
    # Class-level storage for temp credential file path (for cleanup)
    _temp_cred_path: str | None = None
    
    # Concurrency control: limit simultaneous Vertex AI requests
    # Prevents thundering herd on 429 recovery
    _request_semaphore = create_request_semaphore()
    
    # Retry tracking for operational monitoring
    _retry_stats = {"total_retries": 0, "last_429_time": None, "consecutive_429": 0, "last_used_model": None}
    _MAX_TOKENS_FINISH_REASON = 2
    _MAX_TOKENS_RETRY_MULTIPLIER = 2
    _MAX_OUTPUT_TOKENS_UPPER_BOUND = 8192

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
        self.label_model_name = _resolve_label_primary_model_name()
        self.label_fallback_model_name = _resolve_label_fallback_model_name(self.label_model_name)
        self.label_pro_fallback_enabled = _read_env_bool("GEMINI_LABEL_PRO_FALLBACK_ENABLED", False)
        
        # [DEBUG] Log model initialization details
        print(f"[Model Debug] GEMINI_MODEL_NAME env: {os.getenv('GEMINI_MODEL_NAME')}")
        print(f"[Model Debug] Using model: {self.model_name}")
        print(f"[Model Debug] GEMINI_LABEL_MODEL_NAME env: {os.getenv('GEMINI_LABEL_MODEL_NAME')}")
        print(f"[Model Debug] Using label model: {self.label_model_name}")
        print(f"[Model Debug] GEMINI_LABEL_PRIMARY_MODEL_NAME env: {os.getenv('GEMINI_LABEL_PRIMARY_MODEL_NAME')}")
        print(f"[Model Debug] GEMINI_LABEL_FALLBACK_MODEL_NAME env: {os.getenv('GEMINI_LABEL_FALLBACK_MODEL_NAME')}")
        print(f"[Model Debug] Label Pro fallback enabled: {self.label_pro_fallback_enabled}")
        
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

    def _extract_finish_reason(self, response: object) -> int | None:
        try:
            candidates = getattr(response, "candidates", None)
            if not candidates:
                return None
            finish_reason = getattr(candidates[0], "finish_reason", None)
            return int(finish_reason) if finish_reason is not None else None
        except Exception:
            return None

    def _generate_food_analysis_response(
        self,
        food_image: Image.Image,
        prompt: str,
        generation_config: dict[str, Any],
        safety_settings: dict[str, Any],
    ) -> Any:
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
        finish_reason = self._extract_finish_reason(response)
        logger.info("[FoodAnalysis] generation finished", extra={"finish_reason": finish_reason})

        if finish_reason != self._MAX_TOKENS_FINISH_REASON:
            return response

        retry_generation_config = dict(generation_config)
        current_max_tokens = int(generation_config.get("max_output_tokens", 4096))
        retry_generation_config["max_output_tokens"] = min(
            current_max_tokens * self._MAX_TOKENS_RETRY_MULTIPLIER,
            self._MAX_OUTPUT_TOKENS_UPPER_BOUND,
        )
        logger.warning(
            "[FoodAnalysis] retrying after max tokens",
            extra={"max_output_tokens": retry_generation_config["max_output_tokens"]},
        )
        return generate_with_retry_and_fallback(
            primary_model=self.model,
            primary_model_name=self.model_name,
            fallback_model_name="gemini-2.0-flash",
            contents=[prompt, vertex_image],
            generation_config=retry_generation_config,
            safety_settings=safety_settings,
            semaphore=FoodAnalyst._request_semaphore,
            retry_stats=FoodAnalyst._retry_stats,
        )

    def _build_food_generation_config(self, response_schema: dict[str, Any]) -> dict[str, Any]:
        return {
            "temperature": 0.2,
            "top_p": 0.95,
            "top_k": 40,
            "max_output_tokens": 4096,
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

    def _build_food_analysis_request(
        self,
        allergy_info: str,
        iso_current_country: str,
        response_schema: dict[str, Any],
    ) -> tuple[str, dict[str, Any], dict[str, Any]]:
        normalized_allergens = format_allergens_for_prompt(allergy_info)
        prompt = self._build_analysis_prompt(normalized_allergens, iso_current_country)
        generation_config = self._build_food_generation_config(response_schema)
        safety_settings = build_default_safety_settings()
        return prompt, generation_config, safety_settings

    def _build_food_fallback(self, user_message: str) -> dict[str, Any]:
        fallback = self._get_safe_fallback_response(user_message)
        fallback["used_model"] = FoodAnalyst._retry_stats.get("last_used_model") or self.model_name
        fallback["prompt_version"] = ANALYSIS_PROMPT_VERSION
        return fallback

    def _finalize_food_result(self, result: dict[str, Any]) -> dict[str, Any]:
        result["used_model"] = FoodAnalyst._retry_stats.get("last_used_model") or self.model_name
        result["prompt_version"] = ANALYSIS_PROMPT_VERSION
        return result

    def _run_food_analysis(
        self,
        food_image: Image.Image,
        allergy_info: str,
        iso_current_country: str,
        response_schema: dict[str, Any],
    ) -> dict[str, Any]:
        prompt, generation_config, safety_settings = self._build_food_analysis_request(
            allergy_info,
            iso_current_country,
            response_schema,
        )
        response = self._generate_food_analysis_response(
            food_image,
            prompt,
            generation_config,
            safety_settings,
        )
        return self._parse_ai_response(response.text)

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

    def _run_label_analysis_with_model(
        self,
        label_image: Image.Image,
        normalized_allergens: str,
        normalized_locale: str,
        iso_current_country: str,
        assess_enabled: bool,
        model_name: str,
        fallback_model_used: bool,
    ) -> dict[str, Any]:
        prompt = self._build_label_prompt(normalized_allergens, normalized_locale, iso_current_country)
        response_schema = build_label_response_schema()

        generation_config = {
            "temperature": 0.1,
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        assess_generation_config = {
            "temperature": 0.1,
            "response_mime_type": "application/json",
            "response_schema": build_barcode_allergen_schema(),
        }

        safety_settings = build_default_safety_settings()
        vertex_image = self._prepare_vertex_image(label_image)
        model = GenerativeModel(model_name)
        label_usage_records: list[ProviderUsageRecord] = []

        extract_started_at = time.perf_counter()
        response = generate_with_429_backoff(
            model=model,
            contents=[prompt, vertex_image],
            generation_config=generation_config,
            safety_settings=safety_settings,
            semaphore=FoodAnalyst._request_semaphore,
            max_attempts=3,
        )
        extract_elapsed_ms = int((time.perf_counter() - extract_started_at) * 1000)
        extract_usage_record = extract_provider_usage_record(
            response,
            route="label_extract",
            model_name=model_name,
        )
        if extract_usage_record is not None:
            label_usage_records.append(extract_usage_record)

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
                assess_response = generate_with_429_backoff(
                    model=model,
                    contents=[assess_prompt],
                    generation_config=assess_generation_config,
                    safety_settings=safety_settings,
                    semaphore=FoodAnalyst._request_semaphore,
                    max_attempts=3,
                )
                assess_usage_record = extract_provider_usage_record(
                    assess_response,
                    route="label_assess",
                    model_name=model_name,
                )
                if assess_usage_record is not None:
                    label_usage_records.append(assess_usage_record)
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
            extract_result["safetyStatus"] = "CAUTION"
            extract_result["raw_result"] = (
                str(extract_result.get("raw_result", "")).strip()
                + " 알러지 위험 판정을 생략하여 주의(CAUTION)로 처리했습니다."
            ).strip()
            extract_result["_label_degraded"] = True

        extract_result["used_model"] = model_name
        extract_result["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
        extract_result["_label_timings"] = {
            "extract_ms": extract_elapsed_ms,
            "assess_ms": assess_elapsed_ms,
        }
        if label_usage_records:
            extract_result["_label_usage"] = label_usage_records
        extract_result["_label_chargeable"] = True
        if fallback_model_used:
            extract_result["_label_pro_fallback_used"] = _is_pro_model_name(model_name)
        if assess_failed:
            extract_result["_label_partial"] = True
        return extract_result

    def _should_try_label_pro_fallback(self, error: Exception) -> bool:
        if isinstance(error, ResourceExhausted):
            return False
        if not self.label_pro_fallback_enabled:
            return False
        if not self.label_fallback_model_name:
            return False
        return _is_pro_model_name(self.label_fallback_model_name)

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
        normalized_locale = _normalize_runtime_locale(locale)

        try:
            return self._run_label_analysis_with_model(
                label_image,
                normalized_allergens,
                normalized_locale,
                iso_current_country,
                assess_enabled,
                self.label_model_name,
                False,
            )
        except ResourceExhausted as e:
            print(f"[Label OCR Error] {e}")
            traceback.print_exc()
            fallback = self._get_safe_fallback_response("요청이 많아 라벨 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요.")
            fallback["used_model"] = self.label_model_name
            fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            fallback["_label_timings"] = {
                "extract_ms": 0,
                "assess_ms": 0,
            }
            fallback["_label_chargeable"] = False
            fallback["_label_error_type"] = "quota_exhausted_429"
            return fallback
        except Exception as e:
            if self._should_try_label_pro_fallback(e):
                logger.warning(
                    "[LabelModelPolicy] primary label model failed; trying pro fallback",
                    extra={
                        "primary_model": self.label_model_name,
                        "fallback_model": self.label_fallback_model_name,
                        "error_type": type(e).__name__,
                    },
                )
                try:
                    return self._run_label_analysis_with_model(
                        label_image,
                        normalized_allergens,
                        normalized_locale,
                        iso_current_country,
                        assess_enabled,
                        self.label_fallback_model_name,
                        True,
                    )
                except ResourceExhausted as fallback_resource_error:
                    print(f"[Label OCR Error] {fallback_resource_error}")
                    traceback.print_exc()
                    fallback = self._get_safe_fallback_response(
                        "요청이 많아 라벨 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
                    )
                    fallback["used_model"] = self.label_fallback_model_name
                    fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
                    fallback["_label_timings"] = {
                        "extract_ms": 0,
                        "assess_ms": 0,
                    }
                    fallback["_label_chargeable"] = False
                    fallback["_label_error_type"] = "quota_exhausted_429"
                    return fallback
                except Exception as fallback_error:
                    logger.warning(
                        "[LabelModelPolicy] pro fallback failed",
                        extra={
                            "primary_model": self.label_model_name,
                            "fallback_model": self.label_fallback_model_name,
                            "error_type": type(fallback_error).__name__,
                        },
                    )
            print(f"[Label OCR Error] {e}")
            traceback.print_exc()
            fallback = self._get_safe_fallback_response("라벨 분석 중 오류가 발생했습니다.")
            fallback["used_model"] = self.label_model_name
            fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            fallback["_label_timings"] = {
                "extract_ms": 0,
                "assess_ms": 0,
            }
            fallback["_label_chargeable"] = False
            return fallback

    def analyze_food_json(self, food_image: Image.Image, allergy_info: str = "None", iso_current_country: str = "US"):
        """
        Analyzes the food image and returns a JSON object with safety status,
        ingredients, and food name, considering the user's allergy info.
        Also generates a translated allergy card based on the current country.
        """
        response_schema = build_food_response_schema()

        try:
            result = self._run_food_analysis(
                food_image,
                allergy_info,
                iso_current_country,
                response_schema,
            )
            # result = self._strip_box2d(result)  # ENABLED: Keep bbox data from v3.0 prompt
            print(f"AI Response JSON: {json.dumps(result, indent=2)}")  # Debug log
            
            result = self._enrich_with_nutrition(result)
            result = self._sanitize_response(result)  # P2: App-level content filter
            return self._finalize_food_result(result)
            
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
            
            return self._build_food_fallback(user_msg)

    def analyze_food_job_json(self, food_image: Image.Image, allergy_info: str, iso_current_country: str) -> dict:
        response_schema = build_food_job_response_schema()

        try:
            result = self._run_food_analysis(
                food_image,
                allergy_info,
                iso_current_country,
                response_schema,
            )
            result = self._sanitize_response(result)
            return self._finalize_food_result(result)
        except Exception as error:
            error_msg = str(error)
            print(f"[Internal Log] Async analysis error: {error_msg}")
            return self._build_food_fallback("이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요.")

    def analyze_barcode_ingredients(
        self,
        ingredients: list,
        allergy_info: str = "None",
        locale: str | None = None,
    ) -> dict:
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
        normalized_locale = _normalize_runtime_locale(locale)
        
        # If no allergies or no ingredients, skip API call entirely
        if normalized_allergens == "None" or not ingredients:
            safe_message = (
                "등록된 알러지 성분이 감지되지 않았습니다. 안심하고 드세요."
                if _is_korean_runtime_locale(normalized_locale)
                else "No registered allergens were detected. Enjoy with confidence."
            )
            return {
                "safetyStatus": "SAFE",
                "coachMessage": safe_message,
                "used_model": None,
                "prompt_version": None,
                "ingredients": [
                    {"name": ing, "isAllergen": False, "riskReason": ""} 
                    for ing in ingredients
                ]
            }
        
        prompt = build_barcode_ingredients_prompt(normalized_allergens, ingredients, normalized_locale)

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

            result["used_model"] = self.model_name
            result["prompt_version"] = BARCODE_INGREDIENTS_PROMPT_VERSION
            
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

            error_message = (
                "알러지 분석 중 오류가 발생했습니다. 성분표를 직접 확인해주세요."
                if _is_korean_runtime_locale(normalized_locale)
                else "An allergen analysis error occurred. Please check the ingredient list directly."
            )
            return {
                "safetyStatus": "CAUTION",
                "coachMessage": error_message,
                "used_model": self.model_name,
                "prompt_version": BARCODE_INGREDIENTS_PROMPT_VERSION,
                "ingredients": [
                    {"name": ing, "isAllergen": False, "riskReason": ""} 
                    for ing in unique_input
                ]
            }
