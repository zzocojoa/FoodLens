import argparse
import hashlib
import json
import math
import os
import statistics
import sys
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Final, Iterator

from dotenv import load_dotenv
from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.modules.analyst_core.prompts import ANALYSIS_PROMPT_VERSION
from backend.modules.analyst_runtime.food_analyst import (
    GEMINI_FOOD_MAX_PROVIDER_CALLS_PER_REQUEST_DEFAULT,
    FoodAnalyst,
)


SAFETY_STATUSES: Final[set[str]] = {"SAFE", "CAUTION", "DANGER"}
FOOD_ORIGINS: Final[set[str]] = {"korean", "western", "asian", "single_ingredient", "other", "unknown"}
ENV_KEY_PRESENCE_NAMES: Final[tuple[str, ...]] = (
    "GCP_SERVICE_ACCOUNT_JSON",
    "GCP_PROJECT_ID",
    "GCP_LOCATION",
    "GEMINI_MODEL_NAME",
    "GOOGLE_APPLICATION_CREDENTIALS",
)


@dataclass(frozen=True)
class FoodEvalCase:
    case_id: str
    image_path: Path
    category: str
    allergy_info: str
    iso_country: str
    expected_safety_status: str
    allowed_safety_statuses: list[str]
    expected_food_origin: str
    required_visible_allergens: list[str]
    required_ingredient_terms: list[str]
    required_status_reason_terms: list[str]
    review_confidence: str
    notes: str


@dataclass(frozen=True)
class FoodEvalThresholds:
    min_success_rate: float
    min_expected_status_match_rate: float
    min_food_origin_match_rate: float
    min_required_terms_pass_rate: float
    min_visible_allergen_recall_rate: float
    min_status_reason_terms_pass_rate: float
    max_invalid_bbox_rate: float
    max_p95_elapsed_ms: int | None


@dataclass(frozen=True)
class FoodEvalConfig:
    repo_root: Path
    manifest_path: Path
    output_root: Path
    models: list[str]
    sample_limit: int | None
    max_paid_calls: int
    fail_on_regression: bool
    gate_thresholds: FoodEvalThresholds


@dataclass(frozen=True)
class FoodEvalResult:
    case_id: str
    category: str
    model_name: str
    image_sha256: str
    success: bool
    expected_safety_status: str
    allowed_safety_statuses: list[str]
    actual_safety_status: str | None
    expected_status_match: bool
    expected_food_origin: str
    actual_food_origin: str | None
    food_origin_match: bool
    required_terms_missing: list[str]
    required_terms_pass: bool
    visible_allergen_recall_eligible: bool
    visible_allergens_missing: list[str]
    visible_allergen_recall_pass: bool
    status_reason_terms_eligible: bool
    status_reason_terms_missing: list[str]
    status_reason_terms_pass: bool
    bbox_count: int
    invalid_bbox_count: int
    bbox_valid_pass: bool
    elapsed_ms: int
    used_model: str | None
    prompt_version: str | None
    finish_reason: int | str | None
    fallback_used: bool
    fallback_reason: str | None
    chargeable: bool
    usage_metadata: dict[str, int]
    error_type: str | None
    error_message: str | None
    output: dict[str, Any] | None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run paid Vertex AI food golden model evaluation.")
    parser.add_argument("--models", required=False, help="Comma separated Gemini model names. Defaults to GEMINI_MODEL_NAME.")
    parser.add_argument(
        "--manifest",
        default="backend/tests/fixtures/food_canary/scaffold_manifest.json",
        help="Food canary manifest path.",
    )
    parser.add_argument(
        "--output-root",
        default="artifacts/food-golden-eval",
        help="Artifact output root directory.",
    )
    parser.add_argument("--sample-limit", required=False, help="Maximum manifest cases to evaluate.")
    parser.add_argument("--max-paid-calls", required=False, help="Maximum estimated Vertex generate calls allowed.")
    parser.add_argument(
        "--fail-on-regression",
        action="store_true",
        help="Exit with non-zero status when model results miss configured gate thresholds.",
    )
    parser.add_argument("--min-success-rate", required=False)
    parser.add_argument("--min-expected-status-match-rate", required=False)
    parser.add_argument("--min-food-origin-match-rate", required=False)
    parser.add_argument("--min-required-terms-pass-rate", required=False)
    parser.add_argument("--min-visible-allergen-recall-rate", required=False)
    parser.add_argument("--min-status-reason-terms-pass-rate", required=False)
    parser.add_argument("--max-invalid-bbox-rate", required=False)
    parser.add_argument("--max-p95-elapsed-ms", required=False)
    return parser.parse_args()


