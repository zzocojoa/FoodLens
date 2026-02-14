"""Response parsing, fallback, and sanitization helpers."""

import json
import os
import re
from typing import Any, Final

DANGEROUS_PATTERNS: Final[list[str]] = [
    r"https?://\S+",
    r"<script.*?>.*?</script>",
    r"javascript:",
    r"data:text/html",
    r"on\w+\s*=",
]
BLOCKLIST_PATTERNS: Final[list[str]] = [
    r"\b(fuck|shit|bitch|asshole)\b",
    r"\b(nigger|faggot)\b",
]
MAX_TEXT_LENGTH: Final[int] = 500
MAX_FOOD_NAME_LENGTH: Final[int] = 100
PARSE_DEBUG_DIVIDER: Final[str] = "=" * 60
MARKDOWN_JSON_PREFIX: Final[str] = "```json"
MARKDOWN_PREFIX: Final[str] = "```"
DANGEROUS_REPLACEMENT: Final[str] = "[링크 제거됨]"
BLOCKLIST_REPLACEMENT: Final[str] = "[내용 필터링됨]"
FALLBACK_PARSE_ERROR_MESSAGE: Final[str] = "AI 응답을 처리할 수 없습니다. 다시 시도해주세요."
PARSE_DEBUG_ENV_KEY: Final[str] = "FOODLENS_PARSE_DEBUG"
DANGEROUS_REGEX = re.compile("|".join(DANGEROUS_PATTERNS), re.IGNORECASE | re.DOTALL)
BLOCKLIST_REGEX = re.compile("|".join(BLOCKLIST_PATTERNS), re.IGNORECASE)


def _is_parse_debug_enabled() -> bool:
    return os.getenv(PARSE_DEBUG_ENV_KEY, "").strip() == "1"


def _debug_log(message: str) -> None:
    if _is_parse_debug_enabled():
        print(message)


def _strip_markdown_fence(text: str) -> str:
    original_text = text
    if text.startswith(MARKDOWN_JSON_PREFIX):
        text = text[7:]
        _debug_log("[PARSE DEBUG] Stripped ```json prefix")
    if text.startswith(MARKDOWN_PREFIX):
        text = text[3:]
        _debug_log("[PARSE DEBUG] Stripped ``` prefix")
    if text.endswith(MARKDOWN_PREFIX):
        text = text[:-3]
        _debug_log("[PARSE DEBUG] Stripped ``` suffix")
    text = text.strip()
    if text != original_text:
        _debug_log(f"[PARSE DEBUG] After markdown cleanup: {repr(text[:200])}")
    return text


def _try_json_parse(text: str) -> dict[str, Any] | None:
    try:
        result = json.loads(text)
        _debug_log("[PARSE DEBUG] ✓ Standard JSON parse SUCCESS")
        return result
    except json.JSONDecodeError as error:
        _debug_log(f"[PARSE DEBUG] ✗ Standard JSON parse FAILED: {error}")
        _debug_log(f"[PARSE DEBUG] Error at position {error.pos}: {repr(text[max(0,error.pos-20):error.pos+20])}")
        return None


def _try_brace_recovery(text: str) -> dict[str, Any] | None:
    extracted = ""
    try:
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        _debug_log(f"[PARSE DEBUG] Brace positions: first={first_brace}, last={last_brace}")

        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            extracted = text[first_brace : last_brace + 1]
            _debug_log(f"[PARSE DEBUG] Extracted content length: {len(extracted)}")
            _debug_log(f"[PARSE DEBUG] Extracted first 200: {repr(extracted[:200])}")
            result = json.loads(extracted)
            _debug_log("[PARSE DEBUG] ✓ Brace extraction recovery SUCCESS")
            return result
    except json.JSONDecodeError as error:
        _debug_log(f"[PARSE DEBUG] ✗ Brace extraction recovery FAILED: {error}")
        _debug_log(f"[PARSE DEBUG] Error at position {error.pos}: {repr(extracted[max(0,error.pos-30):error.pos+30])}")
    return None


