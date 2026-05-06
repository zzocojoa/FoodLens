"""Label extract response parsing and normalization helpers."""

import json
import re
from typing import Any, Final, Literal, TypedDict

from backend.modules.analyst_core.response_utils import parse_ai_response


LABEL_NUTRITION_FIELDS: Final[tuple[str, ...]] = (
    "calories",
    "carbs",
    "protein",
    "fat",
    "sugar",
    "sodium",
    "fiber",
)
LABEL_NUTRITION_STRING_FIELDS: Final[tuple[str, ...]] = ("servingSize",)
LABEL_DATA_SOURCE: Final[str] = "OCR_Label"
LABEL_REPAIR_STRIP_FENCE: Final[str] = "strip_markdown_fence"
LABEL_REPAIR_EXTRACT_BRACES: Final[str] = "extract_json_object"
LABEL_REPAIR_REMOVE_TRAILING_COMMAS: Final[str] = "remove_trailing_commas"
LABEL_REPAIR_CLOSE_JSON: Final[str] = "close_unclosed_json"
LABEL_NORMALIZE_FIELDS: Final[str] = "normalize_label_extract_fields"
MARKDOWN_JSON_PREFIX: Final[str] = "```json"
MARKDOWN_PREFIX: Final[str] = "```"
TRAILING_COMMA_REGEX = re.compile(r",(\s*[}\]])")

LabelParseStatus = Literal["parsed", "repaired", "failed"]


class LabelExtractParseResult(TypedDict):
    result: dict[str, Any]
    status: LabelParseStatus
    repair_strategies: list[str]
    raw_text_length: int
    parsed: bool
    parse_status: LabelParseStatus
    repair_strategy: str | None
    normalization_warnings: list[str]


def _is_korean_locale(locale: str) -> bool:
    return locale.strip().lower().startswith("ko")


def _empty_label_nutrition() -> dict[str, Any]:
    nutrition: dict[str, Any] = {
        field_name: None
        for field_name in LABEL_NUTRITION_FIELDS
    }
    for field_name in LABEL_NUTRITION_STRING_FIELDS:
        nutrition[field_name] = None
    nutrition["dataSource"] = LABEL_DATA_SOURCE
    return nutrition


def _strip_markdown_fence(text: str) -> tuple[str, list[str]]:
    stripped = text.strip()
    strategies: list[str] = []
    if stripped.startswith(MARKDOWN_JSON_PREFIX):
        stripped = stripped[len(MARKDOWN_JSON_PREFIX):].strip()
        strategies.append(LABEL_REPAIR_STRIP_FENCE)
    elif stripped.startswith(MARKDOWN_PREFIX):
        stripped = stripped[len(MARKDOWN_PREFIX):].strip()
        strategies.append(LABEL_REPAIR_STRIP_FENCE)
    if stripped.endswith(MARKDOWN_PREFIX):
        stripped = stripped[:-len(MARKDOWN_PREFIX)].strip()
        if LABEL_REPAIR_STRIP_FENCE not in strategies:
            strategies.append(LABEL_REPAIR_STRIP_FENCE)
    return stripped, strategies


def _extract_json_object(text: str) -> tuple[str | None, list[str]]:
    first_brace = text.find("{")
    if first_brace < 0:
        return None, []

    last_brace = text.rfind("}")
    if last_brace > first_brace:
        return text[first_brace:last_brace + 1], [LABEL_REPAIR_EXTRACT_BRACES]
    return text[first_brace:], [LABEL_REPAIR_EXTRACT_BRACES]


def _remove_trailing_commas(text: str) -> tuple[str, list[str]]:
    repaired = TRAILING_COMMA_REGEX.sub(r"\1", text)
    if repaired == text:
        return repaired, []
    return repaired, [LABEL_REPAIR_REMOVE_TRAILING_COMMAS]


def _last_safe_json_boundary(text: str) -> int:
    stack: list[str] = []
    in_string = False
    escaped = False
    last_boundary = -1
    for index, char in enumerate(text):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "\"":
                in_string = False
                if stack:
                    last_boundary = index + 1
            continue

        if char == "\"":
            in_string = True
        elif char in "{[":
            stack.append(char)
        elif char in "}]":
            if stack:
                stack.pop()
            last_boundary = index + 1
        elif char == "," and stack:
            last_boundary = index
    return last_boundary


