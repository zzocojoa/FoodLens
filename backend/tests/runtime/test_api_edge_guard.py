import os
import unittest
from unittest.mock import patch

from starlette.requests import Request

from backend.modules.ops.api_edge_guard import (
    InMemoryEndpointAdmissionLimiter,
    InMemorySlidingWindowRateLimiter,
    build_auth_rate_limit_settings_from_env,
    build_cors_config_from_env,
    build_inflight_admission_settings_from_env,
    build_rate_limit_settings_from_env,
    build_rate_limit_subject,
    extract_client_ip,
)


class ApiEdgeGuardTests(unittest.TestCase):
    def test_build_cors_config_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            config = build_cors_config_from_env()
        self.assertEqual(config.allow_origins, [])
        self.assertIsNone(config.allow_origin_regex)

    def test_build_cors_config_defaults_to_public_base_urls(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_PUBLIC_BASE_URL": "https://api.foodlens.example.com/",
                "MEDIA_PUBLIC_BASE_URL": "https://media.foodlens.example.com/",
            },
            clear=True,
        ):
            config = build_cors_config_from_env()
        self.assertEqual(
            config.allow_origins,
            [
                "https://api.foodlens.example.com",
                "https://media.foodlens.example.com",
            ],
        )
        self.assertIsNone(config.allow_origin_regex)

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

    def test_auth_rate_limit_settings_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = build_auth_rate_limit_settings_from_env()
        self.assertTrue(settings.enabled)
        self.assertEqual(settings.window_seconds, 60)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/login"], 5)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/signup"], 3)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/verification/request"], 3)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/password/reset/request"], 3)

    def test_auth_rate_limit_settings_from_env(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_RATE_LIMIT_ENABLED": "1",
                "AUTH_RATE_LIMIT_WINDOW_SECONDS": "30",
                "AUTH_RATE_LIMIT_LOGIN_PER_MIN": "2",
                "AUTH_RATE_LIMIT_SIGNUP_PER_MIN": "1",
                "AUTH_RATE_LIMIT_VERIFICATION_REQUEST_PER_MIN": "4",
                "AUTH_RATE_LIMIT_PASSWORD_RESET_REQUEST_PER_MIN": "6",
            },
            clear=True,
        ):
            settings = build_auth_rate_limit_settings_from_env()
        self.assertTrue(settings.enabled)
        self.assertEqual(settings.window_seconds, 30)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/login"], 2)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/signup"], 1)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/verification/request"], 4)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/password/reset/request"], 6)

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

    def test_inflight_admission_settings_defaults(self):
        with patch.dict(os.environ, {}, clear=True):
            settings = build_inflight_admission_settings_from_env()
        self.assertTrue(settings.enabled)
        self.assertEqual(settings.retry_after_seconds, 2)
        self.assertEqual(settings.endpoint_max_inflight["/analyze"], 3)
        self.assertEqual(settings.endpoint_max_inflight["/analyze/label"], 3)
        self.assertEqual(settings.endpoint_max_inflight["/lookup/barcode"], 6)

    def test_admission_limiter_blocks_after_capacity(self):
        limiter = InMemoryEndpointAdmissionLimiter(endpoint_max_inflight={"/analyze/label": 1})
        self.assertTrue(limiter.try_acquire(endpoint="/analyze/label"))
        self.assertFalse(limiter.try_acquire(endpoint="/analyze/label"))
        limiter.release(endpoint="/analyze/label")
        self.assertTrue(limiter.try_acquire(endpoint="/analyze/label"))

    def test_extract_client_ip_prefers_global_x_forwarded_for(self):
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(b"x-forwarded-for", b"10.0.0.2, 8.8.8.8")],
            "client": ("10.1.1.1", 12345),
        }
        request = Request(scope)
        self.assertEqual(extract_client_ip(request), "8.8.8.8")

    def test_extract_client_ip_uses_forwarded_header(self):
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(b"forwarded", b"for=1.1.1.1;proto=https")],
            "client": ("10.1.1.1", 12345),
        }
        request = Request(scope)
        self.assertEqual(extract_client_ip(request), "1.1.1.1")


if __name__ == "__main__":
    unittest.main()
