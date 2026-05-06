import os
import atexit
import time
import logging
from typing import Any, TypedDict
from google.api_core.exceptions import DeadlineExceeded, InternalServerError, ResourceExhausted, ServiceUnavailable
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
from backend.modules.analyst_core.label_merge import merge_label_extract_and_assessment
from backend.modules.analyst_core.label_parse import parse_label_extract_response
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
    build_label_assess_risk_schema,
    build_label_extract_response_schema,
)
from backend.modules.analyst_runtime.generation import (
    create_request_semaphore,
    generate_with_429_backoff,
    generate_with_retry_and_fallback,
    generate_with_semaphore,
)
from backend.modules.analyst_runtime.safety import build_default_safety_settings


logger = logging.getLogger("foodlens.analyst_runtime")

GEMINI_LABEL_MODEL_NAME_DEFAULT = "gemini-2.5-flash"
GEMINI_LABEL_FALLBACK_MODEL_NAME_DEFAULT = "gemini-2.5-flash-lite"
GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS_DEFAULT = 1536
GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS_DEFAULT = 768
GEMINI_BARCODE_ALLERGEN_MAX_OUTPUT_TOKENS_DEFAULT = 512
GEMINI_LABEL_FLASH_THINKING_BUDGET_DEFAULT = 0
GEMINI_LABEL_FLASH_LITE_THINKING_BUDGET_DEFAULT = 0
GEMINI_LABEL_PRO_THINKING_BUDGET_DEFAULT = 128
LABEL_USAGE_METADATA_FIELDS = (
    "prompt_token_count",
    "candidates_token_count",
    "total_token_count",
    "cached_content_token_count",
    "thoughts_token_count",
)


class LabelGenerationMetadata(TypedDict):
    model_name: str
    primary_model_name: str
    fallback_used: bool
    fallback_reason: str | None
    finish_reason: int | None
    thinking_budget: int
    usage_metadata: dict[str, int]


LABEL_PARSE_ERROR_FOOD_NAME = "Analysis Error"
LABEL_PARSE_ERROR_RAW_RESULT = "AI 응답을 처리할 수 없습니다. 다시 시도해주세요."
LABEL_FALLBACK_REASON_EXTRACT_TRANSIENT = "extract_primary_transient_error"
LABEL_FALLBACK_REASON_ASSESS_TRANSIENT = "assess_primary_transient_error"
LABEL_FALLBACK_REASON_EXTRACT_PARSE = "extract_parse_error"
LABEL_FALLBACK_REASON_ASSESS_PARSE = "assess_parse_error"
LABEL_FALLBACK_REASON_EXTRACT_MAX_TOKENS = "extract_max_tokens"
LABEL_FALLBACK_REASON_ASSESS_MAX_TOKENS = "assess_max_tokens"
LABEL_PARSE_UNAVAILABLE_FOOD_NAME_EN = "Label analysis needs review"
LABEL_PARSE_UNAVAILABLE_FOOD_NAME_KO = "라벨 분석 확인 필요"
LABEL_PARSE_UNAVAILABLE_MESSAGE_EN = "The label text could not be parsed reliably. Please review the ingredient list manually."
LABEL_PARSE_UNAVAILABLE_MESSAGE_KO = "라벨 문자를 안정적으로 해석하지 못했습니다. 성분표를 직접 확인해주세요."


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


