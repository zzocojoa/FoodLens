import argparse
import atexit
import hashlib
import io
import json
import os
import re
import signal
import statistics
import sys
import tempfile
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from types import FrameType
from typing import Any, Callable, Final

from google import genai
from google.genai import types
from dotenv import load_dotenv
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.modules.analyst_core.allergen_utils import format_allergens_for_prompt
from backend.modules.analyst_core.prompts import LABEL_2PASS_PROMPT_VERSION
from backend.modules.analyst_core.prompts import build_label_assess_prompt, build_label_prompt
from backend.modules.analyst_core.response_utils import parse_ai_response, sanitize_response
from backend.modules.analyst_core import schemas as analyst_schemas
from backend.modules.analyst_runtime import food_analyst as analyst_runtime
from backend.modules.analyst_runtime.food_analyst import (
    GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS_DEFAULT,
    GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS_DEFAULT,
    _normalize_runtime_locale,
)
from backend.modules.analyst_runtime.safety import build_default_safety_settings


@dataclass(frozen=True)
class LabelEvalConfig:
    repo_root: Path
    manifest_path: Path
    output_root: Path
    models: list[str]
    allergy_info: str
    iso_current_country: str
    locale: str
    extract_max_output_tokens: int
    assess_max_output_tokens: int
    timeout_seconds: int
    sample_limit: int
    max_paid_calls: int
    fail_on_regression: bool
    gate_thresholds: "LabelEvalGateThresholds"
    client: genai.Client


@dataclass(frozen=True)
class LabelEvalGateThresholds:
    min_success_rate: float
    min_expected_status_match_rate: float
    min_ingredients_pass_rate: float
    min_nutrition_keys_pass_rate: float
    min_allergen_recall_rate: float
    min_risk_ingredient_recall_rate: float
    max_max_tokens_rate: float
    max_p95_elapsed_ms: int | None


@dataclass(frozen=True)
class LabelEvalSetMetrics:
    expected: list[str]
    actual: list[str]
    true_positive: list[str]
    false_positive: list[str]
    false_negative: list[str]
    precision: float
    recall: float


@dataclass(frozen=True)
class LabelEvalSample:
    sample_id: str
    image_path: Path
    expected_safety_status: str
    min_ingredients_count: int
    required_nutrition_keys: list[str]
    human_label_status: str
    human_label_provenance: dict[str, str]
    expected_allergens: list[str]
    expected_risk_ingredients: list[str]


@dataclass(frozen=True)
class LabelEvalCall:
    model_name: str
    phase: str
    elapsed_ms: int
    finish_reason: str | None
    usage_metadata: dict[str, Any]
    parsed_success: bool
    error_type: str | None
    error_message: str | None


@dataclass(frozen=True)
class LabelEvalResult:
    sample_id: str
    model_name: str
    image_sha256: str
    success: bool
    expected_safety_status: str
    actual_safety_status: str | None
    expected_status_match: bool
    ingredients_count: int
    min_ingredients_pass: bool
    missing_nutrition_keys: list[str]
    nutrition_keys_pass: bool
    human_label_status: str
    human_label_provenance: dict[str, str]
    allergen_recall_eligible: bool
    allergen_metrics: LabelEvalSetMetrics
    risk_ingredient_metrics: LabelEvalSetMetrics
    total_elapsed_ms: int
    calls: list[LabelEvalCall]
    output: dict[str, Any] | None


_TEMP_CREDENTIAL_PATHS: list[Path] = []

_CANONICAL_ALLERGEN_KEYWORDS: Final[dict[str, tuple[str, ...]]] = {
    "milk": ("milk", "dairy", "우유", "유청", "카제인", "분유"),
    "egg": ("egg", "eggs", "난류", "알류", "계란", "전란", "난백", "난황"),
    "peanut": ("peanut", "peanuts", "땅콩"),
    "tree nut": ("tree nut", "tree nuts", "walnut", "pine nut", "almond", "호두", "잣", "아몬드"),
    "wheat": ("wheat", "gluten", "밀", "밀가루", "밀전분", "밀단백", "밀추출물", "소맥"),
    "soy": ("soy", "soybean", "soya", "대두"),
    "fish": ("fish", "anchovy", "mackerel", "멸치", "고등어", "어류"),
    "shellfish": ("shellfish", "shrimp", "crab", "clam", "oyster", "새우", "게", "조개", "바지락", "굴"),
    "sesame": ("sesame", "참깨"),
}
_SHORT_KOREAN_ALLERGEN_KEYWORDS: Final[set[str]] = {"밀"}


class LabelEvalTimeoutError(TimeoutError):
    pass