def _load_project_env(repo_root: Path) -> None:
    root_env_path = repo_root / ".env"
    backend_env_path = repo_root / "backend" / ".env"
    if root_env_path.exists():
        load_dotenv(root_env_path, override=False)
    if backend_env_path.exists():
        load_dotenv(backend_env_path, override=False)


def _require_paid_eval_approval() -> None:
    if os.getenv("ALLOW_VERTEX_FOOD_GOLDEN_EVAL", "").strip() != "1":
        raise SystemExit("ALLOW_VERTEX_FOOD_GOLDEN_EVAL=1 is required because this script makes paid Vertex AI calls")


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


def _parse_optional_positive_int_arg(arg_value: str | None, name: str) -> int | None:
    if arg_value is None or not arg_value.strip():
        return None
    return _parse_positive_int_value(name, arg_value)


def _build_gate_thresholds(args: argparse.Namespace) -> FoodEvalThresholds:
    return FoodEvalThresholds(
        min_success_rate=_parse_optional_rate_arg(args.min_success_rate, "FOOD_GOLDEN_EVAL_MIN_SUCCESS_RATE", 0.80),
        min_expected_status_match_rate=_parse_optional_rate_arg(
            args.min_expected_status_match_rate,
            "FOOD_GOLDEN_EVAL_MIN_EXPECTED_STATUS_MATCH_RATE",
            0.70,
        ),
        min_food_origin_match_rate=_parse_optional_rate_arg(
            args.min_food_origin_match_rate,
            "FOOD_GOLDEN_EVAL_MIN_FOOD_ORIGIN_MATCH_RATE",
            0.60,
        ),
        min_required_terms_pass_rate=_parse_optional_rate_arg(
            args.min_required_terms_pass_rate,
            "FOOD_GOLDEN_EVAL_MIN_REQUIRED_TERMS_PASS_RATE",
            0.50,
        ),
        min_visible_allergen_recall_rate=_parse_optional_rate_arg(
            args.min_visible_allergen_recall_rate,
            "FOOD_GOLDEN_EVAL_MIN_VISIBLE_ALLERGEN_RECALL_RATE",
            0.80,
        ),
        min_status_reason_terms_pass_rate=_parse_optional_rate_arg(
            args.min_status_reason_terms_pass_rate,
            "FOOD_GOLDEN_EVAL_MIN_STATUS_REASON_TERMS_PASS_RATE",
            0.40,
        ),
        max_invalid_bbox_rate=_parse_optional_rate_arg(
            args.max_invalid_bbox_rate,
            "FOOD_GOLDEN_EVAL_MAX_INVALID_BBOX_RATE",
            0.00,
        ),
        max_p95_elapsed_ms=_parse_optional_non_negative_int_arg(
            args.max_p95_elapsed_ms,
            "FOOD_GOLDEN_EVAL_MAX_P95_ELAPSED_MS",
        ),
    )


def _build_config(args: argparse.Namespace, repo_root: Path) -> FoodEvalConfig:
    raw_models = args.models or os.getenv("GEMINI_MODEL_NAME", "gemini-2.5-flash")
    model_names = [model.strip() for model in raw_models.split(",") if model.strip()]
    if not model_names:
        raise ValueError("--models or GEMINI_MODEL_NAME must contain at least one model")
    max_paid_calls = _parse_optional_non_negative_int_arg(args.max_paid_calls, "FOOD_GOLDEN_EVAL_MAX_PAID_CALLS")
    return FoodEvalConfig(
        repo_root=repo_root,
        manifest_path=(repo_root / args.manifest).resolve(),
        output_root=(repo_root / args.output_root).resolve(),
        models=model_names,
        sample_limit=_parse_optional_positive_int_arg(args.sample_limit, "--sample-limit"),
        max_paid_calls=max_paid_calls if max_paid_calls is not None else 30,
        fail_on_regression=bool(args.fail_on_regression),
        gate_thresholds=_build_gate_thresholds(args),
    )


