import random
import time
import os
import threading
from typing import Any, Callable

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
RETRY_TIMEOUT_SECONDS = _env_float("GEMINI_RETRY_TIMEOUT_SECONDS", 15.0)
RETRY_MAX_ATTEMPTS = _env_int("GEMINI_RETRY_MAX_ATTEMPTS", 3)
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


def _is_retryable_generation_error(error: Exception) -> bool:
    return isinstance(error, (ResourceExhausted, ServiceUnavailable))


def _build_retry_delay_seconds(attempt: int) -> float:
    backoff_seconds = RETRY_INITIAL_SECONDS * (RETRY_MULTIPLIER ** max(0, attempt - 1))
    return min(backoff_seconds, RETRY_MAX_SECONDS)


def _invoke_generation_with_retry(
    model: GenerativeModel,
    contents: Any,
    generation_config: dict[str, Any],
    safety_settings: dict[str, Any],
    retry_stats: dict[str, Any],
    max_attempts_override: int | None = None,
    provider_attempt_counter: dict[str, int] | None = None,
) -> Any:
    last_error: Exception | None = None
    on_retry_error = _build_retry_error_handler(retry_stats)
    started_at = time.perf_counter()
    max_attempts = max(1, max_attempts_override or RETRY_MAX_ATTEMPTS)

    for attempt in range(1, max_attempts + 1):
        try:
            if provider_attempt_counter is not None:
                provider_attempt_counter["count"] = int(provider_attempt_counter.get("count", 0)) + 1
            return model.generate_content(
                contents,
                generation_config=generation_config,
                safety_settings=safety_settings,
            )
        except Exception as error:
            if not _is_retryable_generation_error(error):
                raise
            on_retry_error(error)
            last_error = error
            if attempt >= max_attempts:
                break
            elapsed_seconds = time.perf_counter() - started_at
            remaining_seconds = RETRY_TIMEOUT_SECONDS - elapsed_seconds
            if remaining_seconds <= 0:
                break
            delay_seconds = min(_build_retry_delay_seconds(attempt), remaining_seconds)
            print(
                f"[API Retry] attempt={attempt} max_attempts={max_attempts} "
                f"sleep_s={delay_seconds:.2f} error={type(error).__name__}"
            )
            time.sleep(delay_seconds)

    if last_error is not None:
        raise last_error
    raise RuntimeError("Generation failed without explicit error")


def _mark_generation_response_model(
    response: Any,
    model_name: str,
    provider_call_count: int,
    fallback_used: bool,
    fallback_reason: str | None,
) -> Any:
    try:
        setattr(response, "_foodlens_used_model", model_name)
        setattr(response, "_foodlens_provider_call_count", provider_call_count)
        setattr(response, "_foodlens_fallback_used", fallback_used)
        setattr(response, "_foodlens_fallback_reason", fallback_reason)
    except Exception as error:
        print(f"[Generation Metadata] used_model annotation failed error_type={type(error).__name__}")
    return response


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


def generate_with_retry_and_fallback(
    primary_model,
    primary_model_name: str,
    fallback_model_name: str,
    contents: Any,
    generation_config: dict[str, Any],
    safety_settings: dict[str, Any],
    semaphore: Any,
    retry_stats: dict[str, Any],
    max_attempts: int | None = None,
    fallback_enabled: bool = True,
    fallback_generation_config: dict[str, Any] | None = None,
) -> Any:
    jitter_s = random.uniform(0, JITTER_MAX_MS) / JITTER_DIVISOR
    time.sleep(jitter_s)
    provider_attempt_counter = {"count": 0}

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
    selected_fallback_generation_config = (
        generation_config
        if fallback_generation_config is None
        else fallback_generation_config
    )
    if cooldown_active:
        if not fallback_enabled:
            raise ResourceExhausted("Primary model is in 429 cooldown and fallback is disabled.")
        print(
            "[429 Guard] primary temporarily bypassed "
            f"(cooldown_s={RETRY_429_COOLDOWN_SECONDS}, consecutive_429={consecutive_429})"
        )
        backup_model = GenerativeModel(fallback_model_name)
        response = _invoke_generation_with_retry(
            backup_model,
            contents,
            selected_fallback_generation_config,
            safety_settings,
            retry_stats,
            1,
            provider_attempt_counter,
        )
        retry_stats["last_used_model"] = fallback_model_name
        print(f"[API Debug] ✓ Backup model response received ({fallback_model_name})")
        return _mark_generation_response_model(
            response,
            fallback_model_name,
            provider_attempt_counter["count"],
            True,
            "primary_429_cooldown",
        )

    with semaphore:
        try:
            response = _invoke_generation_with_retry(
                primary_model,
                contents,
                generation_config,
                safety_settings,
                retry_stats,
                max_attempts,
                provider_attempt_counter,
            )
            retry_stats["last_used_model"] = primary_model_name
            retry_stats["consecutive_429"] = 0
            print("[API Debug] ✓ Primary model response received")
            return _mark_generation_response_model(
                response,
                primary_model_name,
                provider_attempt_counter["count"],
                False,
                None,
            )
        except Exception as primary_error:
            if not fallback_enabled:
                raise
            print(f"[Model Fallback] Primary model ({primary_model_name}) failed: {primary_error}")
            print(f"[Model Fallback] Error type: {type(primary_error).__name__}")
            print(f"[Model Fallback] Switching to backup model: {FALLBACK_MODEL_DISPLAY}")

            backup_model = GenerativeModel(fallback_model_name)
            response = _invoke_generation_with_retry(
                backup_model,
                contents,
                selected_fallback_generation_config,
                safety_settings,
                retry_stats,
                1,
                provider_attempt_counter,
            )
            retry_stats["last_used_model"] = fallback_model_name
            print(f"[API Debug] ✓ Backup model response received ({fallback_model_name})")
            return _mark_generation_response_model(
                response,
                fallback_model_name,
                provider_attempt_counter["count"],
                True,
                "primary_fallback",
            )
