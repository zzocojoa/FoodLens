import random
import time

from google.api_core import retry
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable
from vertexai.generative_models import GenerativeModel


def generate_with_semaphore(model, contents, generation_config, safety_settings, semaphore):
    with semaphore:
        return model.generate_content(
            contents,
            generation_config=generation_config,
            safety_settings=safety_settings,
        )


def build_retry_policy(retry_stats: dict):
    def on_retry_error(exception):
        retry_stats["total_retries"] += 1
        if "429" in str(exception) or "ResourceExhausted" in str(type(exception).__name__):
            retry_stats["last_429_time"] = time.time()
        print(f"[Internal Log] Retry triggered: {type(exception).__name__}")

    return retry.Retry(
        predicate=retry.if_exception_type(ResourceExhausted, ServiceUnavailable),
        initial=2.0,
        maximum=30.0,
        multiplier=2.0,
        timeout=60.0,
        on_error=on_retry_error,
    )


def generate_with_retry_and_fallback(
    primary_model,
    primary_model_name: str,
    fallback_model_name: str,
    contents,
    generation_config,
    safety_settings,
    semaphore,
    retry_stats: dict,
):
    jitter_s = random.uniform(0, 500) / 1000
    time.sleep(jitter_s)

    retry_policy = build_retry_policy(retry_stats)
    print(
        f"Vertex AI: Sending request (jitter={jitter_s:.3f}s, concurrent slots={semaphore._value}/3)..."
    )
    print(f"[API Debug] Model name: {primary_model_name}")
    print(f"[API Debug] Has response_schema: {'response_schema' in generation_config}")
    print(f"[API Debug] Generation config keys: {list(generation_config.keys())}")

    with semaphore:
        try:
            response = retry_policy(primary_model.generate_content)(
                contents,
                generation_config=generation_config,
                safety_settings=safety_settings,
            )
            print("[API Debug] ✓ Primary model response received")
            return response
        except Exception as primary_error:
            print(f"[Model Fallback] Primary model ({primary_model_name}) failed: {primary_error}")
            print(f"[Model Fallback] Error type: {type(primary_error).__name__}")
            print("[Model Fallback] Switching to backup model: gemini-2.0-flash")

            backup_model = GenerativeModel(fallback_model_name)
            return retry_policy(backup_model.generate_content)(
                contents,
                generation_config=generation_config,
                safety_settings=safety_settings,
            )