def _read_env_positive_int(name: str, fallback: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return fallback
    normalized = raw_value.strip()
    if not normalized:
        return fallback
    if not normalized.isdigit():
        raise ValueError(f"{name} must be a positive integer")
    parsed_value = int(normalized)
    if parsed_value <= 0:
        raise ValueError(f"{name} must be a positive integer")
    return parsed_value


def _read_env_non_negative_int(name: str, fallback: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return fallback
    normalized = raw_value.strip()
    if not normalized:
        return fallback
    if not normalized.isdigit():
        raise ValueError(f"{name} must be a non-negative integer")
    return int(normalized)


def _read_env_non_empty_string(name: str, fallback: str) -> str:
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
    if not normalized:
        return fallback
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean value")


def _is_pro_model_name(model_name: str) -> bool:
    return "-pro" in model_name.strip().lower()


def _model_tier_name(model_name: str) -> str:
    normalized_model_name = model_name.strip().lower()
    if "-pro" in normalized_model_name:
        return "pro"
    if "flash-lite" in normalized_model_name:
        return "flash-lite"
    if "flash" in normalized_model_name:
        return "flash"
    return "unknown"


def _is_flash_lite_model_name(model_name: str) -> bool:
    return "flash-lite" in model_name.strip().lower()


def _is_flash_model_name(model_name: str) -> bool:
    normalized_model_name = model_name.strip().lower()
    return "flash" in normalized_model_name and not _is_flash_lite_model_name(normalized_model_name)


def _is_label_transient_generation_error(error: Exception) -> bool:
    if isinstance(error, (DeadlineExceeded, InternalServerError, ServiceUnavailable)):
        return True
    return False


def _is_label_parse_error(result: dict[str, Any]) -> bool:
    food_name = str(result.get("foodName", "")).strip()
    raw_result = str(result.get("raw_result", "")).strip()
    return food_name == LABEL_PARSE_ERROR_FOOD_NAME and raw_result == LABEL_PARSE_ERROR_RAW_RESULT


def _label_parse_unavailable_response(locale: str, used_model_name: str) -> dict[str, Any]:
    is_korean_locale = _is_korean_runtime_locale(locale)
    raw_result = LABEL_PARSE_UNAVAILABLE_MESSAGE_KO if is_korean_locale else LABEL_PARSE_UNAVAILABLE_MESSAGE_EN
    return {
        "foodName": LABEL_PARSE_UNAVAILABLE_FOOD_NAME_KO if is_korean_locale else LABEL_PARSE_UNAVAILABLE_FOOD_NAME_EN,
        "foodName_en": LABEL_PARSE_UNAVAILABLE_FOOD_NAME_EN,
        "foodName_ko": LABEL_PARSE_UNAVAILABLE_FOOD_NAME_KO,
        "raw_result_en": LABEL_PARSE_UNAVAILABLE_MESSAGE_EN,
        "raw_result_ko": LABEL_PARSE_UNAVAILABLE_MESSAGE_KO,
        "canonicalFoodId": "label_parse_unavailable",
        "foodOrigin": "unknown",
        "safetyStatus": "CAUTION",
        "confidence": 0,
        "ingredients": [],
        "nutrition": {
            "calories": None,
            "carbs": None,
            "protein": None,
            "fat": None,
            "sugar": None,
            "sodium": None,
            "fiber": None,
            "servingSize": None,
            "dataSource": "OCR_Label",
        },
        "translationCard": {"language": "Unknown", "text": None, "audio_query": None},
        "raw_result": raw_result,
        "used_model": used_model_name,
    }


def _select_label_used_model(current_model_name: str, next_model_name: str, fallback_model_name: str) -> str:
    if current_model_name == fallback_model_name:
        return current_model_name
    if next_model_name == fallback_model_name:
        return next_model_name
    return next_model_name


def _read_usage_metadata_value(metadata: object, field_name: str) -> int | None:
    raw_value: Any
    if isinstance(metadata, dict):
        raw_value = metadata.get(field_name)
    else:
        raw_value = getattr(metadata, field_name, None)
    if isinstance(raw_value, bool):
        return None
    if isinstance(raw_value, int):
        return raw_value
    return None


def _extract_usage_metadata(response: object) -> dict[str, int]:
    metadata = getattr(response, "usage_metadata", None)
    if metadata is None:
        return {}
    extracted: dict[str, int] = {}
    for field_name in LABEL_USAGE_METADATA_FIELDS:
        value = _read_usage_metadata_value(metadata, field_name)
        if value is not None:
            extracted[field_name] = value
    return extracted


def _build_label_observability_metadata(
    primary_model_name: str,
    used_model_name: str,
    fallback_used: bool,
    fallback_reason: str | None,
    finish_reasons: dict[str, int | None],
    thinking_budgets: dict[str, int],
    usage_metadata: dict[str, dict[str, int]],
    parse_metadata: dict[str, Any],
) -> dict[str, Any]:
    return {
        "_label_primary_model": primary_model_name,
        "_label_used_model": used_model_name,
        "_label_fallback_used": fallback_used,
        "_label_fallback_reason": fallback_reason,
        "_label_extract_finish_reason": finish_reasons.get("extract"),
        "_label_assess_finish_reason": finish_reasons.get("assess"),
        "_label_finish_reasons": dict(finish_reasons),
        "_label_thinking_budget": dict(thinking_budgets),
        "_label_usage": {
            call_name: dict(call_usage)
            for call_name, call_usage in usage_metadata.items()
        },
        "_label_usage_metadata": {
            call_name: dict(call_usage)
            for call_name, call_usage in usage_metadata.items()
        },
        "_label_parse_status": parse_metadata.get("status"),
        "_label_parse_repaired": parse_metadata.get("repaired") is True,
        "_label_repair_strategy": parse_metadata.get("repair_strategy"),
        "_label_repair_strategies": list(parse_metadata.get("repair_strategies", [])),
        "_label_parse_raw_text_length": parse_metadata.get("raw_text_length"),
        "_label_normalization_warnings": list(parse_metadata.get("normalization_warnings", [])),
        "_label_diagnostic_reason": parse_metadata.get("diagnostic_reason"),
    }


def _build_label_parse_metadata(
    status: str | None,
    repaired: bool,
    repair_strategy: str | None,
    repair_strategies: list[str],
    raw_text_length: int | None,
    normalization_warnings: list[str],
    diagnostic_reason: str | None,
) -> dict[str, Any]:
    return {
        "status": status,
        "repaired": repaired,
        "repair_strategy": repair_strategy,
        "repair_strategies": list(repair_strategies),
        "raw_text_length": raw_text_length,
        "normalization_warnings": list(normalization_warnings),
        "diagnostic_reason": diagnostic_reason,
    }


def _build_barcode_caution_result(
    ingredients: list[Any],
    normalized_locale: str,
    used_model: str,
) -> dict[str, Any]:
    unique_input: list[str] = []
    seen_input_names: set[str] = set()
    for ingredient in ingredients:
        normalized = str(ingredient).strip().lower()
        if normalized and normalized not in seen_input_names:
            seen_input_names.add(normalized)
            unique_input.append(str(ingredient).strip())

    error_message = (
        "알러지 분석이 불완전합니다. 성분표를 직접 확인해주세요."
        if _is_korean_runtime_locale(normalized_locale)
        else "The allergen analysis is incomplete. Please check the ingredient list directly."
    )
    return {
        "safetyStatus": "CAUTION",
        "coachMessage": error_message,
        "used_model": used_model,
        "prompt_version": BARCODE_INGREDIENTS_PROMPT_VERSION,
        "ingredients": [
            {"name": ingredient, "isAllergen": False, "riskReason": ""}
            for ingredient in unique_input
        ],
    }


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
        if _is_pro_model_name(self.model_name):
            raise ValueError("GEMINI_MODEL_NAME must not be a Pro model; Pro is allowed only for label fallback")
        self.label_model_name = _read_env_non_empty_string(
            "GEMINI_LABEL_MODEL_NAME",
            GEMINI_LABEL_MODEL_NAME_DEFAULT,
        )
        self.label_fallback_model_name = _read_env_non_empty_string(
            "GEMINI_LABEL_FALLBACK_MODEL_NAME",
            GEMINI_LABEL_FALLBACK_MODEL_NAME_DEFAULT,
        )
        self.label_fallback_enabled = _read_env_bool("GEMINI_LABEL_FALLBACK_ENABLED", False)
        self.label_pro_fallback_enabled = _read_env_bool("GEMINI_LABEL_PRO_FALLBACK_ENABLED", False)
        self.label_fallback_on_parse_error = _read_env_bool("GEMINI_LABEL_FALLBACK_ON_PARSE_ERROR", False)
        self.label_fallback_on_max_tokens = _read_env_bool("GEMINI_LABEL_FALLBACK_ON_MAX_TOKENS", False)
        if _is_pro_model_name(self.label_model_name):
            raise ValueError("GEMINI_LABEL_MODEL_NAME must not be a Pro model; use GEMINI_LABEL_FALLBACK_MODEL_NAME for Pro fallback")
        if (
            self.label_fallback_enabled
            and _is_pro_model_name(self.label_fallback_model_name)
            and not self.label_pro_fallback_enabled
        ):
            raise ValueError(
                "GEMINI_LABEL_PRO_FALLBACK_ENABLED must be 1 before GEMINI_LABEL_FALLBACK_MODEL_NAME can use a Pro model"
            )
        self.label_extract_max_output_tokens = _read_env_positive_int(
            "GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS",
            GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS_DEFAULT,
        )
        self.label_assess_max_output_tokens = _read_env_positive_int(
            "GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS",
            GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS_DEFAULT,
        )
        self.barcode_allergen_max_output_tokens = _read_env_positive_int(
            "GEMINI_BARCODE_ALLERGEN_MAX_OUTPUT_TOKENS",
            GEMINI_BARCODE_ALLERGEN_MAX_OUTPUT_TOKENS_DEFAULT,
        )
        self.label_flash_thinking_budget = _read_env_non_negative_int(
            "GEMINI_LABEL_FLASH_THINKING_BUDGET",
            GEMINI_LABEL_FLASH_THINKING_BUDGET_DEFAULT,
        )
        self.label_flash_lite_thinking_budget = _read_env_non_negative_int(
            "GEMINI_LABEL_FLASH_LITE_THINKING_BUDGET",
            GEMINI_LABEL_FLASH_LITE_THINKING_BUDGET_DEFAULT,
        )
        self.label_pro_thinking_budget = _read_env_positive_int(
            "GEMINI_LABEL_PRO_THINKING_BUDGET",
            GEMINI_LABEL_PRO_THINKING_BUDGET_DEFAULT,
        )
        logger.info(
            "[ModelDebug] model configuration",
            extra={
                "gemini_model_name_present": os.getenv("GEMINI_MODEL_NAME") is not None,
                "gemini_model_tier": _model_tier_name(self.model_name),
                "gemini_label_model_name_present": os.getenv("GEMINI_LABEL_MODEL_NAME") is not None,
                "gemini_label_model_tier": _model_tier_name(self.label_model_name),
                "gemini_label_fallback_model_name_present": os.getenv("GEMINI_LABEL_FALLBACK_MODEL_NAME") is not None,
                "gemini_label_fallback_model_tier": _model_tier_name(self.label_fallback_model_name),
                "gemini_label_fallback_enabled": self.label_fallback_enabled,
                "gemini_label_pro_fallback_enabled": self.label_pro_fallback_enabled,
            },
        )
        
        try:
            self.model = GenerativeModel(self.model_name)
            logger.info("[ModelDebug] primary GenerativeModel created")
        except Exception:
            logger.exception("[ModelDebug] primary GenerativeModel creation failed")
            raise

    def _configure_vertex_ai(self) -> None:
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
        logger.info(
            "[Credential] Vertex AI configuration",
            extra={
                "gcp_project_id_present": bool(project_id),
                "gcp_location_present": bool(location),
                "gcp_service_account_json_present": bool(service_account_json),
            },
        )

        if service_account_json:
            try:
                json.loads(service_account_json)
                with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
                    f.write(service_account_json)
                    FoodAnalyst._temp_cred_path = f.name

                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = FoodAnalyst._temp_cred_path
                logger.info(
                    "[Credential] service account credentials configured",
                    extra={"google_application_credentials_set": True},
                )
                atexit.register(FoodAnalyst._cleanup_temp_credentials)
            except json.JSONDecodeError as error:
                logger.exception("[Credential] service account JSON parsing failed")
                raise ValueError("GCP_SERVICE_ACCOUNT_JSON must contain valid JSON") from error
            except Exception:
                logger.exception("[Credential] credential setup failed")
                raise
        else:
            logger.warning("[Credential] GCP_SERVICE_ACCOUNT_JSON missing")

        if not project_id:
            logger.warning("[Credential] GCP_PROJECT_ID missing")
        else:
            vertexai.init(project=project_id, location=location)
            logger.info(
                "[Credential] Vertex AI initialized",
                extra={
                    "gcp_project_id_present": True,
                    "gcp_location_present": bool(location),
                },
            )

    @staticmethod
    def _cleanup_temp_credentials() -> None:
        """Cleans up the temporary credentials file on process exit."""
        if FoodAnalyst._temp_cred_path and os.path.exists(FoodAnalyst._temp_cred_path):
            try:
                os.remove(FoodAnalyst._temp_cred_path)
                logger.info("[Credential] temporary credentials file cleaned up")
            except Exception:
                logger.exception("[Credential] temporary credentials cleanup failed")

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

    def _build_label_generation_metadata(
        self,
        response: object,
        primary_model_name: str,
        used_model_name: str,
        fallback_reason: str | None,
    ) -> LabelGenerationMetadata:
        return {
            "model_name": used_model_name,
            "primary_model_name": primary_model_name,
            "fallback_used": used_model_name != primary_model_name,
            "fallback_reason": fallback_reason,
            "finish_reason": self._extract_finish_reason(response),
            "thinking_budget": self._select_label_thinking_budget(used_model_name),
            "usage_metadata": _extract_usage_metadata(response),
        }

    def _select_label_thinking_budget(self, model_name: str) -> int:
        if _is_pro_model_name(model_name):
            return self.label_pro_thinking_budget
        if _is_flash_lite_model_name(model_name):
            return self.label_flash_lite_thinking_budget
        if _is_flash_model_name(model_name):
            return self.label_flash_thinking_budget
        return self.label_flash_thinking_budget

    def _build_label_generation_config_for_model(
        self,
        generation_config: dict[str, Any],
        model_name: str,
    ) -> dict[str, Any]:
        model_generation_config = dict(generation_config)
        model_generation_config["thinking_config"] = {
            "include_thoughts": False,
            "thinking_budget": self._select_label_thinking_budget(model_name),
        }
        return model_generation_config

    def _can_use_label_fallback(self, reason: str) -> bool:
        if not self.label_fallback_enabled:
            return False
        if self.label_fallback_model_name == self.label_model_name:
            return False
        if reason in {LABEL_FALLBACK_REASON_EXTRACT_PARSE, LABEL_FALLBACK_REASON_ASSESS_PARSE}:
            return self.label_fallback_on_parse_error
        if reason in {LABEL_FALLBACK_REASON_EXTRACT_MAX_TOKENS, LABEL_FALLBACK_REASON_ASSESS_MAX_TOKENS}:
            return self.label_fallback_on_max_tokens
        return reason in {LABEL_FALLBACK_REASON_EXTRACT_TRANSIENT, LABEL_FALLBACK_REASON_ASSESS_TRANSIENT}

    def _can_retry_label_response_with_fallback(self, metadata: LabelGenerationMetadata, reason: str) -> bool:
        if metadata["model_name"] != self.label_model_name:
            return False
        return self._can_use_label_fallback(reason)

    def _generate_label_fallback_content(
        self,
        contents: list[Any],
        generation_config: dict[str, Any],
        safety_settings: dict[str, Any],
        fallback_reason: str,
    ) -> tuple[Any, LabelGenerationMetadata]:
        fallback_model = GenerativeModel(self.label_fallback_model_name)
        fallback_generation_config = self._build_label_generation_config_for_model(
            generation_config,
            self.label_fallback_model_name,
        )
        response = generate_with_429_backoff(
            model=fallback_model,
            contents=contents,
            generation_config=fallback_generation_config,
            safety_settings=safety_settings,
            semaphore=FoodAnalyst._request_semaphore,
            max_attempts=1,
        )
        return response, self._build_label_generation_metadata(
            response,
            self.label_model_name,
            self.label_fallback_model_name,
            fallback_reason,
        )

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

    def _generate_label_content(
        self,
        model: GenerativeModel,
        contents: list[Any],
        generation_config: dict[str, Any],
        safety_settings: dict[str, Any],
        transient_fallback_reason: str,
    ) -> tuple[Any, LabelGenerationMetadata]:
        primary_generation_config = self._build_label_generation_config_for_model(
            generation_config,
            self.label_model_name,
        )
        try:
            response = generate_with_429_backoff(
                model=model,
                contents=contents,
                generation_config=primary_generation_config,
                safety_settings=safety_settings,
                semaphore=FoodAnalyst._request_semaphore,
                max_attempts=3,
            )
            return response, self._build_label_generation_metadata(
                response,
                self.label_model_name,
                self.label_model_name,
                None,
            )
        except ResourceExhausted:
            raise
        except Exception as error:
            if not _is_label_transient_generation_error(error):
                raise
            if not self._can_use_label_fallback(transient_fallback_reason):
                raise
            return self._generate_label_fallback_content(
                contents,
                generation_config,
                safety_settings,
                transient_fallback_reason,
            )

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
        prompt = self._build_label_prompt(normalized_allergens, normalized_locale, iso_current_country)
        
        response_schema = build_label_extract_response_schema()

        generation_config = {
            "temperature": 0.1, # OCR 정밀도를 위해 낮은 temperature 사용
            "max_output_tokens": self.label_extract_max_output_tokens,
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        assess_generation_config = {
            "temperature": 0.1,
            "max_output_tokens": self.label_assess_max_output_tokens,
            "response_mime_type": "application/json",
            "response_schema": build_label_assess_risk_schema(),
        }

        safety_settings = build_default_safety_settings()

        extract_elapsed_ms = 0
        assess_elapsed_ms = 0
        extract_truncated = False
        label_provider_chargeable: bool = False
        label_used_model = self.label_model_name
        label_fallback_used = False
        label_fallback_reason: str | None = None
        label_finish_reasons: dict[str, int | None] = {}
        label_thinking_budgets: dict[str, int] = {}
        label_usage_metadata: dict[str, dict[str, int]] = {}
        label_extract_parse_repaired = False
        label_extract_repair_strategy: str | None = None
        label_extract_parse_status: str | None = None
        label_extract_repair_strategies: list[str] = []
        label_extract_normalization_warnings: list[str] = []
        label_extract_raw_text_length: int | None = None
        label_diagnostic_reason: str | None = None

        try:
            vertex_image = self._prepare_vertex_image(label_image)

            # 라벨 분석 기본 모델은 Flash 계열이고, Pro는 명시 플래그가 켜진 fallback에서만 사용한다.
            model = GenerativeModel(self.label_model_name)
            extract_contents = [prompt, vertex_image]
            extract_started_at = time.perf_counter()
            response, extract_metadata = self._generate_label_content(
                model=model,
                contents=extract_contents,
                generation_config=generation_config,
                safety_settings=safety_settings,
                transient_fallback_reason=LABEL_FALLBACK_REASON_EXTRACT_TRANSIENT,
            )
            label_used_model = _select_label_used_model(
                label_used_model,
                extract_metadata["model_name"],
                self.label_fallback_model_name,
            )
            label_fallback_used = label_fallback_used or extract_metadata["fallback_used"]
            label_fallback_reason = extract_metadata["fallback_reason"] or label_fallback_reason
            label_finish_reasons["extract"] = extract_metadata["finish_reason"]
            label_thinking_budgets["extract"] = extract_metadata["thinking_budget"]
            label_usage_metadata["extract"] = extract_metadata["usage_metadata"]
            label_provider_chargeable = True
            extract_truncated = extract_metadata["finish_reason"] == self._MAX_TOKENS_FINISH_REASON
            if self._can_retry_label_response_with_fallback(
                extract_metadata,
                LABEL_FALLBACK_REASON_EXTRACT_MAX_TOKENS,
            ):
                response, extract_metadata = self._generate_label_fallback_content(
                    extract_contents,
                    generation_config,
                    safety_settings,
                    LABEL_FALLBACK_REASON_EXTRACT_MAX_TOKENS,
                )
                label_used_model = _select_label_used_model(
                    label_used_model,
                    extract_metadata["model_name"],
                    self.label_fallback_model_name,
                )
                label_fallback_used = label_fallback_used or extract_metadata["fallback_used"]
                label_fallback_reason = extract_metadata["fallback_reason"] or label_fallback_reason
                label_finish_reasons["extract"] = extract_metadata["finish_reason"]
                label_thinking_budgets["extract"] = extract_metadata["thinking_budget"]
                label_usage_metadata["extract"] = extract_metadata["usage_metadata"]
                extract_truncated = extract_metadata["finish_reason"] == self._MAX_TOKENS_FINISH_REASON

            extract_parse_result = parse_label_extract_response(response.text, normalized_locale)
            extract_result = extract_parse_result["result"]
            label_extract_parse_status = extract_parse_result["status"]
            label_extract_parse_repaired = extract_parse_result["status"] == "repaired"
            label_extract_repair_strategy = extract_parse_result["repair_strategy"]
            label_extract_repair_strategies = extract_parse_result["repair_strategies"]
            label_extract_normalization_warnings = extract_parse_result["normalization_warnings"]
            label_extract_raw_text_length = extract_parse_result["raw_text_length"]
            extract_result = self._sanitize_response(extract_result)
            if (
                extract_parse_result["status"] == "failed"
                and self._can_retry_label_response_with_fallback(
                    extract_metadata,
                    LABEL_FALLBACK_REASON_EXTRACT_PARSE,
                )
            ):
                response, extract_metadata = self._generate_label_fallback_content(
                    extract_contents,
                    generation_config,
                    safety_settings,
                    LABEL_FALLBACK_REASON_EXTRACT_PARSE,
                )
                label_used_model = _select_label_used_model(
                    label_used_model,
                    extract_metadata["model_name"],
                    self.label_fallback_model_name,
                )
                label_fallback_used = label_fallback_used or extract_metadata["fallback_used"]
                label_fallback_reason = extract_metadata["fallback_reason"] or label_fallback_reason
                label_finish_reasons["extract"] = extract_metadata["finish_reason"]
                label_thinking_budgets["extract"] = extract_metadata["thinking_budget"]
                label_usage_metadata["extract"] = extract_metadata["usage_metadata"]
                extract_truncated = extract_metadata["finish_reason"] == self._MAX_TOKENS_FINISH_REASON
                extract_parse_result = parse_label_extract_response(response.text, normalized_locale)
                extract_result = extract_parse_result["result"]
                label_extract_parse_status = extract_parse_result["status"]
                label_extract_parse_repaired = extract_parse_result["status"] == "repaired"
                label_extract_repair_strategy = extract_parse_result["repair_strategy"]
                label_extract_repair_strategies = extract_parse_result["repair_strategies"]
                label_extract_normalization_warnings = extract_parse_result["normalization_warnings"]
                label_extract_raw_text_length = extract_parse_result["raw_text_length"]
                extract_result = self._sanitize_response(extract_result)
            if extract_parse_result["status"] == "failed":
                label_diagnostic_reason = LABEL_FALLBACK_REASON_EXTRACT_PARSE
                extract_result = _label_parse_unavailable_response(normalized_locale, label_used_model)
            extract_elapsed_ms = int((time.perf_counter() - extract_started_at) * 1000)
            if label_extract_parse_repaired:
                extract_result["_label_parse_repaired"] = True
                extract_result["_label_repair_strategy"] = label_extract_repair_strategy
                extract_result["_label_repair_strategies"] = list(label_extract_repair_strategies)
                extract_result["_label_parse_status"] = label_extract_parse_status
                extract_result["_label_parse_raw_text_length"] = label_extract_raw_text_length
                extract_result["_label_normalization_warnings"] = list(label_extract_normalization_warnings)
                extract_result["_label_partial"] = True
            elif label_extract_parse_status:
                extract_result["_label_parse_status"] = label_extract_parse_status
                extract_result["_label_parse_raw_text_length"] = label_extract_raw_text_length
                extract_result["_label_normalization_warnings"] = list(label_extract_normalization_warnings)
            if label_diagnostic_reason:
                extract_result["_label_diagnostic_reason"] = label_diagnostic_reason
            if extract_truncated:
                extract_result["safetyStatus"] = "CAUTION"
                extract_result["_label_partial"] = True
                extract_result["_label_truncated"] = True

            assess_failed = False
            ingredients = extract_result.get("ingredients", [])
            ingredient_names = [
                str(item.get("name", "")).strip()
                for item in ingredients
                if isinstance(item, dict) and str(item.get("name", "")).strip()
            ]

            if ingredient_names and assess_enabled:
                assess_started_at = time.perf_counter()
                assess_truncated = False
                try:
                    assess_prompt = self._build_label_assess_prompt(
                        normalized_allergens,
                        ingredient_names,
                        normalized_locale,
                        iso_current_country,
                    )
                    assess_contents = [assess_prompt]
                    assess_response, assess_metadata = self._generate_label_content(
                        model=model,
                        contents=assess_contents,
                        generation_config=assess_generation_config,
                        safety_settings=safety_settings,
                        transient_fallback_reason=LABEL_FALLBACK_REASON_ASSESS_TRANSIENT,
                    )
                    label_used_model = _select_label_used_model(
                        label_used_model,
                        assess_metadata["model_name"],
                        self.label_fallback_model_name,
                    )
                    label_fallback_used = label_fallback_used or assess_metadata["fallback_used"]
                    label_fallback_reason = assess_metadata["fallback_reason"] or label_fallback_reason
                    label_finish_reasons["assess"] = assess_metadata["finish_reason"]
                    label_thinking_budgets["assess"] = assess_metadata["thinking_budget"]
                    label_usage_metadata["assess"] = assess_metadata["usage_metadata"]
                    assess_truncated = assess_metadata["finish_reason"] == self._MAX_TOKENS_FINISH_REASON
                    if self._can_retry_label_response_with_fallback(
                        assess_metadata,
                        LABEL_FALLBACK_REASON_ASSESS_MAX_TOKENS,
                    ):
                        assess_response, assess_metadata = self._generate_label_fallback_content(
                            assess_contents,
                            assess_generation_config,
                            safety_settings,
                            LABEL_FALLBACK_REASON_ASSESS_MAX_TOKENS,
                        )
                        label_used_model = _select_label_used_model(
                            label_used_model,
                            assess_metadata["model_name"],
                            self.label_fallback_model_name,
                        )
                        label_fallback_used = label_fallback_used or assess_metadata["fallback_used"]
                        label_fallback_reason = assess_metadata["fallback_reason"] or label_fallback_reason
                        label_finish_reasons["assess"] = assess_metadata["finish_reason"]
                        label_thinking_budgets["assess"] = assess_metadata["thinking_budget"]
                        label_usage_metadata["assess"] = assess_metadata["usage_metadata"]
                        assess_truncated = assess_metadata["finish_reason"] == self._MAX_TOKENS_FINISH_REASON
                    label_provider_chargeable = True
                    assess_result = self._parse_ai_response(assess_response.text)
                    assess_result = self._sanitize_response(assess_result)
                    if (
                        _is_label_parse_error(assess_result)
                        and self._can_retry_label_response_with_fallback(
                            assess_metadata,
                            LABEL_FALLBACK_REASON_ASSESS_PARSE,
                        )
                    ):
                        assess_response, assess_metadata = self._generate_label_fallback_content(
                            assess_contents,
                            assess_generation_config,
                            safety_settings,
                            LABEL_FALLBACK_REASON_ASSESS_PARSE,
                        )
                        label_used_model = _select_label_used_model(
                            label_used_model,
                            assess_metadata["model_name"],
                            self.label_fallback_model_name,
                        )
                        label_fallback_used = label_fallback_used or assess_metadata["fallback_used"]
                        label_fallback_reason = assess_metadata["fallback_reason"] or label_fallback_reason
                        label_finish_reasons["assess"] = assess_metadata["finish_reason"]
                        label_thinking_budgets["assess"] = assess_metadata["thinking_budget"]
                        label_usage_metadata["assess"] = assess_metadata["usage_metadata"]
                        assess_truncated = assess_metadata["finish_reason"] == self._MAX_TOKENS_FINISH_REASON
                        assess_result = self._parse_ai_response(assess_response.text)
                        assess_result = self._sanitize_response(assess_result)
                    if _is_label_parse_error(assess_result):
                        raise ValueError("Label assess parse failed")

                    extract_result = merge_label_extract_and_assessment(
                        extract_result,
                        assess_result,
                        normalized_locale,
                    )
                    if extract_truncated or assess_truncated:
                        current_status = str(extract_result.get("safetyStatus", "")).strip().upper()
                        if current_status != "DANGER":
                            extract_result["safetyStatus"] = "CAUTION"
                        extract_result["_label_partial"] = True
                        extract_result["_label_truncated"] = True

                except Exception as assess_error:
                    assess_failed = True
                    logger.warning(
                        "[LabelAssess] failed",
                        extra={"error_type": type(assess_error).__name__},
                    )
                    extract_result = merge_label_extract_and_assessment(
                        extract_result,
                        None,
                        normalized_locale,
                    )
                    extract_result["safetyStatus"] = "CAUTION"
                    extract_result["raw_result"] = (
                        str(extract_result.get("raw_result", "")).strip()
                        + " 알러지 위험 판정이 불완전하여 주의(CAUTION)로 처리했습니다."
                    ).strip()
                    if assess_truncated:
                        extract_result["_label_partial"] = True
                        extract_result["_label_truncated"] = True
                finally:
                    assess_elapsed_ms = int((time.perf_counter() - assess_started_at) * 1000)
            elif not ingredient_names:
                extract_result = merge_label_extract_and_assessment(
                    extract_result,
                    None,
                    normalized_locale,
                )
                extract_result["safetyStatus"] = "CAUTION"
                extract_result["raw_result"] = (
                    str(extract_result.get("raw_result", "")).strip()
                    + " 성분 추출이 충분하지 않아 주의(CAUTION)로 처리했습니다."
                ).strip()
                extract_result["_label_partial"] = True
            else:
                extract_result = merge_label_extract_and_assessment(
                    extract_result,
                    None,
                    normalized_locale,
                )
                extract_result["_label_degraded"] = True

            result = extract_result
            result["used_model"] = label_used_model
            result["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            if label_extract_parse_repaired:
                result["_label_parse_repaired"] = True
                result["_label_repair_strategy"] = label_extract_repair_strategy
                result["_label_repair_strategies"] = list(label_extract_repair_strategies)
                result["_label_parse_status"] = label_extract_parse_status
                result["_label_parse_raw_text_length"] = label_extract_raw_text_length
                result["_label_normalization_warnings"] = list(label_extract_normalization_warnings)
                result["_label_partial"] = True
                current_status = str(result.get("safetyStatus", "")).strip().upper()
                if current_status != "DANGER":
                    result["safetyStatus"] = "CAUTION"
                if extract_truncated:
                    result["_label_truncated"] = True
            elif label_extract_parse_status:
                result["_label_parse_status"] = label_extract_parse_status
                result["_label_parse_raw_text_length"] = label_extract_raw_text_length
                result["_label_normalization_warnings"] = list(label_extract_normalization_warnings)
            if label_diagnostic_reason:
                result["_label_diagnostic_reason"] = label_diagnostic_reason
            result.update(
                _build_label_observability_metadata(
                    self.label_model_name,
                    label_used_model,
                    label_fallback_used,
                    label_fallback_reason,
                    label_finish_reasons,
                    label_thinking_budgets,
                    label_usage_metadata,
                    _build_label_parse_metadata(
                        label_extract_parse_status,
                        label_extract_parse_repaired,
                        label_extract_repair_strategy,
                        label_extract_repair_strategies,
                        label_extract_raw_text_length,
                        label_extract_normalization_warnings,
                        label_diagnostic_reason,
                    ),
                )
            )
            result["_label_timings"] = {
                "extract_ms": extract_elapsed_ms,
                "assess_ms": assess_elapsed_ms,
            }
            result["_label_chargeable"] = label_provider_chargeable
            if assess_failed:
                result["_label_partial"] = True
            if extract_truncated:
                current_status = str(result.get("safetyStatus", "")).strip().upper()
                if current_status != "DANGER":
                    result["safetyStatus"] = "CAUTION"
            
            return result
            
        except ResourceExhausted as e:
            logger.warning(
                "[LabelOCR] quota exhausted",
                extra={"error_type": type(e).__name__},
            )
            fallback = self._get_safe_fallback_response("요청이 많아 라벨 분석이 지연되고 있습니다. 잠시 후 다시 시도해주세요.")
            fallback["used_model"] = label_used_model
            fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            fallback.update(
                _build_label_observability_metadata(
                    self.label_model_name,
                    label_used_model,
                    label_fallback_used,
                    label_fallback_reason,
                    label_finish_reasons,
                    label_thinking_budgets,
                    label_usage_metadata,
                    _build_label_parse_metadata(
                        label_extract_parse_status,
                        label_extract_parse_repaired,
                        label_extract_repair_strategy,
                        label_extract_repair_strategies,
                        label_extract_raw_text_length,
                        label_extract_normalization_warnings,
                        label_diagnostic_reason,
                    ),
                )
            )
            fallback["_label_timings"] = {
                "extract_ms": 0,
                "assess_ms": 0,
            }
            fallback["_label_chargeable"] = False
            fallback["_label_error_type"] = "quota_exhausted_429"
            return fallback
        except Exception as e:
            logger.warning(
                "[LabelOCR] failed",
                extra={"error_type": type(e).__name__},
            )
            if extract_truncated:
                fallback = self._get_safe_fallback_response("라벨 분석 결과가 길어 일부만 처리되었습니다. 성분표를 직접 확인해주세요.")
                fallback["safetyStatus"] = "CAUTION"
                fallback["used_model"] = label_used_model
                fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
                fallback.update(
                    _build_label_observability_metadata(
                        self.label_model_name,
                        label_used_model,
                        label_fallback_used,
                        label_fallback_reason,
                        label_finish_reasons,
                        label_thinking_budgets,
                        label_usage_metadata,
                        _build_label_parse_metadata(
                            label_extract_parse_status,
                            label_extract_parse_repaired,
                            label_extract_repair_strategy,
                            label_extract_repair_strategies,
                            label_extract_raw_text_length,
                            label_extract_normalization_warnings,
                            label_diagnostic_reason,
                        ),
                    )
                )
                fallback["_label_timings"] = {
                    "extract_ms": extract_elapsed_ms,
                    "assess_ms": assess_elapsed_ms,
                }
                fallback["_label_chargeable"] = label_provider_chargeable
                fallback["_label_partial"] = True
                fallback["_label_truncated"] = True
                return fallback
            fallback = self._get_safe_fallback_response("라벨 분석 중 오류가 발생했습니다.")
            fallback["used_model"] = label_used_model
            fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            fallback.update(
                _build_label_observability_metadata(
                    self.label_model_name,
                    label_used_model,
                    label_fallback_used,
                    label_fallback_reason,
                    label_finish_reasons,
                    label_thinking_budgets,
                    label_usage_metadata,
                    _build_label_parse_metadata(
                        label_extract_parse_status,
                        label_extract_parse_repaired,
                        label_extract_repair_strategy,
                        label_extract_repair_strategies,
                        label_extract_raw_text_length,
                        label_extract_normalization_warnings,
                        label_diagnostic_reason,
                    ),
                )
            )
            fallback["_label_timings"] = {
                "extract_ms": extract_elapsed_ms,
                "assess_ms": assess_elapsed_ms,
            }
            fallback["_label_chargeable"] = label_provider_chargeable
            fallback["_label_error_type"] = f"analysis_exception:{type(e).__name__}"
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
            "max_output_tokens": self.barcode_allergen_max_output_tokens,
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
            allergen_truncated = self._extract_finish_reason(response) == self._MAX_TOKENS_FINISH_REASON
            if allergen_truncated:
                return _build_barcode_caution_result(ingredients, normalized_locale, self.model_name)
            
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
            if not unique_ingredients:
                return _build_barcode_caution_result(ingredients, normalized_locale, self.model_name)
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
            return _build_barcode_caution_result(ingredients, normalized_locale, self.model_name)