def _read_string_list_field(raw_value: Any, field_name: str) -> list[str]:
    if not isinstance(raw_value, list):
        raise ValueError(f"{field_name} must be a list")
    values: list[str] = []
    for index, item in enumerate(raw_value):
        if not isinstance(item, str):
            raise ValueError(f"{field_name}[{index}] must be a string")
        normalized_item = item.strip()
        if normalized_item:
            values.append(normalized_item)
    return values


def _read_string_field(raw_value: Any, field_name: str) -> str:
    if not isinstance(raw_value, str) or not raw_value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")
    return raw_value.strip()


def _load_cases(manifest_path: Path, sample_limit: int | None) -> list[FoodEvalCase]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw_cases = manifest.get("cases")
    if not isinstance(raw_cases, list):
        raise ValueError("manifest.cases must be a list")
    fixture_root = manifest_path.parent
    cases: list[FoodEvalCase] = []
    for raw_case in raw_cases:
        if not isinstance(raw_case, dict):
            raise ValueError("manifest cases must be objects")
        case_id = _read_string_field(raw_case.get("id"), "case.id")
        image_path = fixture_root / _read_string_field(raw_case.get("image"), f"{case_id}.image")
        if not image_path.exists():
            raise FileNotFoundError(f"{case_id}.image not found: {image_path}")
        expected_safety_status = _read_string_field(raw_case.get("expected_safetyStatus"), f"{case_id}.expected_safetyStatus")
        if expected_safety_status not in SAFETY_STATUSES:
            raise ValueError(f"{case_id}.expected_safetyStatus invalid")
        raw_allowed_safety_statuses = raw_case.get("allowed_safetyStatuses")
        if raw_allowed_safety_statuses is None:
            allowed_safety_statuses = [expected_safety_status]
        else:
            allowed_safety_statuses = _read_string_list_field(
                raw_allowed_safety_statuses,
                f"{case_id}.allowed_safetyStatuses",
            )
        if not allowed_safety_statuses:
            raise ValueError(f"{case_id}.allowed_safetyStatuses must be non-empty")
        invalid_allowed_statuses = [status for status in allowed_safety_statuses if status not in SAFETY_STATUSES]
        if invalid_allowed_statuses:
            raise ValueError(f"{case_id}.allowed_safetyStatuses invalid")
        if expected_safety_status not in allowed_safety_statuses:
            raise ValueError(f"{case_id}.allowed_safetyStatuses must include expected_safetyStatus")
        expected_food_origin = _read_string_field(raw_case.get("expected_foodOrigin"), f"{case_id}.expected_foodOrigin")
        if expected_food_origin not in FOOD_ORIGINS:
            raise ValueError(f"{case_id}.expected_foodOrigin invalid")
        cases.append(
            FoodEvalCase(
                case_id=case_id,
                image_path=image_path,
                category=_read_string_field(raw_case.get("category"), f"{case_id}.category"),
                allergy_info=_read_string_field(raw_case.get("allergy_info"), f"{case_id}.allergy_info"),
                iso_country=_read_string_field(raw_case.get("iso_country"), f"{case_id}.iso_country"),
                expected_safety_status=expected_safety_status,
                allowed_safety_statuses=allowed_safety_statuses,
                expected_food_origin=expected_food_origin,
                required_visible_allergens=_read_string_list_field(
                    raw_case.get("required_visible_allergens"),
                    f"{case_id}.required_visible_allergens",
                ),
                required_ingredient_terms=_read_string_list_field(
                    raw_case.get("required_ingredient_terms"),
                    f"{case_id}.required_ingredient_terms",
                ),
                required_status_reason_terms=_read_string_list_field(
                    raw_case.get("required_status_reason_terms"),
                    f"{case_id}.required_status_reason_terms",
                ),
                review_confidence=str(raw_case.get("review_confidence", "unknown")).strip() or "unknown",
                notes=str(raw_case.get("notes", "")).strip(),
            )
        )
    return cases[:sample_limit] if sample_limit is not None else cases


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _collect_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        strings: list[str] = []
        for item in value.values():
            strings.extend(_collect_strings(item))
        return strings
    if isinstance(value, list):
        strings = []
        for item in value:
            strings.extend(_collect_strings(item))
        return strings
    return []