def _cleanup_temp_credentials() -> None:
    for credential_path in _TEMP_CREDENTIAL_PATHS:
        if credential_path.exists():
            credential_path.unlink()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run paid Vertex AI label golden model evaluation.")
    parser.add_argument("--models", required=True, help="Comma separated Gemini model names.")
    parser.add_argument("--allergy-info", required=True, help="Allergy profile text used for label assessment.")
    parser.add_argument("--locale", required=True, help="Runtime locale.")
    parser.add_argument("--iso-current-country", required=True, help="ISO country context.")
    parser.add_argument("--output-root", required=True, help="Artifact output directory.")
    parser.add_argument("--sample-limit", required=True, help="Maximum active samples to evaluate.")
    parser.add_argument("--max-paid-calls", required=False, help="Maximum estimated Vertex generate_content calls allowed.")
    parser.add_argument(
        "--fail-on-regression",
        action="store_true",
        help="Exit with non-zero status when model results miss the configured gate thresholds.",
    )
    parser.add_argument("--min-success-rate", required=False, help="Minimum parsed success rate per model.")
    parser.add_argument("--min-expected-status-match-rate", required=False, help="Minimum safety status match rate per model.")
    parser.add_argument("--min-ingredients-pass-rate", required=False, help="Minimum ingredient lower-bound pass rate per model.")
    parser.add_argument("--min-nutrition-keys-pass-rate", required=False, help="Minimum nutrition required-key pass rate per model.")
    parser.add_argument("--min-allergen-recall-rate", required=False, help="Minimum human-labeled allergen recall rate per model.")
    parser.add_argument("--min-risk-ingredient-recall-rate", required=False, help="Minimum human-labeled risk ingredient recall rate per model.")
    parser.add_argument("--max-max-tokens-rate", required=False, help="Maximum MAX_TOKENS finish rate per model.")
    parser.add_argument("--max-p95-elapsed-ms", required=False, help="Maximum p95 elapsed latency per model in milliseconds.")
    return parser.parse_args()