def _sanitize_text(text: str, max_length: int = MAX_TEXT_LENGTH) -> str:
    if not text or not isinstance(text, str):
        return text

    if len(text) > max_length:
        text = text[:max_length] + "..."
        _debug_log(f"[Internal Log] Text truncated to {max_length} chars.")

    if DANGEROUS_REGEX.search(text):
        _debug_log("[Internal Log] Dangerous pattern detected, sanitizing.")
        text = DANGEROUS_REGEX.sub(DANGEROUS_REPLACEMENT, text)

    if BLOCKLIST_REGEX.search(text):
        _debug_log("[Internal Log] Blocklist pattern detected, sanitizing.")
        return BLOCKLIST_REPLACEMENT

    return text


def get_safe_fallback_response(user_message: str) -> dict[str, Any]:
    return {
        "foodName": "분석 오류",
        "foodName_en": "Analysis Error",
        "foodName_ko": "분석 오류",
        "raw_result_en": "Analysis failed. Please try again.",
        "raw_result_ko": "분석에 실패했습니다. 다시 시도해주세요.",
        "canonicalFoodId": "error",
        "foodOrigin": "unknown",
        "safetyStatus": "CAUTION",
        "confidence": 0,
        "ingredients": [],
        "translationCard": {"language": "Korean", "text": None, "audio_query": None},
        "raw_result": user_message,
    }


def parse_ai_response(response_text: str) -> dict[str, Any]:
    _debug_log(f"\n{PARSE_DEBUG_DIVIDER}")
    _debug_log(f"[PARSE DEBUG] Raw response length: {len(response_text)} chars")
    _debug_log(f"[PARSE DEBUG] First 200 chars: {repr(response_text[:200])}")
    _debug_log(
        f"[PARSE DEBUG] Last 100 chars: {repr(response_text[-100:] if len(response_text) > 100 else response_text)}"
    )
    _debug_log(PARSE_DEBUG_DIVIDER)

    text = _strip_markdown_fence(response_text.strip())

    result = _try_json_parse(text)
    if result is not None:
        return result

    result = _try_brace_recovery(text)
    if result is not None:
        return result

    _debug_log("[PARSE DEBUG] ✗✗ ALL PARSING ATTEMPTS FAILED")
    _debug_log(f"[PARSE DEBUG] Full raw response:\n{response_text}")
    _debug_log(f"{PARSE_DEBUG_DIVIDER}\n")
    return get_safe_fallback_response(FALLBACK_PARSE_ERROR_MESSAGE)


def strip_box2d(result: dict[str, Any]) -> dict[str, Any]:
    if "ingredients" in result and isinstance(result["ingredients"], list):
        for ingredient in result["ingredients"]:
            if isinstance(ingredient, dict) and "box_2d" in ingredient:
                del ingredient["box_2d"]
    return result


def sanitize_response(result: dict[str, Any]) -> dict[str, Any]:
    if "ingredients" in result and isinstance(result["ingredients"], list):
        unique_ingredients = []
        seen_names = set()
        for ing in result["ingredients"]:
            if not isinstance(ing, dict):
                continue
            name = ing.get("name", "").strip()
            if not name:
                continue
            if "name_en" in ing and isinstance(ing.get("name_en"), str):
                ing["name_en"] = _sanitize_text(ing["name_en"], MAX_FOOD_NAME_LENGTH)
            if "name_ko" in ing and isinstance(ing.get("name_ko"), str):
                ing["name_ko"] = _sanitize_text(ing["name_ko"], MAX_FOOD_NAME_LENGTH)
            normalized = name.lower()
            if normalized not in seen_names:
                seen_names.add(normalized)
                unique_ingredients.append(ing)
        result["ingredients"] = unique_ingredients

    if "foodName" in result:
        result["foodName"] = _sanitize_text(result["foodName"], MAX_FOOD_NAME_LENGTH)
    if "foodName_en" in result:
        result["foodName_en"] = _sanitize_text(result["foodName_en"], MAX_FOOD_NAME_LENGTH)
    if "foodName_ko" in result:
        result["foodName_ko"] = _sanitize_text(result["foodName_ko"], MAX_FOOD_NAME_LENGTH)
    if "raw_result" in result:
        result["raw_result"] = _sanitize_text(result["raw_result"])
    if "raw_result_en" in result:
        result["raw_result_en"] = _sanitize_text(result["raw_result_en"])
    if "raw_result_ko" in result:
        result["raw_result_ko"] = _sanitize_text(result["raw_result_ko"])
    if "translationCard" in result and result["translationCard"]:
        if "text" in result["translationCard"]:
            result["translationCard"]["text"] = _sanitize_text(result["translationCard"]["text"])

    return result