def _get_ingredients(output: dict[str, Any]) -> list[dict[str, Any]]:
    raw_ingredients = output.get("ingredients")
    if not isinstance(raw_ingredients, list):
        return []
    return [ingredient for ingredient in raw_ingredients if isinstance(ingredient, dict)]


def _build_output_search_text(output: dict[str, Any]) -> str:
    return _normalize_text(" ".join(_collect_strings(output)))


def _build_detected_food_search_text(output: dict[str, Any]) -> str:
    strings: list[str] = []
    for key in ("foodName", "foodName_en", "foodName_ko", "canonicalFoodId"):
        value = output.get(key)
        if isinstance(value, str):
            strings.append(value)
    for ingredient in _get_ingredients(output):
        for key in ("name", "name_en", "name_ko"):
            value = ingredient.get(key)
            if isinstance(value, str):
                strings.append(value)
    return _normalize_text(" ".join(strings))


def _build_flagged_allergen_search_text(output: dict[str, Any]) -> str:
    strings: list[str] = []
    for ingredient in _get_ingredients(output):
        if ingredient.get("isAllergen") is True:
            strings.extend(_collect_strings(ingredient))
    return _normalize_text(" ".join(strings))


def _missing_terms(search_text: str, terms: list[str]) -> list[str]:
    missing_terms: list[str] = []
    for term in terms:
        normalized_aliases = [_normalize_text(alias) for alias in term.split("|") if alias.strip()]
        if not normalized_aliases or not any(alias in search_text for alias in normalized_aliases):
            missing_terms.append(term)
    return missing_terms


def _is_valid_bbox(value: Any) -> bool:
    if not isinstance(value, list) or len(value) != 4:
        return False
    coordinates: list[float] = []
    for coordinate in value:
        if isinstance(coordinate, bool) or not isinstance(coordinate, (int, float)):
            return False
        if not math.isfinite(float(coordinate)) or coordinate < 0 or coordinate > 1000:
            return False
        coordinates.append(float(coordinate))
    ymin, xmin, ymax, xmax = coordinates
    return ymin < ymax and xmin < xmax


def _count_bboxes(output: dict[str, Any]) -> tuple[int, int]:
    bbox_count = 0
    invalid_bbox_count = 0
    for ingredient in _get_ingredients(output):
        for key in ("bbox", "box_2d"):
            if key not in ingredient:
                continue
            bbox_count += 1
            if not _is_valid_bbox(ingredient.get(key)):
                invalid_bbox_count += 1
    return bbox_count, invalid_bbox_count


def _extract_int_usage_metadata(output: dict[str, Any]) -> dict[str, int]:
    raw_usage = output.get("_food_usage_metadata")
    if not isinstance(raw_usage, dict):
        return {}
    usage_metadata: dict[str, int] = {}
    for key, value in raw_usage.items():
        if isinstance(key, str) and isinstance(value, int) and not isinstance(value, bool):
            usage_metadata[key] = value
    return usage_metadata