def _read_positive_int_env(name: str, fallback: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return fallback
    normalized_value = raw_value.strip()
    if not normalized_value:
        return fallback
    parsed_value = int(normalized_value)
    if parsed_value <= 0:
        raise ValueError(f"{name} must be positive")
    return parsed_value


def _read_non_negative_int_env(name: str, fallback: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return fallback
    normalized_value = raw_value.strip()
    if not normalized_value:
        return fallback
    parsed_value = int(normalized_value)
    if parsed_value < 0:
        raise ValueError(f"{name} must be non-negative")
    return parsed_value


def _parse_positive_int_value(name: str, value: str) -> int:
    parsed_value = int(value.strip())
    if parsed_value <= 0:
        raise ValueError(f"{name} must be positive")
    return parsed_value


def _parse_non_negative_int_value(name: str, value: str) -> int:
    parsed_value = int(value.strip())
    if parsed_value < 0:
        raise ValueError(f"{name} must be non-negative")
    return parsed_value


def _parse_rate_value(name: str, value: str) -> float:
    parsed_value = float(value.strip())
    if parsed_value < 0.0 or parsed_value > 1.0:
        raise ValueError(f"{name} must be between 0 and 1")
    return parsed_value


def _parse_optional_rate_arg(arg_value: str | None, env_name: str, fallback: float) -> float:
    if arg_value is not None and arg_value.strip():
        return _parse_rate_value(env_name, arg_value)
    raw_env_value = os.getenv(env_name)
    if raw_env_value is not None and raw_env_value.strip():
        return _parse_rate_value(env_name, raw_env_value)
    return fallback


def _parse_optional_non_negative_int_arg(arg_value: str | None, env_name: str) -> int | None:
    if arg_value is not None and arg_value.strip():
        return _parse_non_negative_int_value(env_name, arg_value)
    raw_env_value = os.getenv(env_name)
    if raw_env_value is not None and raw_env_value.strip():
        return _parse_non_negative_int_value(env_name, raw_env_value)
    return None


def _build_gate_thresholds(args: argparse.Namespace) -> LabelEvalGateThresholds:
    return LabelEvalGateThresholds(
        min_success_rate=_parse_optional_rate_arg(args.min_success_rate, "LABEL_GOLDEN_EVAL_MIN_SUCCESS_RATE", 0.20),
        min_expected_status_match_rate=_parse_optional_rate_arg(
            args.min_expected_status_match_rate,
            "LABEL_GOLDEN_EVAL_MIN_EXPECTED_STATUS_MATCH_RATE",
            0.80,
        ),
        min_ingredients_pass_rate=_parse_optional_rate_arg(
            args.min_ingredients_pass_rate,
            "LABEL_GOLDEN_EVAL_MIN_INGREDIENTS_PASS_RATE",
            0.40,
        ),
        min_nutrition_keys_pass_rate=_parse_optional_rate_arg(
            args.min_nutrition_keys_pass_rate,
            "LABEL_GOLDEN_EVAL_MIN_NUTRITION_KEYS_PASS_RATE",
            0.40,
        ),
        min_allergen_recall_rate=_parse_optional_rate_arg(args.min_allergen_recall_rate, "LABEL_GOLDEN_EVAL_MIN_ALLERGEN_RECALL_RATE", 0.50),
        min_risk_ingredient_recall_rate=_parse_optional_rate_arg(
            args.min_risk_ingredient_recall_rate,
            "LABEL_GOLDEN_EVAL_MIN_RISK_INGREDIENT_RECALL_RATE",
            0.20,
        ),
        max_max_tokens_rate=_parse_optional_rate_arg(args.max_max_tokens_rate, "LABEL_GOLDEN_EVAL_MAX_MAX_TOKENS_RATE", 0.50),
        max_p95_elapsed_ms=_parse_optional_non_negative_int_arg(args.max_p95_elapsed_ms, "LABEL_GOLDEN_EVAL_MAX_P95_ELAPSED_MS"),
    )


def _require_paid_eval_approval() -> None:
    if os.getenv("ALLOW_VERTEX_LABEL_GOLDEN_EVAL", "").strip() != "1":
        raise SystemExit("ALLOW_VERTEX_LABEL_GOLDEN_EVAL=1 is required because this script makes paid Vertex AI calls")


def _load_project_env(repo_root: Path) -> None:
    root_env_path = repo_root / ".env"
    backend_env_path = repo_root / "backend" / ".env"
    if root_env_path.exists():
        load_dotenv(root_env_path, override=False)
    if backend_env_path.exists():
        load_dotenv(backend_env_path, override=False)


def _configure_vertex_ai() -> None:
    project_id = os.getenv("GCP_PROJECT_ID", "").strip()
    location = os.getenv("GCP_LOCATION", "us-central1").strip()
    service_account_json = os.getenv("GCP_SERVICE_ACCOUNT_JSON", "").strip()
    if not project_id:
        raise RuntimeError("GCP_PROJECT_ID is required")
    if not service_account_json:
        raise RuntimeError("GCP_SERVICE_ACCOUNT_JSON is required")
    json.loads(service_account_json)
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as credential_file:
        credential_file.write(service_account_json)
        credential_path = Path(credential_file.name)
    _TEMP_CREDENTIAL_PATHS.append(credential_path)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credential_path)
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
    os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
    os.environ["GOOGLE_CLOUD_LOCATION"] = location


def _build_client() -> genai.Client:
    project_id = os.getenv("GCP_PROJECT_ID", "").strip()
    location = os.getenv("GCP_LOCATION", "us-central1").strip()
    return genai.Client(vertexai=True, project=project_id, location=location)


def _build_config(args: argparse.Namespace, repo_root: Path, client: genai.Client) -> LabelEvalConfig:
    manifest_path = repo_root / "backend" / "tests" / "fixtures" / "label_regression" / "scaffold_manifest.json"
    model_names = [model.strip() for model in args.models.split(",") if model.strip()]
    if not model_names:
        raise ValueError("--models must contain at least one model")
    return LabelEvalConfig(
        repo_root=repo_root,
        manifest_path=manifest_path,
        output_root=Path(args.output_root),
        models=model_names,
        allergy_info=args.allergy_info,
        iso_current_country=args.iso_current_country,
        locale=args.locale,
        extract_max_output_tokens=_read_positive_int_env(
            "GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS",
            GEMINI_LABEL_EXTRACT_MAX_OUTPUT_TOKENS_DEFAULT,
        ),
        assess_max_output_tokens=_read_positive_int_env(
            "GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS",
            GEMINI_LABEL_ASSESS_MAX_OUTPUT_TOKENS_DEFAULT,
        ),
        timeout_seconds=_read_positive_int_env("VERTEX_LABEL_EVAL_TIMEOUT_SECONDS", 90),
        sample_limit=_parse_positive_int_value("--sample-limit", args.sample_limit),
        max_paid_calls=_parse_optional_non_negative_int_arg(args.max_paid_calls, "LABEL_GOLDEN_EVAL_MAX_PAID_CALLS") or 80,
        fail_on_regression=bool(args.fail_on_regression),
        gate_thresholds=_build_gate_thresholds(args),
        client=client,
    )


def _read_string_list_field(raw_value: Any, field_name: str) -> list[str]:
    if not isinstance(raw_value, list):
        raise ValueError(f"{field_name} must be a list")
    values: list[str] = []
    for index, item in enumerate(raw_value):
        if not isinstance(item, str):
            raise ValueError(f"{field_name}[{index}] must be a string")
        normalized_item = item.strip()
        if not normalized_item:
            raise ValueError(f"{field_name}[{index}] must be non-empty")
        values.append(normalized_item)
    return values


def _read_string_map_field(raw_value: Any, field_name: str) -> dict[str, str]:
    if not isinstance(raw_value, dict):
        raise ValueError(f"{field_name} must be an object")
    values: dict[str, str] = {}
    for key, value in raw_value.items():
        if not isinstance(key, str) or not key.strip():
            raise ValueError(f"{field_name} keys must be non-empty strings")
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field_name}.{key} must be a non-empty string")
        values[key.strip()] = value.strip()
    return values


def _load_human_label(raw_sample: dict[str, Any]) -> tuple[str, dict[str, str], list[str], list[str]]:
    sample_id = str(raw_sample.get("id", "unknown"))
    raw_human_label = raw_sample.get("human_label")
    if not isinstance(raw_human_label, dict):
        raise ValueError(f"{sample_id}.human_label must be an object")
    annotation_status = str(raw_human_label.get("annotation_status", "")).strip()
    if annotation_status not in {"needs_human_review", "reviewed"}:
        raise ValueError(f"{sample_id}.human_label.annotation_status invalid")
    provenance = _read_string_map_field(
        raw_human_label.get("provenance"),
        f"{sample_id}.human_label.provenance",
    )
    expected_allergens = _read_string_list_field(
        raw_human_label.get("expected_allergens"),
        f"{sample_id}.human_label.expected_allergens",
    )
    expected_risk_ingredients = _read_string_list_field(
        raw_human_label.get("expected_risk_ingredients"),
        f"{sample_id}.human_label.expected_risk_ingredients",
    )
    return annotation_status, provenance, expected_allergens, expected_risk_ingredients


