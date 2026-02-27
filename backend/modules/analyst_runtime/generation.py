import random
import time
import os
import threading
from typing import Any, Callable

from google.api_core import retry
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from vertexai.generative_models import GenerativeModel

JITTER_MAX_MS = 500
JITTER_DIVISOR = 1000
FALLBACK_MODEL_DISPLAY = "gemini-2.0-flash"


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
        return value if value > 0 else default
    except ValueError:
        return default


MAX_CONCURRENT_SLOTS = _env_int("GEMINI_MAX_CONCURRENT_SLOTS", 3)
RETRY_INITIAL_SECONDS = _env_float("GEMINI_RETRY_INITIAL_SECONDS", 2.0)
RETRY_MAX_SECONDS = _env_float("GEMINI_RETRY_MAX_SECONDS", 30.0)
RETRY_MULTIPLIER = _env_float("GEMINI_RETRY_MULTIPLIER", 2.0)
RETRY_TIMEOUT_SECONDS = _env_float("GEMINI_RETRY_TIMEOUT_SECONDS", 60.0)
LABEL_429_BACKOFF_INITIAL_SECONDS = _env_float("GEMINI_429_BACKOFF_INITIAL_SECONDS", 0.5)
LABEL_429_BACKOFF_MULTIPLIER = _env_float("GEMINI_429_BACKOFF_MULTIPLIER", 2.0)
RETRY_429_COOLDOWN_SECONDS = _env_float("GEMINI_429_COOLDOWN_SECONDS", 15.0)
RETRY_429_COOLDOWN_MIN_CONSECUTIVE = _env_int("GEMINI_429_COOLDOWN_MIN_CONSECUTIVE", 4)


def create_request_semaphore() -> threading.Semaphore:
    return threading.Semaphore(MAX_CONCURRENT_SLOTS)


def _build_retry_error_handler(retry_stats: dict[str, Any]) -> Callable[[Exception], None]:
    def on_retry_error(exception: Exception) -> None:
        retry_stats["total_retries"] += 1
        if "429" in str(exception) or "ResourceExhausted" in str(type(exception).__name__):
            retry_stats["last_429_time"] = time.time()
            retry_stats["consecutive_429"] = int(retry_stats.get("consecutive_429", 0)) + 1
        else:
            retry_stats["consecutive_429"] = 0
        print(f"[Internal Log] Retry triggered: {type(exception).__name__}")

    return on_retry_error


def _invoke_generation_with_retry(
    retry_policy: retry.Retry,
    model: GenerativeModel,
    contents: Any,
    generation_config: dict[str, Any],
    safety_settings: dict[str, Any],
) -> Any:
    return retry_policy(model.generate_content)(
        contents,
        generation_config=generation_config,
        safety_settings=safety_settings,
    )


def generate_with_semaphore(
    model: GenerativeModel,
    contents: Any,
    generation_config: dict[str, Any],
    safety_settings: dict[str, Any],
    semaphore: Any,
) -> Any:
    with semaphore:
        return model.generate_content(
            contents,
            generation_config=generation_config,
            safety_settings=safety_settings,
        )


def generate_with_429_backoff(
    model: GenerativeModel,
    contents: Any,
    generation_config: dict[str, Any],
    safety_settings: dict[str, Any],
    semaphore: Any,
    *,
    max_attempts: int = 3,
    initial_delay_s: float = LABEL_429_BACKOFF_INITIAL_SECONDS,
) -> Any:
    """
    Retry only for 429(ResourceExhausted) with exponential backoff.
    """
    delay = max(0.0, initial_delay_s)
    attempts = max(1, max_attempts)
    last_error: Exception | None = None

    for attempt in range(1, attempts + 1):
        try:
            with semaphore:
                return model.generate_content(
                    contents,
                    generation_config=generation_config,
                    safety_settings=safety_settings,
                )
        except ResourceExhausted as exc:
            last_error = exc
            if attempt >= attempts:
                break
            sleep_s = delay + random.uniform(0, JITTER_MAX_MS) / JITTER_DIVISOR
            print(f"[Label Retry] 429 backoff attempt={attempt} sleep_s={sleep_s:.2f}")
            time.sleep(sleep_s)
            delay = max(delay * LABEL_429_BACKOFF_MULTIPLIER, LABEL_429_BACKOFF_INITIAL_SECONDS)
        except Exception:
            raise

    if last_error:
        raise last_error
    raise RuntimeError("Label generation failed without explicit error")