def _close_unclosed_json(text: str) -> tuple[str, list[str]]:
    candidate = text.strip()
    boundary = _last_safe_json_boundary(candidate)
    if boundary > 0 and boundary < len(candidate):
        candidate = candidate[:boundary].rstrip()
    candidate = candidate.rstrip(",")

    stack: list[str] = []
    in_string = False
    escaped = False
    for char in candidate:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == "\"":
                in_string = False
            continue
        if char == "\"":
            in_string = True
        elif char in "{[":
            stack.append(char)
        elif char == "}" and stack and stack[-1] == "{":
            stack.pop()
        elif char == "]" and stack and stack[-1] == "[":
            stack.pop()

    if in_string:
        boundary = _last_safe_json_boundary(candidate)
        if boundary <= 0:
            return text, []
        candidate = candidate[:boundary].rstrip().rstrip(",")

    closing_chars = []
    for opener in reversed(stack):
        closing_chars.append("}" if opener == "{" else "]")
    if not closing_chars and candidate == text:
        return candidate, []
    return candidate + "".join(closing_chars), [LABEL_REPAIR_CLOSE_JSON]


def _try_parse_json(text: str) -> dict[str, Any] | None:
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(value, dict):
        return None
    return value


def _parse_with_repair(response_text: str) -> tuple[dict[str, Any] | None, list[str]]:
    stripped, strip_strategies = _strip_markdown_fence(response_text)
    candidates: list[tuple[str, list[str]]] = [(stripped, strip_strategies)]

    extracted, extract_strategies = _extract_json_object(stripped)
    if extracted is not None:
        candidates.append((extracted, strip_strategies + extract_strategies))

    expanded_candidates: list[tuple[str, list[str]]] = []
    for candidate, strategies in candidates:
        no_trailing_comma, comma_strategies = _remove_trailing_commas(candidate)
        expanded_candidates.append((candidate, strategies))
        expanded_candidates.append((no_trailing_comma, strategies + comma_strategies))
        closed, close_strategies = _close_unclosed_json(no_trailing_comma)
        expanded_candidates.append((closed, strategies + comma_strategies + close_strategies))

    seen_candidates: set[str] = set()
    for candidate, strategies in expanded_candidates:
        if candidate in seen_candidates:
            continue
        seen_candidates.add(candidate)
        parsed = _try_parse_json(candidate)
        if parsed is not None:
            return parsed, list(dict.fromkeys(strategies))
    return None, []


def _coerce_optional_number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            number = float(stripped.replace(",", ""))
        except ValueError:
            return None
        if number.is_integer():
            return int(number)
        return number
    return None


def _normalize_nutrition(value: Any) -> tuple[dict[str, Any], list[str]]:
    changed = False
    warnings: list[str] = []
    normalized = _empty_label_nutrition()
    if not isinstance(value, dict):
        return normalized, ["missing_nutrition"]

    for field_name in LABEL_NUTRITION_FIELDS:
        coerced = _coerce_optional_number(value.get(field_name))
        normalized[field_name] = coerced
        if coerced != value.get(field_name):
            changed = True
            warnings.append(f"normalized_{field_name}")
    serving_size = value.get("servingSize")
    normalized["servingSize"] = serving_size.strip() if isinstance(serving_size, str) and serving_size.strip() else None
    if normalized["servingSize"] != serving_size:
        changed = True
        warnings.append("normalized_servingSize")
    data_source = value.get("dataSource")
    normalized["dataSource"] = data_source.strip() if isinstance(data_source, str) and data_source.strip() else LABEL_DATA_SOURCE
    if normalized["dataSource"] != data_source:
        changed = True
        warnings.append("normalized_dataSource")
    return normalized, warnings if changed else []


def _normalize_ingredient_item(value: Any) -> dict[str, Any] | None:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            return {"name": stripped}
        return None
    if not isinstance(value, dict):
        return None
    name = value.get("name")
    if not isinstance(name, str):
        return None
    stripped_name = name.strip()
    if not stripped_name:
        return None
    return {"name": stripped_name}


def _normalize_ingredients(value: Any) -> tuple[list[dict[str, Any]], list[str]]:
    if isinstance(value, str):
        split_names = [item.strip() for item in value.split(",") if item.strip()]
        return [{"name": item} for item in split_names], ["normalized_ingredients"]
    if not isinstance(value, list):
        return [], ["missing_ingredients"]

    warnings: list[str] = []
    normalized: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    for item in value:
        normalized_item = _normalize_ingredient_item(item)
        if normalized_item is None:
            warnings.append("dropped_ingredient")
            continue
        name_key = normalized_item["name"].casefold()
        if name_key in seen_names:
            warnings.append("deduped_ingredient")
            continue
        seen_names.add(name_key)
        normalized.append(normalized_item)
        if normalized_item != item:
            warnings.append("normalized_ingredients")
    return normalized, list(dict.fromkeys(warnings))