def _evaluate_output(case: FoodEvalCase, model_name: str, image_sha256: str, elapsed_ms: int, output: dict[str, Any]) -> FoodEvalResult:
    actual_safety_status = output.get("safetyStatus") if isinstance(output.get("safetyStatus"), str) else None
    actual_food_origin = output.get("foodOrigin") if isinstance(output.get("foodOrigin"), str) else None
    success = actual_safety_status in SAFETY_STATUSES and output.get("foodName") != "Analysis Error"
    output_search_text = _build_output_search_text(output)
    detected_food_search_text = _build_detected_food_search_text(output)
    flagged_allergen_text = _build_flagged_allergen_search_text(output)
    required_terms_missing = _missing_terms(detected_food_search_text, case.required_ingredient_terms)
    visible_allergens_missing = _missing_terms(flagged_allergen_text, case.required_visible_allergens)
    status_reason_terms_missing = _missing_terms(output_search_text, case.required_status_reason_terms)
    bbox_count, invalid_bbox_count = _count_bboxes(output)
    return FoodEvalResult(
        case_id=case.case_id,
        category=case.category,
        model_name=model_name,
        image_sha256=image_sha256,
        success=success,
        expected_safety_status=case.expected_safety_status,
        allowed_safety_statuses=case.allowed_safety_statuses,
        actual_safety_status=actual_safety_status,
        expected_status_match=actual_safety_status in case.allowed_safety_statuses,
        expected_food_origin=case.expected_food_origin,
        actual_food_origin=actual_food_origin,
        food_origin_match=actual_food_origin == case.expected_food_origin,
        required_terms_missing=required_terms_missing,
        required_terms_pass=len(required_terms_missing) == 0,
        visible_allergen_recall_eligible=len(case.required_visible_allergens) > 0,
        visible_allergens_missing=visible_allergens_missing,
        visible_allergen_recall_pass=len(visible_allergens_missing) == 0,
        status_reason_terms_eligible=len(case.required_status_reason_terms) > 0,
        status_reason_terms_missing=status_reason_terms_missing,
        status_reason_terms_pass=len(status_reason_terms_missing) == 0,
        bbox_count=bbox_count,
        invalid_bbox_count=invalid_bbox_count,
        bbox_valid_pass=invalid_bbox_count == 0,
        elapsed_ms=elapsed_ms,
        used_model=output.get("used_model") if isinstance(output.get("used_model"), str) else None,
        prompt_version=output.get("prompt_version") if isinstance(output.get("prompt_version"), str) else None,
        finish_reason=output.get("_food_finish_reason"),
        fallback_used=output.get("_food_fallback_used") is True,
        fallback_reason=output.get("_food_fallback_reason") if isinstance(output.get("_food_fallback_reason"), str) else None,
        chargeable=output.get("_food_chargeable") is True,
        usage_metadata=_extract_int_usage_metadata(output),
        error_type=None,
        error_message=None,
        output=output,
    )


def _evaluate_error(case: FoodEvalCase, model_name: str, image_sha256: str, elapsed_ms: int, error: Exception) -> FoodEvalResult:
    return FoodEvalResult(
        case_id=case.case_id,
        category=case.category,
        model_name=model_name,
        image_sha256=image_sha256,
        success=False,
        expected_safety_status=case.expected_safety_status,
        allowed_safety_statuses=case.allowed_safety_statuses,
        actual_safety_status=None,
        expected_status_match=False,
        expected_food_origin=case.expected_food_origin,
        actual_food_origin=None,
        food_origin_match=False,
        required_terms_missing=case.required_ingredient_terms,
        required_terms_pass=False,
        visible_allergen_recall_eligible=len(case.required_visible_allergens) > 0,
        visible_allergens_missing=case.required_visible_allergens,
        visible_allergen_recall_pass=False,
        status_reason_terms_eligible=len(case.required_status_reason_terms) > 0,
        status_reason_terms_missing=case.required_status_reason_terms,
        status_reason_terms_pass=False,
        bbox_count=0,
        invalid_bbox_count=0,
        bbox_valid_pass=True,
        elapsed_ms=elapsed_ms,
        used_model=None,
        prompt_version=None,
        finish_reason=None,
        fallback_used=False,
        fallback_reason=None,
        chargeable=False,
        usage_metadata={},
        error_type=type(error).__name__,
        error_message=str(error),
        output=None,
    )


def _evaluate_case_model(case: FoodEvalCase, model_name: str, analyst: FoodAnalyst) -> FoodEvalResult:
    image_sha256 = _sha256_file(case.image_path)
    started_at = time.monotonic()
    try:
        with Image.open(case.image_path) as raw_image:
            image = ImageOps.exif_transpose(raw_image).convert("RGB")
        output = analyst.analyze_food_job_json(image, case.allergy_info, case.iso_country)
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        if not isinstance(output, dict):
            raise TypeError("Food analyst output must be a dict")
        return _evaluate_output(case, model_name, image_sha256, elapsed_ms, output)
    except Exception as error:
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        return _evaluate_error(case, model_name, image_sha256, elapsed_ms, error)