def build_retry_policy(retry_stats: dict[str, Any]) -> retry.Retry:
    return retry.Retry(
        predicate=retry.if_exception_type(ResourceExhausted, ServiceUnavailable),
        initial=RETRY_INITIAL_SECONDS,
        maximum=RETRY_MAX_SECONDS,
        multiplier=RETRY_MULTIPLIER,
        timeout=RETRY_TIMEOUT_SECONDS,
        on_error=_build_retry_error_handler(retry_stats),
    )


def generate_with_retry_and_fallback(
    primary_model,
    primary_model_name: str,
    fallback_model_name: str,
    contents: Any,
    generation_config: dict[str, Any],
    safety_settings: dict[str, Any],
    semaphore: Any,
    retry_stats: dict[str, Any],
) -> Any:
    jitter_s = random.uniform(0, JITTER_MAX_MS) / JITTER_DIVISOR
    time.sleep(jitter_s)

    retry_policy = build_retry_policy(retry_stats)
    now = time.time()
    last_429_time = float(retry_stats.get("last_429_time") or 0.0)
    consecutive_429 = int(retry_stats.get("consecutive_429", 0))
    cooldown_active = (
        last_429_time > 0
        and (now - last_429_time) < RETRY_429_COOLDOWN_SECONDS
        and consecutive_429 >= RETRY_429_COOLDOWN_MIN_CONSECUTIVE
    )
    print(
        f"Vertex AI: Sending request (jitter={jitter_s:.3f}s, concurrent slots={semaphore._value}/{MAX_CONCURRENT_SLOTS})..."
    )
    print(f"[API Debug] Model name: {primary_model_name}")
    print(f"[API Debug] Has response_schema: {'response_schema' in generation_config}")
    print(f"[API Debug] Generation config keys: {list(generation_config.keys())}")
    if cooldown_active:
        print(
            "[429 Guard] primary temporarily bypassed "
            f"(cooldown_s={RETRY_429_COOLDOWN_SECONDS}, consecutive_429={consecutive_429})"
        )
        backup_model = GenerativeModel(fallback_model_name)
        response = _invoke_generation_with_retry(
            retry_policy,
            backup_model,
            contents,
            generation_config,
            safety_settings,
        )
        retry_stats["last_used_model"] = fallback_model_name
        print(f"[API Debug] ✓ Backup model response received ({fallback_model_name})")
        return response

    with semaphore:
        try:
            response = _invoke_generation_with_retry(
                retry_policy,
                primary_model,
                contents,
                generation_config,
                safety_settings,
            )
            retry_stats["last_used_model"] = primary_model_name
            retry_stats["consecutive_429"] = 0
            print("[API Debug] ✓ Primary model response received")
            return response
        except Exception as primary_error:
            print(f"[Model Fallback] Primary model ({primary_model_name}) failed: {primary_error}")
            print(f"[Model Fallback] Error type: {type(primary_error).__name__}")
            print(f"[Model Fallback] Switching to backup model: {FALLBACK_MODEL_DISPLAY}")

            backup_model = GenerativeModel(fallback_model_name)
            response = _invoke_generation_with_retry(
                retry_policy,
                backup_model,
                contents,
                generation_config,
                safety_settings,
            )
            retry_stats["last_used_model"] = fallback_model_name
            print(f"[API Debug] ✓ Backup model response received ({fallback_model_name})")
            return response