def _load_samples(config: LabelEvalConfig) -> list[LabelEvalSample]:
    manifest = json.loads(config.manifest_path.read_text(encoding="utf-8"))
    fixture_root = config.manifest_path.parent
    samples: list[LabelEvalSample] = []
    for raw_sample in manifest["samples"]:
        if raw_sample["status"] != "active":
            continue
        human_label_status, human_label_provenance, expected_allergens, expected_risk_ingredients = _load_human_label(raw_sample)
        samples.append(
            LabelEvalSample(
                sample_id=raw_sample["id"],
                image_path=fixture_root / raw_sample["image_path"],
                expected_safety_status=raw_sample["expected_safetyStatus"],
                min_ingredients_count=int(raw_sample["min_ingredients_count"]),
                required_nutrition_keys=list(raw_sample["required_nutrition_keys"]),
                human_label_status=human_label_status,
                human_label_provenance=human_label_provenance,
                expected_allergens=expected_allergens,
                expected_risk_ingredients=expected_risk_ingredients,
            )
        )
    return samples[: config.sample_limit]


def _build_image_part(image_path: Path) -> types.Part:
    with Image.open(image_path) as image:
        normalized_image = image.convert("RGB")
        image_bytes = io.BytesIO()
        normalized_image.save(image_bytes, format="JPEG")
    return types.Part.from_bytes(data=image_bytes.getvalue(), mime_type="image/jpeg")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _extract_finish_reason(response: Any) -> str | None:
    candidates = getattr(response, "candidates", None)
    if not candidates:
        return None
    finish_reason = getattr(candidates[0], "finish_reason", None)
    if finish_reason is None:
        return None
    return str(finish_reason)


def _extract_usage_metadata(response: Any) -> dict[str, Any]:
    metadata = getattr(response, "usage_metadata", None)
    if metadata is None:
        return {}
    field_names = [
        "prompt_token_count",
        "candidates_token_count",
        "total_token_count",
        "cached_content_token_count",
        "thoughts_token_count",
    ]
    extracted: dict[str, Any] = {}
    for field_name in field_names:
        value = getattr(metadata, field_name, None)
        if value is not None:
            extracted[field_name] = value
    return extracted


def _to_genai_schema(schema: dict[str, Any]) -> dict[str, Any]:
    type_map = {
        "OBJECT": "object",
        "ARRAY": "array",
        "STRING": "string",
        "INTEGER": "integer",
        "NUMBER": "number",
        "BOOLEAN": "boolean",
    }
    converted: dict[str, Any] = {}
    for key, value in schema.items():
        if key == "type" and isinstance(value, str):
            converted[key] = type_map.get(value, value.lower())
            continue
        if isinstance(value, dict):
            converted[key] = _to_genai_schema(value)
            continue
        if isinstance(value, list):
            converted[key] = [
                _to_genai_schema(item) if isinstance(item, dict) else item
                for item in value
            ]
            continue
        converted[key] = value
    return converted


def _build_genai_safety_settings() -> list[types.SafetySetting]:
    raw_settings = build_default_safety_settings()
    return [
        types.SafetySetting(category=category.name, threshold=threshold.name)
        for category, threshold in raw_settings.items()
    ]


def _build_label_extract_response_schema() -> dict[str, Any]:
    schema_builder = getattr(analyst_schemas, "build_label_extract_response_schema")
    if not callable(schema_builder):
        raise RuntimeError("build_label_extract_response_schema must be callable")
    return schema_builder()


def _build_label_assess_risk_schema() -> dict[str, Any]:
    schema_builder = getattr(analyst_schemas, "build_label_assess_risk_schema")
    if not callable(schema_builder):
        raise RuntimeError("build_label_assess_risk_schema must be callable")
    return schema_builder()


def _merge_label_extract_and_assessment(
    extract_result: dict[str, Any],
    assess_result: dict[str, Any] | None,
    locale: str,
) -> dict[str, Any]:
    merge_function = getattr(analyst_runtime, "merge_label_extract_and_assessment")
    if not callable(merge_function):
        raise RuntimeError("merge_label_extract_and_assessment must be callable")
    return merge_function(extract_result, assess_result, locale)


def _thinking_budget_for_model(model_name: str) -> int:
    normalized_model_name = model_name.lower()
    if "2.5-pro" in normalized_model_name:
        return _read_positive_int_env("GEMINI_LABEL_PRO_THINKING_BUDGET", 128)
    if "2.5-flash-lite" in normalized_model_name:
        return _read_non_negative_int_env("GEMINI_LABEL_FLASH_LITE_THINKING_BUDGET", 0)
    if "2.5-flash" in normalized_model_name:
        return _read_non_negative_int_env("GEMINI_LABEL_FLASH_THINKING_BUDGET", 0)
    return _read_non_negative_int_env("GEMINI_LABEL_FLASH_THINKING_BUDGET", 0)