@contextmanager
def _temporary_env(name: str, value: str) -> Iterator[None]:
    previous_value = os.environ.get(name)
    os.environ[name] = value
    try:
        yield
    finally:
        if previous_value is None:
            os.environ.pop(name, None)
        else:
            os.environ[name] = previous_value


def _calculate_rate(values: list[bool]) -> float:
    if not values:
        return 1.0
    return sum(1 for value in values if value) / len(values)


def _calculate_p95(values: list[int]) -> int | None:
    if not values:
        return None
    sorted_values = sorted(values)
    index = max(0, math.ceil(0.95 * len(sorted_values)) - 1)
    return sorted_values[index]


def _sum_usage(results: list[FoodEvalResult]) -> dict[str, int]:
    usage_totals: dict[str, int] = {}
    for result in results:
        for key, value in result.usage_metadata.items():
            usage_totals[key] = usage_totals.get(key, 0) + value
    return usage_totals


def _build_model_summary(results: list[FoodEvalResult]) -> dict[str, Any]:
    elapsed_values = [result.elapsed_ms for result in results]
    bbox_count = sum(result.bbox_count for result in results)
    invalid_bbox_count = sum(result.invalid_bbox_count for result in results)
    visible_results = [result for result in results if result.visible_allergen_recall_eligible]
    status_reason_results = [result for result in results if result.status_reason_terms_eligible]
    return {
        "case_count": len(results),
        "success_rate": _calculate_rate([result.success for result in results]),
        "expected_status_match_rate": _calculate_rate([result.expected_status_match for result in results]),
        "food_origin_match_rate": _calculate_rate([result.food_origin_match for result in results]),
        "required_terms_pass_rate": _calculate_rate([result.required_terms_pass for result in results]),
        "visible_allergen_recall_rate": _calculate_rate(
            [result.visible_allergen_recall_pass for result in visible_results]
        ),
        "status_reason_terms_pass_rate": _calculate_rate(
            [result.status_reason_terms_pass for result in status_reason_results]
        ),
        "invalid_bbox_rate": invalid_bbox_count / bbox_count if bbox_count else 0.0,
        "bbox_count": bbox_count,
        "invalid_bbox_count": invalid_bbox_count,
        "p50_elapsed_ms": int(statistics.median(elapsed_values)) if elapsed_values else None,
        "p95_elapsed_ms": _calculate_p95(elapsed_values),
        "fallback_count": sum(1 for result in results if result.fallback_used),
        "chargeable_count": sum(1 for result in results if result.chargeable),
        "usage_metadata_totals": _sum_usage(results),
    }


def _summarize_results(results: list[FoodEvalResult], thresholds: FoodEvalThresholds) -> dict[str, Any]:
    model_names = sorted({result.model_name for result in results})
    by_model = {
        model_name: _build_model_summary([result for result in results if result.model_name == model_name])
        for model_name in model_names
    }
    failures = _build_gate_failures(by_model, thresholds)
    return {
        "prompt_version": ANALYSIS_PROMPT_VERSION,
        "models": by_model,
        "failures": failures,
        "thresholds": asdict(thresholds),
    }


def _build_gate_failures(model_summaries: dict[str, dict[str, Any]], thresholds: FoodEvalThresholds) -> list[dict[str, Any]]:
    checks = [
        ("success_rate", thresholds.min_success_rate, "min"),
        ("expected_status_match_rate", thresholds.min_expected_status_match_rate, "min"),
        ("food_origin_match_rate", thresholds.min_food_origin_match_rate, "min"),
        ("required_terms_pass_rate", thresholds.min_required_terms_pass_rate, "min"),
        ("visible_allergen_recall_rate", thresholds.min_visible_allergen_recall_rate, "min"),
        ("status_reason_terms_pass_rate", thresholds.min_status_reason_terms_pass_rate, "min"),
        ("invalid_bbox_rate", thresholds.max_invalid_bbox_rate, "max"),
    ]
    failures: list[dict[str, Any]] = []
    for model_name, summary in model_summaries.items():
        for metric, threshold, mode in checks:
            actual = summary[metric]
            failed = actual < threshold if mode == "min" else actual > threshold
            if failed:
                failures.append({"model": model_name, "metric": metric, "actual": actual, "threshold": threshold})
        if thresholds.max_p95_elapsed_ms is not None:
            actual_p95 = summary["p95_elapsed_ms"]
            if actual_p95 is not None and actual_p95 > thresholds.max_p95_elapsed_ms:
                failures.append(
                    {
                        "model": model_name,
                        "metric": "p95_elapsed_ms",
                        "actual": actual_p95,
                        "threshold": thresholds.max_p95_elapsed_ms,
                    }
                )
    return failures


