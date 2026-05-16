import os
import unittest
from unittest.mock import patch

from starlette.requests import Request

from backend.modules.ops import api_edge_guard
from backend.modules.ops.api_edge_guard import (
    InMemoryEndpointAdmissionLimiter,
    InMemorySlidingWindowRateLimiter,
    PostgresSlidingWindowRateLimiter,
    RateLimitStorageError,
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
        self.assertEqual(settings.backend, "memory")
        self.assertEqual(settings.table_name, "auth_rate_limit_events")
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
                "AUTH_RATE_LIMIT_BACKEND": "postgres",
                "AUTH_RATE_LIMIT_TABLE": "auth_rate_limit_events_custom",
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
        self.assertEqual(settings.backend, "postgres")
        self.assertEqual(settings.table_name, "auth_rate_limit_events_custom")
        self.assertEqual(settings.window_seconds, 30)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/login"], 2)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/signup"], 1)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/verification/request"], 4)
        self.assertEqual(settings.endpoint_limits_per_minute["/auth/email/password/reset/request"], 6)

    def test_auth_rate_limit_settings_auto_selects_postgres_when_database_url_exists(self):
        with patch.dict(
            os.environ,
            {
                "DATABASE_URL": "postgresql://foodlens:test@db/foodlens",
                "AUTH_RATE_LIMIT_BACKEND": "auto",
            },
            clear=True,
        ):
            settings = build_auth_rate_limit_settings_from_env()
        self.assertEqual(settings.backend, "postgres")

    def test_auth_rate_limit_settings_rejects_invalid_backend_and_table(self):
        with patch.dict(os.environ, {"AUTH_RATE_LIMIT_BACKEND": "redis"}, clear=True):
            with self.assertRaises(RateLimitStorageError):
                build_auth_rate_limit_settings_from_env()

        with patch.dict(os.environ, {"AUTH_RATE_LIMIT_TABLE": "bad-table-name"}, clear=True):
            with self.assertRaises(RateLimitStorageError):
                build_auth_rate_limit_settings_from_env()

        with patch.dict(os.environ, {"AUTH_RATE_LIMIT_TABLE": "a" * 41}, clear=True):
            with self.assertRaises(RateLimitStorageError):
                build_auth_rate_limit_settings_from_env()

    def test_auth_rate_limit_settings_disabled_ignores_storage_config(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_RATE_LIMIT_ENABLED": "0",
                "AUTH_RATE_LIMIT_BACKEND": "redis",
                "AUTH_RATE_LIMIT_TABLE": "bad-table-name",
            },
            clear=True,
        ):
            settings = build_auth_rate_limit_settings_from_env()
        self.assertFalse(settings.enabled)
        self.assertEqual(settings.backend, "memory")
        self.assertEqual(settings.table_name, "auth_rate_limit_events")

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

    def test_postgres_sliding_window_limiter_shares_state_across_instances(self):
        fake_postgres = _FakePostgres()
        with patch.object(api_edge_guard, "_load_connect", return_value=fake_postgres.connect), patch.object(
            api_edge_guard,
            "_load_database_error",
            return_value=Exception,
        ):
            first_limiter = PostgresSlidingWindowRateLimiter(
                database_url="postgresql://foodlens:test@db/foodlens",
                endpoint_limits_per_minute={"/auth/email/login": 1},
                table_name="auth_rate_limit_events",
                window_seconds=60,
            )
            second_limiter = PostgresSlidingWindowRateLimiter(
                database_url="postgresql://foodlens:test@db/foodlens",
                endpoint_limits_per_minute={"/auth/email/login": 1},
                table_name="auth_rate_limit_events",
                window_seconds=60,
            )

            first = first_limiter.evaluate(
                endpoint="/auth/email/login",
                subject="email:a@example.com",
                now=100.0,
            )
            second = second_limiter.evaluate(
                endpoint="/auth/email/login",
                subject="email:a@example.com",
                now=101.0,
            )

        self.assertTrue(first.allowed)
        self.assertFalse(second.allowed)
        self.assertEqual(second.retry_after_seconds, 59)
        lock_index = next(
            index
            for index, statement in enumerate(fake_postgres.statements)
            if statement.startswith("SELECT pg_advisory_xact_lock")
        )
        count_index = next(
            index
            for index, statement in enumerate(fake_postgres.statements)
            if statement.startswith("SELECT COUNT")
        )
        self.assertLess(lock_index, count_index)

    def test_postgres_sliding_window_limiter_uses_database_clock_by_default(self):
        fake_postgres = _FakePostgres(current_ts=250.0)
        with patch.object(api_edge_guard, "_load_connect", return_value=fake_postgres.connect), patch.object(
            api_edge_guard,
            "_load_database_error",
            return_value=Exception,
        ):
            limiter = PostgresSlidingWindowRateLimiter(
                database_url="postgresql://foodlens:test@db/foodlens",
                endpoint_limits_per_minute={"/auth/email/login": 1},
                table_name="auth_rate_limit_events",
                window_seconds=60,
            )

            decision = limiter.evaluate(
                endpoint="/auth/email/login",
                subject="email:a@example.com",
            )

        self.assertTrue(decision.allowed)
        self.assertEqual(fake_postgres.events[0][2], 250.0)
        self.assertTrue(
            any(
                statement.startswith("SELECT EXTRACT(EPOCH FROM clock_timestamp())")
                for statement in fake_postgres.statements
            )
        )

    def test_postgres_sliding_window_limiter_isolates_subjects_and_expires_window(self):
        fake_postgres = _FakePostgres()
        with patch.object(api_edge_guard, "_load_connect", return_value=fake_postgres.connect), patch.object(
            api_edge_guard,
            "_load_database_error",
            return_value=Exception,
        ):
            first_limiter = PostgresSlidingWindowRateLimiter(
                database_url="postgresql://foodlens:test@db/foodlens",
                endpoint_limits_per_minute={"/auth/email/login": 1},
                table_name="auth_rate_limit_events",
                window_seconds=60,
            )
            second_limiter = PostgresSlidingWindowRateLimiter(
                database_url="postgresql://foodlens:test@db/foodlens",
                endpoint_limits_per_minute={"/auth/email/login": 1},
                table_name="auth_rate_limit_events",
                window_seconds=60,
            )

            self.assertTrue(
                first_limiter.evaluate(
                    endpoint="/auth/email/login",
                    subject="email:a@example.com",
                    now=100.0,
                ).allowed
            )
            self.assertTrue(
                second_limiter.evaluate(
                    endpoint="/auth/email/login",
                    subject="email:b@example.com",
                    now=101.0,
                ).allowed
            )
            self.assertTrue(
                second_limiter.evaluate(
                    endpoint="/auth/email/login",
                    subject="email:a@example.com",
                    now=161.0,
                ).allowed
            )

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


