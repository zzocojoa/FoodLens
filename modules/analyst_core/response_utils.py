"""Response parsing, fallback, and sanitization helpers."""

import json
import re

DANGEROUS_PATTERNS = [
    r"https?://\S+",
    r"<script.*?>.*?</script>",
    r"javascript:",
    r"data:text/html",
    r"on\w+\s*=",
]
BLOCKLIST_PATTERNS = [
    r"\b(fuck|shit|bitch|asshole)\b",
    r"\b(nigger|faggot)\b",
]
MAX_TEXT_LENGTH = 500
MAX_FOOD_NAME_LENGTH = 100
DANGEROUS_REGEX = re.compile("|".join(DANGEROUS_PATTERNS), re.IGNORECASE | re.DOTALL)
BLOCKLIST_REGEX = re.compile("|".join(BLOCKLIST_PATTERNS), re.IGNORECASE)


def _strip_markdown_fence(text: str) -> str:
    original_text = text
    if text.startswith("```json"):
        text = text[7:]
        print("[PARSE DEBUG] Stripped ```json prefix")
    if text.startswith("```"):
        text = text[3:]
        print("[PARSE DEBUG] Stripped ``` prefix")
    if text.endswith("```"):
        text = text[:-3]
        print("[PARSE DEBUG] Stripped ``` suffix")
    text = text.strip()
    if text != original_text:
        print(f"[PARSE DEBUG] After markdown cleanup: {repr(text[:200])}")
    return text


def _try_json_parse(text: str):
    try:
        result = json.loads(text)
        print("[PARSE DEBUG] ✓ Standard JSON parse SUCCESS")
        return result
    except json.JSONDecodeError as error:
        print(f"[PARSE DEBUG] ✗ Standard JSON parse FAILED: {error}")
        print(f"[PARSE DEBUG] Error at position {error.pos}: {repr(text[max(0,error.pos-20):error.pos+20])}")
        return None


def _try_brace_recovery(text: str):
    extracted = ""
    try:
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        print(f"[PARSE DEBUG] Brace positions: first={first_brace}, last={last_brace}")

        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            extracted = text[first_brace : last_brace + 1]
            print(f"[PARSE DEBUG] Extracted content length: {len(extracted)}")
            print(f"[PARSE DEBUG] Extracted first 200: {repr(extracted[:200])}")
            result = json.loads(extracted)
            print("[PARSE DEBUG] ✓ Brace extraction recovery SUCCESS")
            return result
    except json.JSONDecodeError as error:
        print(f"[PARSE DEBUG] ✗ Brace extraction recovery FAILED: {error}")
        print(f"[PARSE DEBUG] Error at position {error.pos}: {repr(extracted[max(0,error.pos-30):error.pos+30])}")
    return None


def _sanitize_text(text: str, max_length: int = MAX_TEXT_LENGTH) -> str:
    if not text or not isinstance(text, str):
        return text

    if len(text) > max_length:
        text = text[:max_length] + "..."
        print(f"[Internal Log] Text truncated to {max_length} chars.")

    if DANGEROUS_REGEX.search(text):
        print("[Internal Log] Dangerous pattern detected, sanitizing.")
        text = DANGEROUS_REGEX.sub("[링크 제거됨]", text)

    if BLOCKLIST_REGEX.search(text):
        print("[Internal Log] Blocklist pattern detected, sanitizing.")
        return "[내용 필터링됨]"

    return text


def get_safe_fallback_response(user_message: str) -> dict:
    return {
        "foodName": "분석 오류",
        "foodName_en": "Analysis Error",
        "foodName_ko": "분석 오류",
        "canonicalFoodId": "error",
        "foodOrigin": "unknown",
        "safetyStatus": "CAUTION",
        "confidence": 0,
        "ingredients": [],
        "translationCard": {"language": "Korean", "text": None, "audio_query": None},
        "raw_result": user_message,
    }


def parse_ai_response(response_text: str) -> dict:
    print(f"\n{'='*60}")
    print(f"[PARSE DEBUG] Raw response length: {len(response_text)} chars")
    print(f"[PARSE DEBUG] First 200 chars: {repr(response_text[:200])}")
    print(
        f"[PARSE DEBUG] Last 100 chars: {repr(response_text[-100:] if len(response_text) > 100 else response_text)}"
    )
    print(f"{'='*60}")

    text = _strip_markdown_fence(response_text.strip())

    result = _try_json_parse(text)
    if result is not None:
        return result

    result = _try_brace_recovery(text)
    if result is not None:
        return result

    print("[PARSE DEBUG] ✗✗ ALL PARSING ATTEMPTS FAILED")
    print(f"[PARSE DEBUG] Full raw response:\n{response_text}")
    print(f"{'='*60}\n")
    return get_safe_fallback_response("AI 응답을 처리할 수 없습니다. 다시 시도해주세요.")


def strip_box2d(result: dict) -> dict:
    if "ingredients" in result and isinstance(result["ingredients"], list):
        for ingredient in result["ingredients"]:
            if isinstance(ingredient, dict) and "box_2d" in ingredient:
                del ingredient["box_2d"]
    return result


def sanitize_response(result: dict) -> dict:
    if "ingredients" in result and isinstance(result["ingredients"], list):
        unique_ingredients = []
        seen_names = set()
        for ing in result["ingredients"]:
            if not isinstance(ing, dict):
                continue
            name = ing.get("name", "").strip()
            if not name:
                continue
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
    if "translationCard" in result and result["translationCard"]:
        if "text" in result["translationCard"]:
            result["translationCard"]["text"] = _sanitize_text(result["translationCard"]["text"])

    return result
