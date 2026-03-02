import os
import unittest
from unittest.mock import patch

from backend.modules.ops.api_edge_guard import (
    InMemorySlidingWindowRateLimiter,
    build_cors_config_from_env,
    build_rate_limit_settings_from_env,
    build_rate_limit_subject,
)


class ApiEdgeGuardTests(unittest.TestCase):
    def test_build_cors_config_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            config = build_cors_config_from_env()
        self.assertTrue(config.allow_origins)
        self.assertIsNotNone(config.allow_origin_regex)

    def test_build_cors_config_from_env(self):
        with patch.dict(
            os.environ,
            {
                "ANALYSIS_CORS_ALLOWED_ORIGINS": "https://a.example.com, https://b.example.com",
                "ANALYSIS_CORS_ALLOW_ORIGIN_REGEX": r"^https://preview\.example\.com$",
            },
            clear=True,
        ):
            config = build_cors_config_from_env()
        self.assertEqual(config.allow_origins, ["https://a.example.com", "https://b.example.com"])
        self.assertEqual(config.allow_origin_regex, r"^https://preview\.example\.com$")

    def test_rate_limit_settings_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = build_rate_limit_settings_from_env()
        self.assertTrue(settings.enabled)
        self.assertEqual(settings.endpoint_limits_per_minute["/analyze"], 15)
        self.assertEqual(settings.endpoint_limits_per_minute["/analyze/label"], 15)
        self.assertEqual(settings.endpoint_limits_per_minute["/lookup/barcode"], 30)

    def test_rate_limit_subject_priority(self):
        self.assertEqual(
            build_rate_limit_subject(user_id="usr_1", device_id="dev_1", client_ip="1.2.3.4"),
            "user:usr_1",
        )
        self.assertEqual(
            build_rate_limit_subject(user_id=None, device_id="dev_1", client_ip="1.2.3.4"),
            "device:dev_1",
        )
        self.assertEqual(
            build_rate_limit_subject(user_id=None, device_id=None, client_ip="1.2.3.4"),
            "ip:1.2.3.4",
        )

    def test_sliding_window_limiter_blocks_when_limit_exceeded(self):
        limiter = InMemorySlidingWindowRateLimiter(
            endpoint_limits_per_minute={"/analyze": 2},
            window_seconds=60,
        )
        first = limiter.evaluate(endpoint="/analyze", subject="ip:1.2.3.4", now=100.0)
        second = limiter.evaluate(endpoint="/analyze", subject="ip:1.2.3.4", now=101.0)
        third = limiter.evaluate(endpoint="/analyze", subject="ip:1.2.3.4", now=102.0)

        self.assertTrue(first.allowed)
        self.assertTrue(second.allowed)
        self.assertFalse(third.allowed)
        self.assertGreaterEqual(third.retry_after_seconds, 1)


if __name__ == "__main__":
    unittest.main()