def _raise_generation_timeout(signum: int, frame: FrameType | None) -> None:
    raise LabelEvalTimeoutError(f"Vertex generation timed out; signal={signum}")


def _call_with_timeout(callback: Callable[[], Any], timeout_seconds: int) -> Any:
    previous_handler = signal.signal(signal.SIGALRM, _raise_generation_timeout)
    signal.alarm(timeout_seconds)
    try:
        return callback()
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous_handler)


def _is_parsed_success(result: dict[str, Any]) -> bool:
    if result.get("foodName") != "Analysis Error":
        return True
    return result.get("raw_result") != "AI 응답을 처리할 수 없습니다. 다시 시도해주세요."


def _normalize_eval_label(value: str) -> str:
    normalized = " ".join(value.casefold().replace("_", " ").replace("-", " ").split())
    return normalized


def _dedupe_normalized_labels(values: list[str]) -> list[str]:
    normalized_values: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized_value = _normalize_eval_label(value)
        if not normalized_value or normalized_value in seen:
            continue
        seen.add(normalized_value)
        normalized_values.append(normalized_value)
    return normalized_values


def _allergen_keyword_matches(normalized_value: str, keyword: str) -> bool:
    normalized_keyword = _normalize_eval_label(keyword)
    if keyword in _SHORT_KOREAN_ALLERGEN_KEYWORDS:
        return re.search(rf"(?<![가-힣A-Za-z]){re.escape(keyword)}(?![가-힣A-Za-z])", normalized_value) is not None
    if re.fullmatch(r"[a-z0-9 ]+", normalized_keyword) is not None:
        return re.search(rf"(?<![a-z0-9]){re.escape(normalized_keyword)}(?![a-z0-9])", normalized_value) is not None
    return normalized_keyword in normalized_value


def _canonical_allergens_from_text(value: str) -> list[str]:
    normalized_value = _normalize_eval_label(value)
    allergens: list[str] = []
    for allergen, keywords in _CANONICAL_ALLERGEN_KEYWORDS.items():
        if any(_allergen_keyword_matches(normalized_value, keyword) for keyword in keywords):
            allergens.append(allergen)
    return allergens


def _compute_set_metrics(expected: list[str], actual: list[str]) -> LabelEvalSetMetrics:
    expected_values = _dedupe_normalized_labels(expected)
    actual_values = _dedupe_normalized_labels(actual)
    expected_set = set(expected_values)
    actual_set = set(actual_values)
    true_positive = sorted(expected_set & actual_set)
    false_positive = sorted(actual_set - expected_set)
    false_negative = sorted(expected_set - actual_set)
    precision = 1.0 if not actual_values else len(true_positive) / len(actual_values)
    recall = 1.0 if not expected_values else len(true_positive) / len(expected_values)
    return LabelEvalSetMetrics(
        expected=expected_values,
        actual=actual_values,
        true_positive=true_positive,
        false_positive=false_positive,
        false_negative=false_negative,
        precision=precision,
        recall=recall,
    )


def _extract_actual_risk_ingredients(output: dict[str, Any] | None) -> list[str]:
    if output is None:
        return []
    ingredients = output.get("ingredients")
    if not isinstance(ingredients, list):
        return []
    names: list[str] = []
    for ingredient in ingredients:
        if not isinstance(ingredient, dict):
            continue
        if ingredient.get("isAllergen") is not True:
            continue
        raw_name = ingredient.get("name")
        if isinstance(raw_name, str) and raw_name.strip():
            names.append(raw_name.strip())
    return names


def _extract_actual_allergens(output: dict[str, Any] | None) -> list[str]:
    if output is None:
        return []
    ingredients = output.get("ingredients")
    if not isinstance(ingredients, list):
        return []
    allergens: list[str] = []
    for ingredient in ingredients:
        if not isinstance(ingredient, dict):
            continue
        if ingredient.get("isAllergen") is not True:
            continue
        allergen_sources: list[str] = []
        raw_reason = ingredient.get("riskReason")
        if isinstance(raw_reason, str) and raw_reason.strip():
            allergen_sources.append(raw_reason.strip())
        raw_name = ingredient.get("name")
        if isinstance(raw_name, str) and raw_name.strip():
            allergen_sources.append(raw_name.strip())
        canonical_allergens: list[str] = []
        for allergen_source in allergen_sources:
            canonical_allergens.extend(_canonical_allergens_from_text(allergen_source))
        if canonical_allergens:
            allergens.extend(_dedupe_normalized_labels(canonical_allergens))
            continue
        if isinstance(raw_name, str) and raw_name.strip():
            allergens.append(raw_name.strip())
            continue
        allergens.extend(allergen_sources)
    return _dedupe_normalized_labels(allergens)


