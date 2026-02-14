import random
import time
from typing import Any, Callable

from google.api_core import retry
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from vertexai.generative_models import GenerativeModel

JITTER_MAX_MS = 500
JITTER_DIVISOR = 1000
MAX_CONCURRENT_SLOTS = 3
RETRY_INITIAL_SECONDS = 2.0
RETRY_MAX_SECONDS = 30.0
RETRY_MULTIPLIER = 2.0
RETRY_TIMEOUT_SECONDS = 60.0
FALLBACK_MODEL_DISPLAY = "gemini-2.0-flash"
LABEL_429_BACKOFF_INITIAL_SECONDS = 0.5
LABEL_429_BACKOFF_MULTIPLIER = 2.0


def _build_retry_error_handler(retry_stats: dict[str, Any]) -> Callable[[Exception], None]:
    def on_retry_error(exception: Exception) -> None:
        retry_stats["total_retries"] += 1
        if "429" in str(exception) or "ResourceExhausted" in str(type(exception).__name__):
            retry_stats["last_429_time"] = time.time()
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
    print(
        f"Vertex AI: Sending request (jitter={jitter_s:.3f}s, concurrent slots={semaphore._value}/{MAX_CONCURRENT_SLOTS})..."
    )
    print(f"[API Debug] Model name: {primary_model_name}")
    print(f"[API Debug] Has response_schema: {'response_schema' in generation_config}")
    print(f"[API Debug] Generation config keys: {list(generation_config.keys())}")

    with semaphore:
        try:
            response = _invoke_generation_with_retry(
                retry_policy,
                primary_model,
                contents,
                generation_config,
                safety_settings,
            )
            print("[API Debug] ✓ Primary model response received")
            return response
        except Exception as primary_error:
            print(f"[Model Fallback] Primary model ({primary_model_name}) failed: {primary_error}")
            print(f"[Model Fallback] Error type: {type(primary_error).__name__}")
            print(f"[Model Fallback] Switching to backup model: {FALLBACK_MODEL_DISPLAY}")

            backup_model = GenerativeModel(fallback_model_name)
            return _invoke_generation_with_retry(
                retry_policy,
                backup_model,
                contents,
                generation_config,
                safety_settings,
            )