def _env_key_presence() -> dict[str, str]:
    return {key: "present" if os.getenv(key) else "missing" for key in ENV_KEY_PRESENCE_NAMES}


def _estimate_paid_calls(case_count: int, model_count: int) -> int:
    raw_provider_call_budget = os.getenv("GEMINI_FOOD_MAX_PROVIDER_CALLS_PER_REQUEST", "").strip()
    provider_call_budget = (
        _parse_positive_int_value("GEMINI_FOOD_MAX_PROVIDER_CALLS_PER_REQUEST", raw_provider_call_budget)
        if raw_provider_call_budget
        else GEMINI_FOOD_MAX_PROVIDER_CALLS_PER_REQUEST_DEFAULT
    )
    return case_count * model_count * provider_call_budget


def _run_eval(config: FoodEvalConfig, analyst_factory: Callable[[], FoodAnalyst] = FoodAnalyst) -> tuple[list[FoodEvalResult], dict[str, Any]]:
    cases = _load_cases(config.manifest_path, config.sample_limit)
    estimated_paid_calls = _estimate_paid_calls(len(cases), len(config.models))
    if estimated_paid_calls > config.max_paid_calls:
        raise SystemExit(
            f"Estimated Vertex calls {estimated_paid_calls} exceed FOOD_GOLDEN_EVAL_MAX_PAID_CALLS={config.max_paid_calls}"
        )
    results: list[FoodEvalResult] = []
    for model_name in config.models:
        with _temporary_env("GEMINI_MODEL_NAME", model_name):
            analyst = analyst_factory()
            for case in cases:
                results.append(_evaluate_case_model(case, model_name, analyst))
    run_metadata = {
        "manifest_path": str(config.manifest_path),
        "case_count": len(cases),
        "models": config.models,
        "estimated_paid_calls": estimated_paid_calls,
        "env_key_presence": _env_key_presence(),
    }
    return results, run_metadata


def _serialize_results(results: list[FoodEvalResult]) -> list[dict[str, Any]]:
    return [asdict(result) for result in results]


def _write_artifacts(config: FoodEvalConfig, results: list[FoodEvalResult], summary: dict[str, Any], run_metadata: dict[str, Any]) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = config.output_root / timestamp
    output_dir.mkdir(parents=True, exist_ok=False)
    (output_dir / "results.json").write_text(
        json.dumps(_serialize_results(results), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    summary_payload = {"run": run_metadata, **summary}
    (output_dir / "summary.json").write_text(
        json.dumps(summary_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return output_dir


def main() -> int:
    args = _parse_args()
    _load_project_env(REPO_ROOT)
    _require_paid_eval_approval()
    config = _build_config(args, REPO_ROOT)
    results, run_metadata = _run_eval(config)
    summary = _summarize_results(results, config.gate_thresholds)
    output_dir = _write_artifacts(config, results, summary, run_metadata)
    print(f"[FOOD-GOLDEN-EVAL] output_dir={output_dir}")
    print(f"[FOOD-GOLDEN-EVAL] env_key_presence={run_metadata['env_key_presence']}")
    print(f"[FOOD-GOLDEN-EVAL] failures={len(summary['failures'])}")
    for model_name, model_summary in summary["models"].items():
        print(
            "[FOOD-GOLDEN-EVAL] "
            f"model={model_name} "
            f"success_rate={model_summary['success_rate']:.3f} "
            f"status_match_rate={model_summary['expected_status_match_rate']:.3f} "
            f"food_origin_match_rate={model_summary['food_origin_match_rate']:.3f} "
            f"p95_elapsed_ms={model_summary['p95_elapsed_ms']}"
        )
    if summary["failures"] and config.fail_on_regression:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