def _generate_json(
    client: genai.Client,
    model_name: str,
    contents: list[types.Part],
    generation_config: types.GenerateContentConfig,
    phase: str,
    timeout_seconds: int,
) -> tuple[dict[str, Any] | None, LabelEvalCall]:
    started_at = time.perf_counter()
    try:
        response = _call_with_timeout(
            lambda: client.models.generate_content(
                model=model_name,
                contents=contents,
                config=generation_config,
            ),
            timeout_seconds,
        )
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        parsed_result = sanitize_response(parse_ai_response(response.text))
        return parsed_result, LabelEvalCall(
            model_name=model_name,
            phase=phase,
            elapsed_ms=elapsed_ms,
            finish_reason=_extract_finish_reason(response),
            usage_metadata=_extract_usage_metadata(response),
            parsed_success=_is_parsed_success(parsed_result),
            error_type=None,
            error_message=None,
        )
    except Exception as error:
        elapsed_ms = int((time.perf_counter() - started_at) * 1000)
        return None, LabelEvalCall(
            model_name=model_name,
            phase=phase,
            elapsed_ms=elapsed_ms,
            finish_reason=None,
            usage_metadata={},
            parsed_success=False,
            error_type=type(error).__name__,
            error_message=str(error),
        )


def _evaluate_sample_model(config: LabelEvalConfig, sample: LabelEvalSample, model_name: str) -> LabelEvalResult:
    normalized_allergens = format_allergens_for_prompt(config.allergy_info)
    normalized_locale = _normalize_runtime_locale(config.locale)
    image_part = _build_image_part(sample.image_path)
    extract_prompt = build_label_prompt(normalized_allergens, normalized_locale, config.iso_current_country)
    thinking_budget = _thinking_budget_for_model(model_name)
    extract_config = types.GenerateContentConfig(
        temperature=0.1,
        maxOutputTokens=config.extract_max_output_tokens,
        responseMimeType="application/json",
        responseSchema=_to_genai_schema(_build_label_extract_response_schema()),
        safetySettings=_build_genai_safety_settings(),
        thinkingConfig=types.ThinkingConfig(thinkingBudget=thinking_budget),
    )
    total_started_at = time.perf_counter()
    extract_result, extract_call = _generate_json(
        config.client,
        model_name,
        [types.Part.from_text(text=extract_prompt), image_part],
        extract_config,
        "extract",
        config.timeout_seconds,
    )
    calls = [extract_call]
    result: dict[str, Any] | None = None
    if extract_result is not None:
        ingredient_names = [
            str(ingredient.get("name", "")).strip()
            for ingredient in extract_result.get("ingredients", [])
            if isinstance(ingredient, dict) and str(ingredient.get("name", "")).strip()
        ]
        assess_result: dict[str, Any] | None = None
        if ingredient_names:
            assess_prompt = build_label_assess_prompt(
                normalized_allergens,
                ingredient_names,
                normalized_locale,
                config.iso_current_country,
            )
            assess_config = types.GenerateContentConfig(
                temperature=0.1,
                maxOutputTokens=config.assess_max_output_tokens,
                responseMimeType="application/json",
                responseSchema=_to_genai_schema(_build_label_assess_risk_schema()),
                safetySettings=_build_genai_safety_settings(),
                thinkingConfig=types.ThinkingConfig(thinkingBudget=thinking_budget),
            )
            assess_result, assess_call = _generate_json(
                config.client,
                model_name,
                [types.Part.from_text(text=assess_prompt)],
                assess_config,
                "assess",
                config.timeout_seconds,
            )
            calls.append(assess_call)
        result = _merge_label_extract_and_assessment(extract_result, assess_result, normalized_locale)
        result["used_model"] = model_name
        result["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
    total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
    ingredients = result.get("ingredients", []) if isinstance(result, dict) else []
    nutrition = result.get("nutrition", {}) if isinstance(result, dict) else {}
    ingredients_count = len(ingredients) if isinstance(ingredients, list) else 0
    missing_nutrition_keys = [
        key for key in sample.required_nutrition_keys
        if not isinstance(nutrition, dict) or key not in nutrition
    ]
    actual_safety_status = str(result.get("safetyStatus")) if isinstance(result, dict) and result.get("safetyStatus") else None
    allergen_recall_eligible = sample.human_label_status == "reviewed"
    allergen_metrics = _compute_set_metrics(
        sample.expected_allergens if allergen_recall_eligible else [],
        _extract_actual_allergens(result) if allergen_recall_eligible else [],
    )
    risk_ingredient_metrics = _compute_set_metrics(
        sample.expected_risk_ingredients if allergen_recall_eligible else [],
        _extract_actual_risk_ingredients(result) if allergen_recall_eligible else [],
    )
    return LabelEvalResult(
        sample_id=sample.sample_id,
        model_name=model_name,
        image_sha256=_sha256_file(sample.image_path),
        success=result is not None and all(call.parsed_success for call in calls),
        expected_safety_status=sample.expected_safety_status,
        actual_safety_status=actual_safety_status,
        expected_status_match=actual_safety_status == sample.expected_safety_status,
        ingredients_count=ingredients_count,
        min_ingredients_pass=ingredients_count >= sample.min_ingredients_count,
        missing_nutrition_keys=missing_nutrition_keys,
        nutrition_keys_pass=not missing_nutrition_keys,
        human_label_status=sample.human_label_status,
        human_label_provenance=sample.human_label_provenance,
        allergen_recall_eligible=allergen_recall_eligible,
        allergen_metrics=allergen_metrics,
        risk_ingredient_metrics=risk_ingredient_metrics,
        total_elapsed_ms=total_elapsed_ms,
        calls=calls,
        output=result,
    )


def _percentile_95(values: list[int]) -> int | None:
    if not values:
        return None
    if len(values) == 1:
        return values[0]
    return int(statistics.quantiles(values, n=20, method="inclusive")[18])


def _ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def _is_max_tokens_finish_reason(finish_reason: str | None) -> bool:
    if finish_reason is None:
        return False
    return "MAX_TOKENS" in finish_reason.upper()


def _max_tokens_call_count(results: list[LabelEvalResult]) -> int:
    count = 0
    for result in results:
        count += sum(1 for call in result.calls if _is_max_tokens_finish_reason(call.finish_reason))
    return count


def _total_call_count(results: list[LabelEvalResult]) -> int:
    return sum(len(result.calls) for result in results)


def _reviewed_results(results: list[LabelEvalResult]) -> list[LabelEvalResult]:
    return [result for result in results if result.allergen_recall_eligible]


def _average_metric(metrics: list[float]) -> float | None:
    if not metrics:
        return None
    return sum(metrics) / len(metrics)


def _allergen_recall_rate(results: list[LabelEvalResult]) -> float | None:
    reviewed = _reviewed_results(results)
    return _average_metric([result.allergen_metrics.recall for result in reviewed])


def _risk_ingredient_recall_rate(results: list[LabelEvalResult]) -> float | None:
    reviewed = _reviewed_results(results)
    return _average_metric([result.risk_ingredient_metrics.recall for result in reviewed])


def _estimate_max_vertex_calls(samples: list[LabelEvalSample], models: list[str]) -> int:
    return len(samples) * len(models) * 2


def _sum_usage(results: list[LabelEvalResult]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for result in results:
        for call in result.calls:
            for key, value in call.usage_metadata.items():
                if isinstance(value, int):
                    totals[key] = totals.get(key, 0) + value
    return totals


def _build_gate_failures(results: list[LabelEvalResult], thresholds: LabelEvalGateThresholds) -> list[dict[str, Any]]:
    by_model: dict[str, list[LabelEvalResult]] = {}
    for result in results:
        by_model.setdefault(result.model_name, []).append(result)

    failures: list[dict[str, Any]] = []
    for model_name, model_results in sorted(by_model.items()):
        sample_count = len(model_results)
        call_count = _total_call_count(model_results)
        elapsed_values = [result.total_elapsed_ms for result in model_results]
        p95_elapsed_ms = _percentile_95(elapsed_values)
        checks = [
            (
                "success_rate",
                _ratio(sum(1 for result in model_results if result.success), sample_count),
                ">=",
                thresholds.min_success_rate,
            ),
            (
                "expected_status_match_rate",
                _ratio(sum(1 for result in model_results if result.expected_status_match), sample_count),
                ">=",
                thresholds.min_expected_status_match_rate,
            ),
            (
                "ingredients_pass_rate",
                _ratio(sum(1 for result in model_results if result.min_ingredients_pass), sample_count),
                ">=",
                thresholds.min_ingredients_pass_rate,
            ),
            (
                "nutrition_keys_pass_rate",
                _ratio(sum(1 for result in model_results if result.nutrition_keys_pass), sample_count),
                ">=",
                thresholds.min_nutrition_keys_pass_rate,
            ),
            (
                "max_tokens_rate",
                _ratio(_max_tokens_call_count(model_results), call_count),
                "<=",
                thresholds.max_max_tokens_rate,
            ),
        ]
        reviewed_model_results = _reviewed_results(model_results)
        if reviewed_model_results:
            allergen_recall = _allergen_recall_rate(model_results)
            risk_ingredient_recall = _risk_ingredient_recall_rate(model_results)
            if allergen_recall is not None:
                checks.append(("allergen_recall_rate", allergen_recall, ">=", thresholds.min_allergen_recall_rate))
            if risk_ingredient_recall is not None:
                checks.append(("risk_ingredient_recall_rate", risk_ingredient_recall, ">=", thresholds.min_risk_ingredient_recall_rate))
        for metric_name, actual_value, operator, expected_value in checks:
            failed = actual_value < expected_value if operator == ">=" else actual_value > expected_value
            if failed:
                failures.append(
                    {
                        "model": model_name,
                        "metric": metric_name,
                        "actual": actual_value,
                        "operator": operator,
                        "expected": expected_value,
                    }
                )
        if thresholds.max_p95_elapsed_ms is not None and p95_elapsed_ms is not None:
            if p95_elapsed_ms > thresholds.max_p95_elapsed_ms:
                failures.append(
                    {
                        "model": model_name,
                        "metric": "p95_elapsed_ms",
                        "actual": p95_elapsed_ms,
                        "operator": "<=",
                        "expected": thresholds.max_p95_elapsed_ms,
                    }
                )
    return failures


def _summarize_results(results: list[LabelEvalResult]) -> dict[str, Any]:
    by_model: dict[str, list[LabelEvalResult]] = {}
    for result in results:
        by_model.setdefault(result.model_name, []).append(result)
    summary: dict[str, Any] = {}
    for model_name, model_results in sorted(by_model.items()):
        elapsed_values = [result.total_elapsed_ms for result in model_results]
        reviewed_model_results = _reviewed_results(model_results)
        summary[model_name] = {
            "samples": len(model_results),
            "human_label_reviewed_samples": len(reviewed_model_results),
            "human_label_ai_assisted_reviewed_samples": sum(
                1
                for result in reviewed_model_results
                if result.human_label_provenance.get("assistance") == "ai_visual_review"
            ),
            "success": sum(1 for result in model_results if result.success),
            "expected_status_match": sum(1 for result in model_results if result.expected_status_match),
            "min_ingredients_pass": sum(1 for result in model_results if result.min_ingredients_pass),
            "nutrition_keys_pass": sum(1 for result in model_results if result.nutrition_keys_pass),
            "allergen_recall_rate": _allergen_recall_rate(model_results),
            "risk_ingredient_recall_rate": _risk_ingredient_recall_rate(model_results),
            "avg_elapsed_ms": int(sum(elapsed_values) / len(elapsed_values)) if elapsed_values else None,
            "p95_elapsed_ms": _percentile_95(elapsed_values),
            "usage_metadata_totals": _sum_usage(model_results),
        }
    return summary


def _write_artifacts(config: LabelEvalConfig, results: list[LabelEvalResult]) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    artifact_dir = config.output_root / timestamp
    artifact_dir.mkdir(parents=True, exist_ok=False)
    serializable_results = [asdict(result) for result in results]
    summary = {
        "generated_at": timestamp,
        "models": config.models,
        "sample_count": len({result.sample_id for result in results}),
        "human_label_reviewed_sample_count": len({result.sample_id for result in results if result.allergen_recall_eligible}),
        "human_label_ai_assisted_reviewed_sample_count": len(
            {
                result.sample_id
                for result in results
                if result.allergen_recall_eligible
                and result.human_label_provenance.get("assistance") == "ai_visual_review"
            }
        ),
        "max_paid_calls": config.max_paid_calls,
        "prompt_version": LABEL_2PASS_PROMPT_VERSION,
        "extract_max_output_tokens": config.extract_max_output_tokens,
        "assess_max_output_tokens": config.assess_max_output_tokens,
        "thinking_budget_by_model": {
            model_name: _thinking_budget_for_model(model_name)
            for model_name in config.models
        },
        "fail_on_regression": config.fail_on_regression,
        "gate_thresholds": asdict(config.gate_thresholds),
        "gate_failures": _build_gate_failures(results, config.gate_thresholds),
        "summary_by_model": _summarize_results(results),
        "limitations": [
            "Only samples with human_label.annotation_status=reviewed participate in allergen recall scoring.",
            "human_label.provenance.assistance identifies AI-assisted labels; reviewed does not imply human-only authorship.",
            "Cost is represented by provider usage metadata; dollar cost requires the private pricing catalog.",
        ],
    }
    (artifact_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (artifact_dir / "results.json").write_text(json.dumps(serializable_results, ensure_ascii=False, indent=2), encoding="utf-8")
    return artifact_dir


def _print_gate_failures(failures: list[dict[str, Any]]) -> None:
    print("[LabelEval] regression gate failed", file=sys.stderr)
    for failure in failures:
        print(
            json.dumps(failure, ensure_ascii=False, sort_keys=True),
            file=sys.stderr,
        )


def main() -> None:
    args = _parse_args()
    _require_paid_eval_approval()
    repo_root = REPO_ROOT
    _load_project_env(repo_root)
    _configure_vertex_ai()
    client = _build_client()
    config = _build_config(args, repo_root, client)
    samples = _load_samples(config)
    estimated_max_calls = _estimate_max_vertex_calls(samples, config.models)
    if estimated_max_calls > config.max_paid_calls:
        raise SystemExit(
            f"Estimated Vertex calls {estimated_max_calls} exceed LABEL_GOLDEN_EVAL_MAX_PAID_CALLS={config.max_paid_calls}"
        )
    results: list[LabelEvalResult] = []
    for sample in samples:
        for model_name in config.models:
            print(f"[LabelEval] sample={sample.sample_id} model={model_name}", flush=True)
            results.append(_evaluate_sample_model(config, sample, model_name))
    artifact_dir = _write_artifacts(config, results)
    gate_failures = _build_gate_failures(results, config.gate_thresholds)
    print(
        json.dumps(
            {
                "artifact_dir": str(artifact_dir),
                "summary_by_model": _summarize_results(results),
                "gate_failures": gate_failures,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if config.fail_on_regression and gate_failures:
        _print_gate_failures(gate_failures)
        raise SystemExit(1)


if __name__ == "__main__":
    atexit.register(_cleanup_temp_credentials)
    main()