class _FakePostgres:
    def __init__(self, *, current_ts: float = 100.0) -> None:
        self.current_ts = current_ts
        self.events: list[tuple[str, str, float]] = []
        self.statements: list[str] = []

    def connect(self, _database_url: str, autocommit: bool = False) -> "_FakePostgresConnection":
        return _FakePostgresConnection(store=self)


class _FakePostgresConnection:
    def __init__(self, *, store: _FakePostgres) -> None:
        self.store = store

    def __enter__(self) -> "_FakePostgresConnection":
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback) -> bool:
        return False

    def cursor(self) -> "_FakePostgresCursor":
        return _FakePostgresCursor(store=self.store)


class _FakePostgresCursor:
    def __init__(self, *, store: _FakePostgres) -> None:
        self.store = store
        self._next_row: tuple[object, ...] | None = None

    def __enter__(self) -> "_FakePostgresCursor":
        return self

    def __exit__(self, _exc_type, _exc_value, _traceback) -> bool:
        return False

    def execute(self, statement: str, params: tuple[object, ...] | None = None) -> None:
        normalized_statement = " ".join(statement.split())
        self.store.statements.append(normalized_statement)
        upper_statement = normalized_statement.upper()
        if upper_statement.startswith("SELECT EXTRACT(EPOCH FROM CLOCK_TIMESTAMP())"):
            self._next_row = (self.store.current_ts,)
            return
        if upper_statement.startswith("DELETE"):
            cutoff = float((params or (0.0,))[0])
            self.store.events = [
                event for event in self.store.events if event[2] > cutoff
            ]
            return
        if upper_statement.startswith("SELECT COUNT"):
            endpoint = str((params or ("", ""))[0])
            subject = str((params or ("", ""))[1])
            matching_events = [
                event_ts
                for event_endpoint, event_subject, event_ts in self.store.events
                if event_endpoint == endpoint and event_subject == subject
            ]
            self._next_row = (
                len(matching_events),
                min(matching_events) if matching_events else None,
            )
            return
        if upper_statement.startswith("INSERT"):
            endpoint = str((params or ("", "", 0.0))[0])
            subject = str((params or ("", "", 0.0))[1])
            event_ts = float((params or ("", "", 0.0))[2])
            self.store.events.append((endpoint, subject, event_ts))
            return

    def fetchone(self) -> tuple[object, ...] | None:
        return self._next_row


if __name__ == "__main__":
    unittest.main()