def _has_useful_nutrition(nutrition: dict[str, Any]) -> bool:
    for field_name in LABEL_NUTRITION_FIELDS:
        if nutrition.get(field_name) is not None:
            return True
    serving_size = nutrition.get("servingSize")
    return isinstance(serving_size, str) and bool(serving_size.strip())


def normalize_label_extract_result(value: dict[str, Any], locale: str) -> tuple[dict[str, Any], list[str]]:
    normalized: dict[str, Any] = {}
    warnings: list[str] = []

    food_name = value.get("foodName")
    if isinstance(food_name, str) and food_name.strip():
        normalized["foodName"] = food_name.strip()
    else:
        normalized["foodName"] = "라벨 식품" if _is_korean_locale(locale) else "Label food"
        warnings.append("missing_foodName")

    confidence = value.get("confidence")
    if isinstance(confidence, bool):
        normalized["confidence"] = 0
        warnings.append("normalized_confidence")
    elif isinstance(confidence, int):
        normalized["confidence"] = max(0, min(100, confidence))
        if normalized["confidence"] != confidence:
            warnings.append("normalized_confidence")
    else:
        normalized["confidence"] = 0
        warnings.append("missing_confidence")

    nutrition, nutrition_warnings = _normalize_nutrition(value.get("nutrition"))
    normalized["nutrition"] = nutrition
    warnings.extend(nutrition_warnings)

    ingredients, ingredient_warnings = _normalize_ingredients(value.get("ingredients"))
    normalized["ingredients"] = ingredients
    warnings.extend(ingredient_warnings)

    raw_result = value.get("raw_result")
    if isinstance(raw_result, str) and raw_result.strip():
        normalized["raw_result"] = raw_result.strip()
    elif ingredients or _has_useful_nutrition(nutrition):
        normalized["raw_result"] = (
            "라벨에서 일부 성분 또는 영양 정보를 추출했습니다."
            if _is_korean_locale(locale)
            else "Some label ingredients or nutrition data were extracted."
        )
        warnings.append("missing_raw_result")
    else:
        normalized["raw_result"] = (
            "라벨 문자를 안정적으로 해석하지 못했습니다."
            if _is_korean_locale(locale)
            else "The label text could not be parsed reliably."
        )
        warnings.append("missing_raw_result")

    return normalized, list(dict.fromkeys(warnings))


def _is_useful_label_extract_result(result: dict[str, Any]) -> bool:
    ingredients = result.get("ingredients")
    nutrition = result.get("nutrition")
    has_ingredients = isinstance(ingredients, list) and len(ingredients) > 0
    has_nutrition = isinstance(nutrition, dict) and _has_useful_nutrition(nutrition)
    return has_ingredients or has_nutrition


def _build_parse_result(
    result: dict[str, Any],
    status: LabelParseStatus,
    repair_strategies: list[str],
    raw_text_length: int,
    normalization_warnings: list[str],
) -> LabelExtractParseResult:
    unique_strategies = list(dict.fromkeys(repair_strategies))
    structural_strategies = [
        strategy
        for strategy in unique_strategies
        if strategy != LABEL_NORMALIZE_FIELDS
    ]
    repair_strategy = (
        structural_strategies[-1]
        if structural_strategies
        else unique_strategies[-1]
        if unique_strategies
        else None
    )
    return {
        "result": result,
        "status": status,
        "repair_strategies": unique_strategies,
        "raw_text_length": raw_text_length,
        "parsed": status != "failed",
        "parse_status": status,
        "repair_strategy": repair_strategy,
        "normalization_warnings": list(dict.fromkeys(normalization_warnings)),
    }


def parse_label_extract_response(response_text: str, locale: str) -> LabelExtractParseResult:
    parsed = parse_ai_response(response_text)
    strategies: list[str] = []
    if str(parsed.get("foodName", "")).strip() == "Analysis Error":
        parsed, strategies = _parse_with_repair(response_text)
        if parsed is None:
            normalized, warnings = normalize_label_extract_result({}, locale)
            return _build_parse_result(normalized, "failed", [], len(response_text), warnings)

    normalized, warnings = normalize_label_extract_result(parsed, locale)
    if warnings:
        strategies.append(LABEL_NORMALIZE_FIELDS)
    if not _is_useful_label_extract_result(normalized):
        return _build_parse_result(normalized, "failed", strategies, len(response_text), warnings)

    status: LabelParseStatus = "repaired" if strategies else "parsed"
    return _build_parse_result(normalized, status, strategies, len(response_text), warnings)
