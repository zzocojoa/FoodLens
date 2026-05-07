import threading
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from google.api_core.exceptions import ServiceUnavailable

from backend.modules.analyst_runtime.generation import generate_with_retry_and_fallback


class AnalysisRetryPolicyTests(unittest.TestCase):
    def test_generate_with_retry_and_fallback_caps_primary_retries_at_three(self):
        primary_model = Mock()
        primary_model.generate_content.side_effect = [
            ServiceUnavailable("temporarily unavailable"),
            ServiceUnavailable("temporarily unavailable"),
            ServiceUnavailable("temporarily unavailable"),
        ]
        backup_model = Mock()
        backup_model.generate_content.return_value = {"ok": True}
        retry_stats = {
            "total_retries": 0,
            "last_429_time": None,
            "consecutive_429": 0,
            "last_used_model": None,
        }

        with (
            patch("backend.modules.analyst_runtime.generation.GenerativeModel", return_value=backup_model),
            patch("backend.modules.analyst_runtime.generation.random.uniform", return_value=0.0),
            patch("backend.modules.analyst_runtime.generation.time.sleep", return_value=None),
        ):
            result = generate_with_retry_and_fallback(
                primary_model=primary_model,
                primary_model_name="gemini-2.0-flash",
                fallback_model_name="gemini-2.0-flash",
                contents=["prompt"],
                generation_config={},
                safety_settings={},
                semaphore=threading.Semaphore(1),
                retry_stats=retry_stats,
            )

        self.assertEqual(result, {"ok": True})
        self.assertEqual(primary_model.generate_content.call_count, 3)
        self.assertEqual(backup_model.generate_content.call_count, 1)

    def test_generate_with_retry_and_fallback_marks_provider_call_count(self):
        primary_model = Mock()
        primary_model.generate_content.side_effect = [
            ServiceUnavailable("temporarily unavailable"),
            ServiceUnavailable("temporarily unavailable"),
        ]
        backup_model = Mock()
        backup_model.generate_content.return_value = SimpleNamespace(ok=True)
        retry_stats = {
            "total_retries": 0,
            "last_429_time": None,
            "consecutive_429": 0,
            "last_used_model": None,
        }

        with (
            patch("backend.modules.analyst_runtime.generation.GenerativeModel", return_value=backup_model),
            patch("backend.modules.analyst_runtime.generation.random.uniform", return_value=0.0),
            patch("backend.modules.analyst_runtime.generation.time.sleep", return_value=None),
        ):
            result = generate_with_retry_and_fallback(
                primary_model=primary_model,
                primary_model_name="gemini-2.0-flash",
                fallback_model_name="gemini-2.0-flash",
                contents=["prompt"],
                generation_config={},
                safety_settings={},
                semaphore=threading.Semaphore(1),
                retry_stats=retry_stats,
                max_attempts=2,
            )

        self.assertEqual(getattr(result, "_foodlens_provider_call_count"), 3)
        self.assertEqual(getattr(result, "_foodlens_used_model"), "gemini-2.0-flash")

    def test_generate_with_retry_and_fallback_uses_fallback_when_one_call_remains(self):
        primary_model = Mock()
        primary_model.generate_content.side_effect = ServiceUnavailable("temporarily unavailable")
        backup_model = Mock()
        backup_model.generate_content.return_value = SimpleNamespace(ok=True)
        retry_stats = {
            "total_retries": 0,
            "last_429_time": None,
            "consecutive_429": 0,
            "last_used_model": None,
        }

        with (
            patch("backend.modules.analyst_runtime.generation.GenerativeModel", return_value=backup_model),
            patch("backend.modules.analyst_runtime.generation.random.uniform", return_value=0.0),
            patch("backend.modules.analyst_runtime.generation.time.sleep", return_value=None),
        ):
            result = generate_with_retry_and_fallback(
                primary_model=primary_model,
                primary_model_name="gemini-2.0-flash",
                fallback_model_name="gemini-2.0-flash",
                contents=["prompt"],
                generation_config={},
                safety_settings={},
                semaphore=threading.Semaphore(1),
                retry_stats=retry_stats,
                max_attempts=1,
                fallback_enabled=True,
            )

        self.assertEqual(primary_model.generate_content.call_count, 1)
        self.assertEqual(backup_model.generate_content.call_count, 1)
        self.assertEqual(getattr(result, "_foodlens_provider_call_count"), 2)


if __name__ == "__main__":
    unittest.main()
