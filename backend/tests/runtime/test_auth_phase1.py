import contextlib
import logging
import os
import sys
import threading
import types
import unittest
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from starlette.requests import Request


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["AUTH_EMAIL_VERIFICATION_REQUIRED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DELIVERY_MODE"] = "log"
os.environ["AUTH_PASSWORD_RESET_DEBUG_CODE_ENABLED"] = "1"
sys.modules.setdefault(
    "sentry_sdk",
    types.SimpleNamespace(
        init=lambda **_kwargs: None,
        push_scope=lambda: contextlib.nullcontext(
            types.SimpleNamespace(
                set_tag=lambda *_args, **_kwargs: None,
                set_extra=lambda *_args, **_kwargs: None,
                set_user=lambda *_args, **_kwargs: None,
            )
        ),
        capture_exception=lambda *_args, **_kwargs: None,
    ),
)
from backend import server as server_module  # noqa: E402
from backend.server import app  # noqa: E402
from backend.modules.auth import AuthServiceError, InMemoryAuthSessionService  # noqa: E402
from backend.modules.ops.api_edge_guard import (  # noqa: E402
    InMemorySlidingWindowRateLimiter,
    RateLimitStorageError,
)


class _FailingAuthRateLimiter:
    def evaluate_many(
        self,
        *,
        endpoint: str,
        subjects: tuple[tuple[str, str], ...],
        now: float | None,
    ) -> None:
        raise RateLimitStorageError("postgres auth rate limit unavailable")


def _oauth_store_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)


class _AtomicOAuthPendingStateStore:
    def __init__(self) -> None:
        self.records: dict[str, dict[str, object]] = {}
        self.snapshot_saves: list[dict[str, object]] = []
        self.create_calls = 0
        self.get_calls = 0
        self.consume_calls = 0

    def load(self) -> dict[str, object] | None:
        return None

    def save(self, payload: dict[str, object]) -> None:
        self.snapshot_saves.append(payload)

    def create_oauth_pending_state(
        self,
        *,
        state: str,
        provider: str,
        app_redirect_uri: str,
        request_id: str,
        created_at: datetime,
        expires_at: datetime,
        nonce: str | None,
        code_verifier: str | None,
        code_challenge: str | None,
    ) -> bool:
        self.create_calls += 1
        if state in self.records:
            return False
        self.records[state] = {
            "state": state,
            "provider": provider,
            "app_redirect_uri": app_redirect_uri,
            "request_id": request_id,
            "nonce": nonce,
            "code_verifier": code_verifier,
            "code_challenge": code_challenge,
            "created_at": created_at,
            "expires_at": expires_at,
            "consumed_at": None,
        }
        return True

    def get_oauth_pending_state(
        self,
        *,
        state: str,
    ) -> dict[str, object] | None:
        self.get_calls += 1
        record = self.records.get(state)
        if record is None:
            return None
        return dict(record)

    def consume_oauth_pending_state(
        self,
        *,
        state: str,
        provider: str,
        app_redirect_uri: str | None,
        now: datetime,
    ) -> dict[str, object] | None:
        self.consume_calls += 1
        record = self.records.get(state)
        if record is None or not self._can_consume_record(
            record=record,
            state=state,
            provider=provider,
            app_redirect_uri=app_redirect_uri,
            now=now,
        ):
            return None
        record["consumed_at"] = now
        return dict(record)

    def _can_consume_record(
        self,
        *,
        record: dict[str, object],
        state: str,
        provider: str,
        app_redirect_uri: str | None,
        now: datetime,
    ) -> bool:
        if str(record.get("state")) != state:
            return False
        if record.get("consumed_at") is not None:
            return False
        expires_at = _oauth_store_datetime(record["expires_at"])
        if expires_at <= now:
            return False
        if str(record["provider"]) != provider:
            return False
        if app_redirect_uri and app_redirect_uri != str(record["app_redirect_uri"]):
            return False
        return True


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


class AuthPhase1RuntimeTests(unittest.TestCase):
    AUTH_PUBLIC_BASE_URL = "https://api.example.com"

    def _signup_email(self, client: TestClient, **payload):
        response = client.post("/auth/email/signup", json=payload)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("request_id", body)
        self.assertTrue(body.get("verification_required"))
        self.assertIn("verification_debug_code", body)
        return body

    def _verify_email(
        self,
        client: TestClient,
        *,
        email: str,
        code: str,
        device_id: str | None = None,
    ):
        response = client.post(
            "/auth/email/verify",
            json={
                "email": email,
                "code": code,
                "device_id": device_id,
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("request_id", body)
        self.assertIn("access_token", body)
        self.assertIn("refresh_token", body)
        return body

    def _signup_and_verify(self, client: TestClient, *, email: str, password: str, display_name: str, locale: str = "ko-KR", device_id: str | None = None):
        signup_body = self._signup_email(
            client,
            email=email,
            password=password,
            display_name=display_name,
            locale=locale,
            device_id=device_id,
        )
        session_body = self._verify_email(
            client,
            email=email,
            code=signup_body["verification_debug_code"],
            device_id=device_id,
        )
        return signup_body, session_body

    def _assert_auth_rate_limited_response(
        self,
        response,
        *,
        request_id: str,
        retry_scope: str,
    ) -> None:
        self.assertEqual(response.status_code, 429)
        body = response.json()["detail"]
        self.assertEqual(response.headers.get("Retry-After"), str(body["retry_after_seconds"]))
        self.assertEqual(body["code"], "AUTH_RATE_LIMITED")
        self.assertEqual(body["request_id"], request_id)
        self.assertEqual(body["retry_scope"], retry_scope)
        self.assertTrue(body["retryable_by_client"])

    def _oauth_test_state(self, label: str) -> str:
        return f"test-oauth-state-{label}-000000000000000000000000"

    def _oauth_state_failure_record(
        self,
        records: list[logging.LogRecord],
        *,
        failure_code: str,
    ) -> logging.LogRecord:
        matches = [
            record
            for record in records
            if getattr(record, "failure_code", None) == failure_code
        ]
        self.assertEqual(len(matches), 1)
        return matches[0]

    def _assert_oauth_state_failure_record(
        self,
        record: logging.LogRecord,
        *,
        request_id: str,
        provider: str,
        failure_code: str,
        state_age_bucket: str,
        forbidden_values: tuple[str, ...],
    ) -> None:
        self.assertEqual(record.getMessage(), "[OAuthState] validation failed")
        self.assertEqual(getattr(record, "request_id"), request_id)
        self.assertEqual(getattr(record, "provider"), provider)
        self.assertEqual(getattr(record, "failure_code"), failure_code)
        self.assertEqual(getattr(record, "state_age_bucket"), state_age_bucket)
        for forbidden_key in ("state", "code_verifier", "nonce", "email", "token", "secret"):
            self.assertNotIn(forbidden_key, record.__dict__)
        serialized_record = repr(record.__dict__)
        for forbidden_value in forbidden_values:
            self.assertNotIn(forbidden_value, serialized_record)

    def _seed_oauth_pending_state(
        self,
        *,
        provider: str,
        redirect_uri: str,
        state: str,
        code_verifier: str | None = None,
    ) -> str:
        app.state.auth_service.create_oauth_pending_state(
            provider=provider,
            app_redirect_uri=redirect_uri,
            state=state,
            request_id=f"req-{provider}-pending-state",
            nonce=self._oauth_test_state(f"{provider}-nonce"),
            code_verifier=code_verifier,
            code_challenge=server_module._pkce_code_challenge(code_verifier=code_verifier) if code_verifier else None,
            ttl_seconds=600,
        )
        return state

    def _start_oauth_state(
        self,
        client: TestClient,
        *,
        provider: str,
        redirect_uri: str,
        state: str | None = None,
    ) -> tuple[str, dict[str, list[str]]]:
        params = {"redirect_uri": redirect_uri}
        if state is not None:
            params["state"] = state
        response = client.get(f"/auth/{provider}/start", params=params, follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        query = parse_qs(urlparse(response.headers["location"]).query)
        return query["state"][0], query
        self.assertGreaterEqual(body["retry_after_seconds"], 1)

    def test_email_signup_refresh_and_profile_roundtrip(self):
        with TestClient(app) as client:
            signup_body, session_body = self._signup_and_verify(
                client,
                email="alpha@example.com",
                password="Passw0rd!",
                display_name="Alpha",
                locale="en-US",
                device_id="ios-alpha",
            )

            self.assertEqual(signup_body["user"]["email"], "alpha@example.com")
            user_id = session_body["user"]["id"]

            profile_response = client.get("/me/profile", headers=_auth_headers(session_body["access_token"]))
            self.assertEqual(profile_response.status_code, 200)
            self.assertEqual(profile_response.json()["profile"]["user_id"], user_id)
            self.assertEqual(profile_response.json()["profile"]["display_name"], "Alpha")

            settings_response = client.get("/me/settings", headers=_auth_headers(session_body["access_token"]))
            self.assertEqual(settings_response.status_code, 200)
            self.assertEqual(settings_response.json()["settings"]["language"], "auto")

            update_response = client.put(
                "/me/profile",
                json={
                    "display_name": "Alpha Prime",
                    "profile_image_url": "https://cdn.example.com/profile/alpha.png",
                    "gender": "male",
                    "birth_year": 1990,
                    "disliked_ingredients": ["coriander"],
                    "timezone": "Asia/Seoul",
                },
                headers=_auth_headers(session_body["access_token"]),
            )
            self.assertEqual(update_response.status_code, 200)
            updated_profile = update_response.json()["profile"]
            self.assertEqual(updated_profile["display_name"], "Alpha Prime")
            self.assertEqual(
                updated_profile["profile_image_url"],
                "https://cdn.example.com/profile/alpha.png",
            )
            self.assertEqual(updated_profile["gender"], "male")
            self.assertEqual(updated_profile["birth_year"], 1990)
            self.assertEqual(updated_profile["disliked_ingredients"], ["coriander"])
            self.assertEqual(updated_profile["timezone"], "Asia/Seoul")

            refresh_response = client.post(
                "/auth/refresh",
                json={"refresh_token": session_body["refresh_token"]},
            )
            self.assertEqual(refresh_response.status_code, 200)
            refresh_body = refresh_response.json()
            self.assertNotEqual(refresh_body["refresh_token"], session_body["refresh_token"])

    def test_email_signup_resolves_locale_from_accept_language_when_omitted(self):
        with TestClient(app) as client:
            signup_response = client.post(
                "/auth/email/signup",
                json={
                    "email": "accept-language@example.com",
                    "password": "Passw0rd!",
                    "display_name": "Accept Language",
                },
                headers={"Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8"},
            )
            self.assertEqual(signup_response.status_code, 200)
            signup_body = signup_response.json()
            self.assertEqual(signup_body["user"]["locale"], "ja-JP")

            session_body = self._verify_email(
                client,
                email="accept-language@example.com",
                code=signup_body["verification_debug_code"],
            )
            profile_response = client.get("/me/profile", headers=_auth_headers(session_body["access_token"]))
            self.assertEqual(profile_response.status_code, 200)
            self.assertEqual(profile_response.json()["profile"]["locale"], "ja-JP")

    def test_email_signup_falls_back_to_en_us_without_locale_or_accept_language(self):
        with TestClient(app) as client:
            signup_response = client.post(
                "/auth/email/signup",
                json={
                    "email": "fallback-locale@example.com",
                    "password": "Passw0rd!",
                    "display_name": "Fallback Locale",
                },
            )
            self.assertEqual(signup_response.status_code, 200)
            self.assertEqual(signup_response.json()["user"]["locale"], "en-US")

    def test_oauth_new_user_resolves_locale_from_accept_language(self):
        with (
            patch.dict(os.environ, {"AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1"}, clear=False),
            patch("backend.server._verify_google_identity", return_value=("google-locale-user", None)),
            TestClient(app) as client,
        ):
            state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("locale-google"),
            )
            response = client.post(
                "/auth/google",
                json={
                    "code": "google-locale-code",
                    "state": state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                },
                headers={"Accept-Language": "th-TH,th;q=0.9,en-US;q=0.8"},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["user"]["locale"], "th-TH")

    def test_profile_locale_update_does_not_store_auto_literal(self):
        with TestClient(app) as client:
            signup_body, session_body = self._signup_and_verify(
                client,
                email="profile-auto-locale@example.com",
                password="Passw0rd!",
                display_name="Profile Locale",
                locale="en-US",
                device_id="ios-profile-locale",
            )
            self.assertEqual(signup_body["user"]["locale"], "en-US")
            update_response = client.put(
                "/me/profile",
                json={"locale": "auto"},
                headers=_auth_headers(session_body["access_token"]),
            )
            self.assertEqual(update_response.status_code, 200)
            self.assertEqual(update_response.json()["profile"]["locale"], "en-US")

    def test_email_login_rejected_before_verification(self):
        with TestClient(app) as client:
            self._signup_email(
                client,
                email="pending@example.com",
                password="Passw0rd!",
                display_name="Pending",
            )

            login_response = client.post(
                "/auth/email/login",
                json={"email": "pending@example.com", "password": "Passw0rd!"},
            )
            self.assertEqual(login_response.status_code, 403)
            self.assertEqual(login_response.json()["detail"]["code"], "AUTH_EMAIL_NOT_VERIFIED")

    def test_email_signup_reissues_verification_for_existing_unverified_account(self):
        with TestClient(app) as client:
            first_signup = self._signup_email(
                client,
                email="pending-retry@example.com",
                password="Passw0rd!",
                display_name="Pending Retry",
            )

            second_signup = self._signup_email(
                client,
                email="pending-retry@example.com",
                password="N3wPassw0rd!",
                display_name="Pending Retry Updated",
            )

            self.assertNotEqual(
                second_signup.get("verification_id"),
                first_signup.get("verification_id"),
            )
            self.assertNotEqual(
                second_signup.get("verification_debug_code"),
                first_signup.get("verification_debug_code"),
            )

            verified = self._verify_email(
                client,
                email="pending-retry@example.com",
                code=second_signup["verification_debug_code"],
            )
            self.assertIn("access_token", verified)

            login_with_updated_password = client.post(
                "/auth/email/login",
                json={"email": "pending-retry@example.com", "password": "N3wPassw0rd!"},
            )
            self.assertEqual(login_with_updated_password.status_code, 200)
            self.assertIn("access_token", login_with_updated_password.json())

    def test_auth_runtime_controls_select_postgres_rate_limiter_backend(self):
        app_state = getattr(app.state, "_state", None)
        if not isinstance(app_state, dict):
            raise TypeError("app.state._state must be a dictionary.")
        previous_state = dict(app_state)
        try:
            with patch.dict(
                os.environ,
                {
                    "DATABASE_URL": "postgresql://foodlens:test@db/foodlens",
                    "AUTH_RATE_LIMIT_ENABLED": "1",
                    "AUTH_RATE_LIMIT_BACKEND": "postgres",
                    "AUTH_RATE_LIMIT_TABLE": "auth_rate_limit_events",
                },
                clear=False,
            ), patch.object(server_module, "PostgresSlidingWindowRateLimiter") as limiter_class:
                server_module._initialize_api_runtime_controls()
            self.assertIs(app.state.auth_rate_limiter, limiter_class.return_value)
            auth_limiter_calls = [
                call
                for call in limiter_class.call_args_list
                if call.kwargs.get("table_name") == "auth_rate_limit_events"
            ]
            self.assertEqual(len(auth_limiter_calls), 1)
            call_kwargs = auth_limiter_calls[0].kwargs
            self.assertEqual(call_kwargs["database_url"], "postgresql://foodlens:test@db/foodlens")
            self.assertEqual(call_kwargs["table_name"], "auth_rate_limit_events")
            self.assertEqual(call_kwargs["endpoint_limits_per_minute"]["/auth/email/login"], 5)
        finally:
            app_state.clear()
            app_state.update(previous_state)

    def test_auth_rate_limit_openapi_responses_document_retry_after_header(self):
        rate_limit_responses = server_module._auth_rate_limited_openapi_responses(
            retry_scope="/auth/email/login",
        )
        lockout_responses = server_module._auth_429_openapi_responses(
            code="AUTH_EMAIL_VERIFICATION_LOCKED",
            message="Too many invalid verification attempts.",
            retry_scope="AUTH_EMAIL_VERIFICATION_LOCKED",
            retryable_by_client=False,
        )

        for response in (
            rate_limit_responses[429],
            rate_limit_responses[503],
            lockout_responses[429],
        ):
            retry_after_header = response["headers"]["Retry-After"]
            self.assertEqual(retry_after_header["schema"]["type"], "string")
            self.assertIn("retrying", retry_after_header["description"])

    def test_auth_rate_limit_subjects_do_not_store_raw_email_or_device(self):
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/email/login",
                "headers": [],
                "client": ("203.0.113.10", 12345),
            }
        )

        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://unit:secret@localhost/foodlens"}, clear=False):
            subjects, masked_email, client_scope = server_module._resolve_auth_rate_limit_subjects(
                request=request,
                email="Owner@Example.com",
                device_id="ios-device-123",
            )

        joined_subjects = " ".join(subject for _scope, subject in subjects)
        self.assertEqual(masked_email, "ow***@example.com")
        self.assertEqual(client_scope, "ip+device")
        self.assertNotIn("owner@example.com", joined_subjects)
        self.assertNotIn("ios-device-123", joined_subjects)
        for scope, subject in subjects:
            self.assertTrue(subject.startswith(f"{scope}:"))
            self.assertEqual(len(subject.split(":", 1)[1]), 64)

    def test_oauth_rate_limit_public_subjects_do_not_create_unknown_email_bucket(self):
        request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/google",
                "headers": [(b"x-device-id", b"ios-oauth-public-subject")],
                "client": ("203.0.113.20", 12345),
            }
        )

        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://unit:secret@localhost/foodlens"}, clear=False):
            subjects, client_scope = server_module._resolve_auth_rate_limit_public_subjects(
                request=request,
                device_id=None,
            )

        scopes = [scope for scope, _subject in subjects]
        joined_subjects = " ".join(subject for _scope, subject in subjects)
        self.assertEqual(scopes, ["ip", "device"])
        self.assertEqual(client_scope, "ip+device")
        self.assertNotIn("email:", joined_subjects)
        self.assertNotIn("unknown", joined_subjects)
        self.assertNotIn("ios-oauth-public-subject", joined_subjects)

    def test_auth_rate_limit_subject_hash_uses_runtime_secret(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_RATE_LIMIT_HASH_SECRET": "",
                "DATABASE_URL": "postgresql://unit:first-secret@localhost/foodlens",
            },
            clear=False,
        ):
            first_subject = server_module._auth_rate_limit_subject("email", "owner@example.com")

        with patch.dict(
            os.environ,
            {
                "AUTH_RATE_LIMIT_HASH_SECRET": "",
                "DATABASE_URL": "postgresql://unit:second-secret@localhost/foodlens",
            },
            clear=False,
        ):
            second_subject = server_module._auth_rate_limit_subject("email", "owner@example.com")

        with patch.dict(
            os.environ,
            {
                "AUTH_RATE_LIMIT_HASH_SECRET": "explicit-secret",
                "DATABASE_URL": "postgresql://unit:first-secret@localhost/foodlens",
            },
            clear=False,
        ):
            explicit_first_subject = server_module._auth_rate_limit_subject("email", "owner@example.com")

        with patch.dict(
            os.environ,
            {
                "AUTH_RATE_LIMIT_HASH_SECRET": "explicit-secret",
                "DATABASE_URL": "postgresql://unit:second-secret@localhost/foodlens",
            },
            clear=False,
        ):
            explicit_second_subject = server_module._auth_rate_limit_subject("email", "owner@example.com")

        self.assertNotEqual(first_subject, second_subject)
        self.assertEqual(explicit_first_subject, explicit_second_subject)
        self.assertTrue(first_subject.startswith("email:"))
        self.assertEqual(len(first_subject.split(":", 1)[1]), 64)

    def test_auth_rate_limit_ip_subject_normalizes_equivalent_ipv6_hosts(self):
        first_request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/email/login",
                "headers": [],
                "client": ("2001:0db8:0000:0000:0000:0000:0000:0001", 12345),
            }
        )
        second_request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/email/login",
                "headers": [],
                "client": ("2001:db8::1", 12345),
            }
        )

        first_subjects, _first_masked_email, _first_client_scope = server_module._resolve_auth_rate_limit_subjects(
            request=first_request,
            email="ipv6@example.com",
            device_id=None,
        )
        second_subjects, _second_masked_email, _second_client_scope = server_module._resolve_auth_rate_limit_subjects(
            request=second_request,
            email="ipv6@example.com",
            device_id=None,
        )

        first_ip_subject = dict(first_subjects)["ip"]
        second_ip_subject = dict(second_subjects)["ip"]
        self.assertEqual(first_ip_subject, second_ip_subject)
        self.assertNotIn("2001:0db8", first_ip_subject)
        self.assertNotIn("2001:db8::1", first_ip_subject)

    def test_auth_rate_limit_ip_subject_uses_forwarded_client_address(self):
        first_request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/email/login",
                "headers": [(b"x-forwarded-for", b"8.8.8.8")],
                "client": ("10.0.0.10", 12345),
            }
        )
        second_request = Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/auth/email/login",
                "headers": [(b"x-forwarded-for", b"1.1.1.1")],
                "client": ("10.0.0.10", 12345),
            }
        )

        first_subjects, _first_masked_email, _first_client_scope = server_module._resolve_auth_rate_limit_subjects(
            request=first_request,
            email="forwarded@example.com",
            device_id=None,
        )
        second_subjects, _second_masked_email, _second_client_scope = server_module._resolve_auth_rate_limit_subjects(
            request=second_request,
            email="forwarded@example.com",
            device_id=None,
        )

        self.assertNotEqual(dict(first_subjects)["ip"], dict(second_subjects)["ip"])

    def test_email_login_rate_limit_storage_outage_returns_retryable_503(self):
        with TestClient(app) as client:
            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = _FailingAuthRateLimiter()
            try:
                response = client.post(
                    "/auth/email/login",
                    json={
                        "email": "storage-outage@example.com",
                        "password": "Passw0rd!",
                    },
                    headers={"X-Request-Id": "req-auth-rate-storage-outage"},
                )
            finally:
                app.state.auth_rate_limiter = previous_limiter

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.headers.get("Retry-After"), "5")
        body = response.json()["detail"]
        self.assertEqual(body["code"], "AUTH_RATE_LIMIT_STORAGE_UNAVAILABLE")
        self.assertEqual(body["request_id"], "req-auth-rate-storage-outage")
        self.assertEqual(body["retry_after_seconds"], 5)
        self.assertEqual(body["retry_scope"], "/auth/email/login")
        self.assertTrue(body["retryable_by_client"])
        self.assertNotIn("postgres auth rate limit unavailable", str(body))

    def test_email_signup_rate_limit_blocks_repeated_same_email_and_device(self):
        with TestClient(app) as client:
            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = InMemorySlidingWindowRateLimiter(
                endpoint_limits_per_minute={"/auth/email/signup": 1},
                window_seconds=60,
            )
            try:
                first_signup = client.post(
                    "/auth/email/signup",
                    json={
                        "email": "Signup-Limit@Example.com",
                        "password": "Passw0rd!",
                        "display_name": "Signup Limit",
                        "device_id": "ios-signup-limit",
                    },
                    headers={"X-Request-Id": "req-auth-signup-limit-1"},
                )
                self.assertEqual(first_signup.status_code, 200)

                blocked_signup = client.post(
                    "/auth/email/signup",
                    json={
                        "email": "signup-limit@example.com",
                        "password": "Passw0rd!",
                        "display_name": "Signup Limit",
                        "device_id": "ios-signup-limit",
                    },
                    headers={"X-Request-Id": "req-auth-signup-limit-2"},
                )
                self.assertEqual(blocked_signup.status_code, 429)
                self.assertIsNotNone(blocked_signup.headers.get("Retry-After"))
                blocked_body = blocked_signup.json()["detail"]
                self.assertEqual(blocked_body["code"], "AUTH_RATE_LIMITED")
                self.assertEqual(blocked_body["request_id"], "req-auth-signup-limit-2")
                self.assertEqual(blocked_body["retry_scope"], "/auth/email/signup")
                self.assertTrue(blocked_body["retryable_by_client"])
                self.assertGreaterEqual(blocked_body["retry_after_seconds"], 1)
            finally:
                app.state.auth_rate_limiter = previous_limiter

    def test_email_login_rate_limit_blocks_same_email_across_device_rotation(self):
        with TestClient(app) as client:
            self._signup_and_verify(
                client,
                email="login-limit@example.com",
                password="Passw0rd!",
                display_name="Login Limit",
                device_id="ios-login-limit",
            )

            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = InMemorySlidingWindowRateLimiter(
                endpoint_limits_per_minute={"/auth/email/login": 2},
                window_seconds=60,
            )
            try:
                for index in range(2):
                    login_response = client.post(
                        "/auth/email/login",
                        json={
                            "email": "LOGIN-LIMIT@example.com",
                            "password": f"WrongPassw0rd!{index}",
                            "device_id": f"ios-login-limit-{index}",
                        },
                        headers={"X-Request-Id": f"req-auth-login-limit-{index}"},
                    )
                    self.assertEqual(login_response.status_code, 401)
                    self.assertEqual(login_response.json()["detail"]["code"], "AUTH_INVALID_CREDENTIALS")

                blocked_login = client.post(
                    "/auth/email/login",
                    json={
                        "email": "login-limit@example.com",
                        "password": "Passw0rd!",
                        "device_id": "ios-login-limit-rotated",
                    },
                    headers={"X-Request-Id": "req-auth-login-limit-blocked"},
                )
                self.assertEqual(blocked_login.status_code, 429)
                blocked_body = blocked_login.json()["detail"]
                self.assertEqual(blocked_login.headers.get("Retry-After"), str(blocked_body["retry_after_seconds"]))
                self.assertEqual(blocked_body["code"], "AUTH_RATE_LIMITED")
                self.assertEqual(blocked_body["request_id"], "req-auth-login-limit-blocked")
                self.assertEqual(blocked_body["retry_scope"], "/auth/email/login")
                self.assertTrue(blocked_body["retryable_by_client"])
                self.assertGreaterEqual(blocked_body["retry_after_seconds"], 1)
            finally:
                app.state.auth_rate_limiter = previous_limiter

    def test_email_login_rate_limit_blocks_same_forwarded_client_across_email_and_device_rotation(self):
        with TestClient(app) as client:
            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = InMemorySlidingWindowRateLimiter(
                endpoint_limits_per_minute={"/auth/email/login": 2},
                window_seconds=60,
            )
            try:
                for index in range(2):
                    login_response = client.post(
                        "/auth/email/login",
                        json={
                            "email": f"rotating-email-{index}@example.com",
                            "password": "WrongPassw0rd!",
                            "device_id": f"ios-rotating-device-{index}",
                        },
                        headers={
                            "X-Forwarded-For": "8.8.8.8",
                            "X-Request-Id": f"req-auth-ip-limit-{index}",
                        },
                    )
                    self.assertEqual(login_response.status_code, 401)
                    self.assertEqual(login_response.json()["detail"]["code"], "AUTH_INVALID_CREDENTIALS")

                blocked_login = client.post(
                    "/auth/email/login",
                    json={
                        "email": "rotating-email-2@example.com",
                        "password": "WrongPassw0rd!",
                        "device_id": "ios-rotating-device-2",
                    },
                    headers={
                        "X-Forwarded-For": "8.8.8.8",
                        "X-Request-Id": "req-auth-ip-limit-blocked",
                    },
                )
                self.assertEqual(blocked_login.status_code, 429)
                blocked_body = blocked_login.json()["detail"]
                self.assertEqual(blocked_login.headers.get("Retry-After"), str(blocked_body["retry_after_seconds"]))
                self.assertEqual(blocked_body["code"], "AUTH_RATE_LIMITED")
                self.assertEqual(blocked_body["request_id"], "req-auth-ip-limit-blocked")
                self.assertEqual(blocked_body["retry_scope"], "/auth/email/login")
                self.assertTrue(blocked_body["retryable_by_client"])
                self.assertGreaterEqual(blocked_body["retry_after_seconds"], 1)
            finally:
                app.state.auth_rate_limiter = previous_limiter

    def test_email_verification_and_password_reset_request_rate_limits(self):
        with TestClient(app) as client:
            self._signup_email(
                client,
                email="verification-request-limit@example.com",
                password="Passw0rd!",
                display_name="Verification Request Limit",
            )
            self._signup_and_verify(
                client,
                email="password-reset-request-limit@example.com",
                password="Passw0rd!",
                display_name="Password Reset Request Limit",
            )

            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = InMemorySlidingWindowRateLimiter(
                endpoint_limits_per_minute={
                    "/auth/email/verification/request": 1,
                    "/auth/email/password/reset/request": 1,
                },
                window_seconds=60,
            )
            try:
                verification_request = client.post(
                    "/auth/email/verification/request",
                    json={"email": "verification-request-limit@example.com"},
                    headers={
                        "X-Device-Id": "ios-verification-request-limit",
                        "X-Request-Id": "req-auth-verification-request-limit-1",
                    },
                )
                self.assertEqual(verification_request.status_code, 200)

                blocked_verification_request = client.post(
                    "/auth/email/verification/request",
                    json={"email": "VERIFICATION-REQUEST-LIMIT@example.com"},
                    headers={
                        "X-Device-Id": "ios-verification-request-limit",
                        "X-Request-Id": "req-auth-verification-request-limit-2",
                    },
                )
                self.assertEqual(blocked_verification_request.status_code, 429)
                self.assertIsNotNone(blocked_verification_request.headers.get("Retry-After"))
                blocked_verification_body = blocked_verification_request.json()["detail"]
                self.assertEqual(blocked_verification_body["code"], "AUTH_RATE_LIMITED")
                self.assertEqual(blocked_verification_body["request_id"], "req-auth-verification-request-limit-2")
                self.assertEqual(blocked_verification_body["retry_scope"], "/auth/email/verification/request")
                self.assertTrue(blocked_verification_body["retryable_by_client"])
                self.assertGreaterEqual(blocked_verification_body["retry_after_seconds"], 1)

                reset_request = client.post(
                    "/auth/email/password/reset/request",
                    json={"email": "password-reset-request-limit@example.com"},
                    headers={
                        "X-Device-Id": "ios-password-reset-request-limit",
                        "X-Request-Id": "req-auth-reset-request-limit-1",
                    },
                )
                self.assertEqual(reset_request.status_code, 200)

                blocked_reset_request = client.post(
                    "/auth/email/password/reset/request",
                    json={"email": "PASSWORD-RESET-REQUEST-LIMIT@example.com"},
                    headers={
                        "X-Device-Id": "ios-password-reset-request-limit",
                        "X-Request-Id": "req-auth-reset-request-limit-2",
                    },
                )
                self.assertEqual(blocked_reset_request.status_code, 429)
                self.assertIsNotNone(blocked_reset_request.headers.get("Retry-After"))
                blocked_reset_body = blocked_reset_request.json()["detail"]
                self.assertEqual(blocked_reset_body["code"], "AUTH_RATE_LIMITED")
                self.assertEqual(blocked_reset_body["request_id"], "req-auth-reset-request-limit-2")
                self.assertEqual(blocked_reset_body["retry_scope"], "/auth/email/password/reset/request")
                self.assertTrue(blocked_reset_body["retryable_by_client"])
                self.assertGreaterEqual(blocked_reset_body["retry_after_seconds"], 1)
            finally:
                app.state.auth_rate_limiter = previous_limiter

    def test_email_verification_rejects_invalid_code(self):
        with TestClient(app) as client:
            self._signup_email(
                client,
                email="invalid-code@example.com",
                password="Passw0rd!",
                display_name="Invalid Code",
            )

            verify_response = client.post(
                "/auth/email/verify",
                json={"email": "invalid-code@example.com", "code": "000000"},
            )
            self.assertEqual(verify_response.status_code, 400)
            self.assertEqual(verify_response.json()["detail"]["code"], "AUTH_EMAIL_VERIFICATION_INVALID")

    def test_email_verification_lockout_returns_retry_metadata(self):
        with TestClient(app) as client:
            self._signup_email(
                client,
                email="locked-code@example.com",
                password="Passw0rd!",
                display_name="Locked Code",
            )

            locked_response = None
            for _index in range(5):
                locked_response = client.post(
                    "/auth/email/verify",
                    json={"email": "locked-code@example.com", "code": "000000"},
                    headers={"X-Request-Id": "req-auth-verification-locked"},
                )

            self.assertIsNotNone(locked_response)
            self.assertEqual(locked_response.status_code, 429)
            locked_body = locked_response.json()["detail"]
            self.assertEqual(locked_response.headers.get("Retry-After"), str(locked_body["retry_after_seconds"]))
            self.assertEqual(locked_body["code"], "AUTH_EMAIL_VERIFICATION_LOCKED")
            self.assertEqual(locked_body["request_id"], "req-auth-verification-locked")
            self.assertEqual(locked_body["retry_scope"], "AUTH_EMAIL_VERIFICATION_LOCKED")
            self.assertFalse(locked_body["retryable_by_client"])
            self.assertGreaterEqual(locked_body["retry_after_seconds"], 1)

    def test_password_reset_request_and_confirm_rotates_password(self):
        with TestClient(app) as client:
            self._signup_and_verify(
                client,
                email="reset@example.com",
                password="Passw0rd!",
                display_name="Reset User",
            )

            reset_request = client.post(
                "/auth/email/password/reset/request",
                json={"email": "reset@example.com"},
            )
            self.assertEqual(reset_request.status_code, 200)
            request_body = reset_request.json()
            self.assertIn("request_id", request_body)
            self.assertTrue(request_body.get("reset_requested"))
            self.assertEqual(request_body.get("reset_channel"), "email")
            self.assertEqual(request_body.get("reset_method"), "email_code")
            self.assertIn("reset_debug_code", request_body)

            reset_confirm = client.post(
                "/auth/email/password/reset/confirm",
                json={
                    "email": "reset@example.com",
                    "code": request_body["reset_debug_code"],
                    "new_password": "N3wPassw0rd!",
                },
            )
            self.assertEqual(reset_confirm.status_code, 200)
            confirm_body = reset_confirm.json()
            self.assertTrue(confirm_body.get("password_reset"))
            self.assertIn("request_id", confirm_body)
            self.assertGreaterEqual(confirm_body.get("sessions_revoked", 0), 1)

            old_login = client.post(
                "/auth/email/login",
                json={"email": "reset@example.com", "password": "Passw0rd!"},
            )
            self.assertEqual(old_login.status_code, 401)
            self.assertEqual(old_login.json()["detail"]["code"], "AUTH_INVALID_CREDENTIALS")

            new_login = client.post(
                "/auth/email/login",
                json={"email": "reset@example.com", "password": "N3wPassw0rd!"},
            )
            self.assertEqual(new_login.status_code, 200)
            self.assertIn("access_token", new_login.json())

    def test_password_reset_rejects_invalid_code(self):
        with TestClient(app) as client:
            self._signup_and_verify(
                client,
                email="reset-invalid@example.com",
                password="Passw0rd!",
                display_name="Reset Invalid",
            )

            reset_request = client.post(
                "/auth/email/password/reset/request",
                json={"email": "reset-invalid@example.com"},
            )
            self.assertEqual(reset_request.status_code, 200)

            reset_confirm = client.post(
                "/auth/email/password/reset/confirm",
                json={
                    "email": "reset-invalid@example.com",
                    "code": "000000",
                    "new_password": "N3wPassw0rd!",
                },
            )
            self.assertEqual(reset_confirm.status_code, 400)
            self.assertEqual(reset_confirm.json()["detail"]["code"], "AUTH_PASSWORD_RESET_INVALID")

    def test_password_reset_lockout_returns_retry_metadata(self):
        with TestClient(app) as client:
            self._signup_and_verify(
                client,
                email="reset-locked@example.com",
                password="Passw0rd!",
                display_name="Reset Locked",
            )

            reset_request = client.post(
                "/auth/email/password/reset/request",
                json={"email": "reset-locked@example.com"},
            )
            self.assertEqual(reset_request.status_code, 200)

            locked_response = None
            for _index in range(5):
                locked_response = client.post(
                    "/auth/email/password/reset/confirm",
                    json={
                        "email": "reset-locked@example.com",
                        "code": "000000",
                        "new_password": "N3wPassw0rd!",
                    },
                    headers={"X-Request-Id": "req-auth-reset-locked"},
                )

            self.assertIsNotNone(locked_response)
            self.assertEqual(locked_response.status_code, 429)
            locked_body = locked_response.json()["detail"]
            self.assertEqual(locked_response.headers.get("Retry-After"), str(locked_body["retry_after_seconds"]))
            self.assertEqual(locked_body["code"], "AUTH_PASSWORD_RESET_LOCKED")
            self.assertEqual(locked_body["request_id"], "req-auth-reset-locked")
            self.assertEqual(locked_body["retry_scope"], "AUTH_PASSWORD_RESET_LOCKED")
            self.assertFalse(locked_body["retryable_by_client"])
            self.assertGreaterEqual(locked_body["retry_after_seconds"], 1)

    def test_refresh_reuse_detection_revokes_session_family(self):
        with TestClient(app) as client:
            _, signup = self._signup_and_verify(
                client,
                email="reuse@example.com",
                password="Passw0rd!",
                display_name="Reuse",
            )

            first_refresh = client.post("/auth/refresh", json={"refresh_token": signup["refresh_token"]})
            self.assertEqual(first_refresh.status_code, 200)
            rotated = first_refresh.json()

            replay = client.post("/auth/refresh", json={"refresh_token": signup["refresh_token"]})
            self.assertEqual(replay.status_code, 401)
            self.assertEqual(replay.json()["detail"]["code"], "AUTH_REFRESH_REUSED")

            revoked_after_replay = client.post(
                "/auth/refresh",
                json={"refresh_token": rotated["refresh_token"]},
            )
            self.assertEqual(revoked_after_replay.status_code, 401)
            self.assertEqual(revoked_after_replay.json()["detail"]["code"], "AUTH_SESSION_REVOKED")

    def test_refresh_race_only_allows_single_winner(self):
        with TestClient(app):
            service = app.state.auth_service
            pending = service.signup_email(
                email="race@example.com",
                password="Passw0rd!",
                display_name="Race",
                locale="ko-KR",
                device_id="ios-race",
            )
            self.assertTrue(pending["verification_required"])
            issued = service.verify_email(
                email="race@example.com",
                code=pending["verification_debug_code"],
                device_id="ios-race",
            )
            base_refresh = issued["refresh_token"]

            barrier = threading.Barrier(2)
            results: list[tuple[str, str | None]] = []
            lock = threading.Lock()

            def _refresh_once() -> None:
                barrier.wait()
                try:
                    response = service.refresh(refresh_token=base_refresh)
                    with lock:
                        results.append(("ok", response["refresh_token"]))
                except AuthServiceError as error:
                    with lock:
                        results.append((error.code, None))

            t1 = threading.Thread(target=_refresh_once)
            t2 = threading.Thread(target=_refresh_once)
            t1.start()
            t2.start()
            t1.join()
            t2.join()

            statuses = sorted(status for status, _ in results)
            self.assertEqual(statuses, ["AUTH_REFRESH_REUSED", "ok"])

            rotated_token = next(token for status, token in results if status == "ok")
            self.assertIsNotNone(rotated_token)
            with self.assertRaises(AuthServiceError) as context:
                service.refresh(refresh_token=rotated_token or "")
            self.assertEqual(context.exception.code, "AUTH_SESSION_REVOKED")

    def test_refresh_reuse_grace_window_returns_same_tokens_once(self):
        service = InMemoryAuthSessionService(
            email_verification_required=False,
            refresh_reuse_grace_seconds=3,
        )
        issued = service.signup_email(
            email="grace-runtime@example.com",
            password="Passw0rd!",
            display_name="Grace Runtime",
            locale="ko-KR",
            device_id="ios-grace-runtime",
        )

        first = service.refresh(refresh_token=issued["refresh_token"])
        second = service.refresh(refresh_token=issued["refresh_token"])
        self.assertEqual(second["refresh_token"], first["refresh_token"])
        self.assertEqual(second["access_token"], first["access_token"])

    def test_oauth_provider_error_mapping_and_redirect_mismatch(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "1",
                    "AUTH_GOOGLE_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback",
                },
                clear=False,
            ),
            patch("backend.server._verify_google_identity", return_value=("google-user-1", "google-user@example.com")),
            patch("backend.server._verify_kakao_identity", return_value=("kakao-user-1", "kakao-user@example.com")),
            TestClient(app) as client,
        ):
            google_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-success-1"),
            )
            google_success = client.post(
                "/auth/google",
                json={
                    "code": "google-code-1",
                    "state": google_state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                },
            )
            self.assertEqual(google_success.status_code, 200)
            self.assertEqual(google_success.json()["user"]["provider"], "google")

            kakao_state = self._seed_oauth_pending_state(
                provider="kakao",
                redirect_uri="foodlens://oauth/kakao-callback",
                state=self._oauth_test_state("kakao-success-1"),
            )
            kakao_success = client.post(
                "/auth/kakao",
                json={
                    "code": "kakao-code-1",
                    "state": kakao_state,
                },
            )
            self.assertEqual(kakao_success.status_code, 200)
            self.assertEqual(kakao_success.json()["user"]["provider"], "kakao")

            cancelled_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-cancelled"),
            )
            cancelled = client.post(
                "/auth/google",
                json={"error": "access_denied", "state": cancelled_state},
            )
            self.assertEqual(cancelled.status_code, 400)
            self.assertEqual(cancelled.json()["detail"]["code"], "AUTH_PROVIDER_CANCELLED")

            invalid_code_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-invalid-code"),
            )
            invalid_code = client.post(
                "/auth/google",
                json={"state": invalid_code_state, "redirect_uri": "foodlens://oauth/google-callback"},
            )
            self.assertEqual(invalid_code.status_code, 400)
            self.assertEqual(invalid_code.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_CODE")

            redirect_mismatch_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-redirect-mismatch"),
            )
            redirect_mismatch = client.post(
                "/auth/google",
                json={
                    "code": "google-auth-code",
                    "state": redirect_mismatch_state,
                    "redirect_uri": "foodlens://oauth/invalid",
                },
            )
            self.assertEqual(redirect_mismatch.status_code, 400)
            self.assertEqual(redirect_mismatch.json()["detail"]["code"], "AUTH_REDIRECT_URI_MISMATCH")

    def test_oauth_public_request_ignores_client_supplied_identity(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "1",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server._verify_google_identity", return_value=("verified-google-subject", "verified-google@example.com")),
            patch("backend.server._verify_kakao_identity", return_value=("verified-kakao-subject", "verified-kakao@example.com")),
            TestClient(app) as client,
        ):
            cases = (
                ("google", "/auth/google", "verified-google@example.com", "google:verified-google-subject"),
                ("kakao", "/auth/kakao", "verified-kakao@example.com", "kakao:verified-kakao-subject"),
            )
            for provider, endpoint, verified_email, provider_key in cases:
                redirect_uri = f"foodlens://oauth/{provider}-callback"
                state = self._seed_oauth_pending_state(
                    provider=provider,
                    redirect_uri=redirect_uri,
                    state=self._oauth_test_state(f"{provider}-forged-state"),
                )
                response = client.post(
                    endpoint,
                    json={
                        "code": "forged-code",
                        "state": state,
                        "redirect_uri": redirect_uri,
                        "email": "victim@example.com",
                        "provider_user_id": "victim-provider-subject",
                    },
                )

                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["user"]["email"], verified_email)
                provider_subjects = app.state.auth_service._provider_subject_to_user_id
                self.assertIn(provider_key, provider_subjects)
                self.assertNotIn(f"{provider}:victim-provider-subject", provider_subjects)

    def test_oauth_login_rejects_email_without_provider_subject(self):
        service = InMemoryAuthSessionService(email_verification_required=False)

        with self.assertRaises(AuthServiceError) as context:
            service.oauth_login(
                provider="google",
                code="google-code-with-email-only",
                state="google-state-with-email-only",
                redirect_uri=None,
                error=None,
                provider_user_id=None,
                email="owner@example.com",
            )

        self.assertEqual(context.exception.code, "AUTH_PROVIDER_IDENTITY_MISSING")

    def test_oauth_links_existing_email_user_only_with_verified_provider_subject(self):
        service = InMemoryAuthSessionService(email_verification_required=False)
        email_session = service.signup_email(
            email="linkable@example.com",
            password="Passw0rd!",
            display_name="Linkable User",
            locale="ko-KR",
            device_id="ios-email-linkable",
        )

        oauth_session = service.oauth_login(
            provider="google",
            code="google-code-with-verified-email",
            state="google-state-with-verified-email",
            redirect_uri=None,
            error=None,
            provider_user_id="google-verified-subject",
            email="Linkable@Example.com",
        )

        self.assertEqual(oauth_session["user"]["id"], email_session["user"]["id"])
        self.assertIn("google:google-verified-subject", service._provider_subject_to_user_id)

    def test_oauth_requires_verified_provider_identity(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "0",
                    "AUTH_GOOGLE_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-no-identity"),
            )
            response = client.post(
                "/auth/google",
                json={
                    "code": "google-code-no-identity",
                    "state": state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                    "email": "forged-no-identity@example.com",
                    "provider_user_id": "forged-no-identity-subject",
                },
            )

            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["detail"]["code"], "AUTH_PROVIDER_IDENTITY_MISSING")
            provider_subjects = app.state.auth_service._provider_subject_to_user_id
            self.assertNotIn("google:forged-no-identity-subject", provider_subjects)

    def test_oauth_pending_state_is_consumed_once_and_bound_to_provider(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "1",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server._verify_google_identity", return_value=("google-consume-user", None)),
            patch("backend.server._verify_kakao_identity", return_value=("kakao-wrong-provider-user", None)),
            TestClient(app) as client,
        ):
            valid_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-consume-once"),
            )
            success = client.post(
                "/auth/google",
                json={
                    "code": "google-consume-code",
                    "state": valid_state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                },
            )
            self.assertEqual(success.status_code, 200)

            replay = client.post(
                "/auth/google",
                json={
                    "code": "google-consume-code-2",
                    "state": valid_state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                },
            )
            self.assertEqual(replay.status_code, 400)
            self.assertEqual(replay.json()["detail"]["code"], "AUTH_PROVIDER_STATE_REUSED")

            wrong_provider_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-used-on-kakao"),
            )
            wrong_provider = client.post(
                "/auth/kakao",
                json={
                    "code": "kakao-wrong-provider-code",
                    "state": wrong_provider_state,
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                },
            )
            self.assertEqual(wrong_provider.status_code, 400)
            self.assertEqual(wrong_provider.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_STATE")

    def test_oauth_pending_state_uses_atomic_store_capability(self):
        atomic_store = _AtomicOAuthPendingStateStore()
        service = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=atomic_store,
            token_hash_secret="test-atomic-oauth-state-secret",
        )
        state = self._oauth_test_state("atomic-store")
        created = service.create_oauth_pending_state(
            provider="google",
            app_redirect_uri="foodlens://oauth/google-callback",
            state=state,
            request_id="req-atomic-store",
            nonce=self._oauth_test_state("atomic-store-nonce"),
            code_verifier="atomic-store-code-verifier-000000000000000000",
            code_challenge="atomic-store-code-challenge-00000000000000000",
            ttl_seconds=600,
        )

        self.assertEqual(atomic_store.create_calls, 1)
        self.assertEqual(created["state"], state)
        self.assertEqual(created["request_id"], "req-atomic-store")
        self.assertEqual(atomic_store.snapshot_saves, [])

        verified = service.verify_oauth_pending_state(
            provider="google",
            state=state,
            app_redirect_uri="foodlens://oauth/google-callback",
        )
        self.assertEqual(atomic_store.get_calls, 1)
        self.assertEqual(verified["provider"], "google")
        self.assertEqual(verified["code_verifier"], "atomic-store-code-verifier-000000000000000000")

        age_bucket = service.oauth_pending_state_age_bucket(
            state=state,
            now=datetime.now(timezone.utc),
        )
        self.assertEqual(age_bucket, "lt_1m")
        self.assertEqual(atomic_store.get_calls, 2)

        consumed = service.consume_oauth_pending_state(
            provider="google",
            state=state,
            app_redirect_uri="foodlens://oauth/google-callback",
        )
        self.assertEqual(atomic_store.consume_calls, 1)
        self.assertIsNotNone(consumed["consumed_at"])

        with self.assertRaises(AuthServiceError) as context:
            service.consume_oauth_pending_state(
                provider="google",
                state=state,
                app_redirect_uri="foodlens://oauth/google-callback",
            )
        self.assertEqual(context.exception.code, "AUTH_PROVIDER_STATE_REUSED")
        self.assertEqual(atomic_store.get_calls, 3)

    def test_oauth_callback_rejects_unknown_expired_and_wrong_provider_state(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            unknown_state = self._oauth_test_state("google-unknown")
            with self.assertLogs("foodlens.api", level="WARNING") as captured_unknown:
                unknown = client.get(
                    "/auth/google/callback",
                    params={"code": "google-unknown-code", "state": unknown_state},
                    headers={"X-Request-Id": "req-oauth-state-unknown"},
                    follow_redirects=False,
                )
            unknown_record = self._oauth_state_failure_record(
                captured_unknown.records,
                failure_code="AUTH_PROVIDER_INVALID_STATE",
            )
            self._assert_oauth_state_failure_record(
                unknown_record,
                request_id="req-oauth-state-unknown",
                provider="google",
                failure_code="AUTH_PROVIDER_INVALID_STATE",
                state_age_bucket="unknown",
                forbidden_values=(unknown_state, "google-unknown-code"),
            )
            self.assertEqual(unknown.status_code, 400)
            self.assertEqual(unknown.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_STATE")

            valid_state, _query = self._start_oauth_state(
                client,
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-callback-valid"),
            )
            tampered = client.get(
                "/auth/google/callback",
                params={"code": "google-tampered-code", "state": f"{valid_state}tampered"},
                follow_redirects=False,
            )
            self.assertEqual(tampered.status_code, 400)
            self.assertEqual(tampered.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_STATE")

            wrong_provider = client.get(
                "/auth/kakao/callback",
                params={"code": "kakao-wrong-provider-code", "state": valid_state},
                follow_redirects=False,
            )
            self.assertEqual(wrong_provider.status_code, 400)
            self.assertEqual(wrong_provider.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_STATE")

            expired_state, _expired_query = self._start_oauth_state(
                client,
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-expired"),
            )
            expired_record = app.state.auth_service._oauth_pending_states[expired_state]
            expired_record.created_at = server_module._utc_now() - server_module.timedelta(minutes=6)
            expired_record.expires_at = server_module._utc_now() - server_module.timedelta(seconds=1)
            with self.assertLogs("foodlens.api", level="WARNING") as captured_expired:
                expired = client.get(
                    "/auth/google/callback",
                    params={"code": "google-expired-code", "state": expired_state},
                    headers={"X-Request-Id": "req-oauth-state-expired"},
                    follow_redirects=False,
                )
            logged_expired_record = self._oauth_state_failure_record(
                captured_expired.records,
                failure_code="AUTH_PROVIDER_STATE_EXPIRED",
            )
            self._assert_oauth_state_failure_record(
                logged_expired_record,
                request_id="req-oauth-state-expired",
                provider="google",
                failure_code="AUTH_PROVIDER_STATE_EXPIRED",
                state_age_bucket="5m_10m",
                forbidden_values=(expired_state, "google-expired-code"),
            )
            self.assertEqual(expired.status_code, 400)
            self.assertEqual(expired.json()["detail"]["code"], "AUTH_PROVIDER_STATE_EXPIRED")

    def test_oauth_post_invalid_state_fails_before_provider_exchange(self):
        mocked_token_response = Mock()
        mocked_token_response.status_code = 200
        mocked_token_response.json.return_value = {
            "access_token": "google-access-token",
            "token_type": "Bearer",
        }

        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server.requests.post", return_value=mocked_token_response) as mocked_post,
            patch("backend.server.requests.get") as mocked_get,
            TestClient(app) as client,
        ):
            unknown_state = self._oauth_test_state("google-post-unknown")
            with self.assertLogs("foodlens.api", level="WARNING") as captured:
                response = client.post(
                    "/auth/google",
                    json={
                        "code": "google-invalid-state-code",
                        "state": unknown_state,
                        "redirect_uri": "foodlens://oauth/google-callback",
                    },
                    headers={"X-Request-Id": "req-oauth-post-invalid-state"},
                )
            record = self._oauth_state_failure_record(
                captured.records,
                failure_code="AUTH_PROVIDER_INVALID_STATE",
            )
            self._assert_oauth_state_failure_record(
                record,
                request_id="req-oauth-post-invalid-state",
                provider="google",
                failure_code="AUTH_PROVIDER_INVALID_STATE",
                state_age_bucket="unknown",
                forbidden_values=(unknown_state, "google-invalid-state-code"),
            )
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_STATE")
            mocked_post.assert_not_called()
            mocked_get.assert_not_called()

    def test_oauth_post_rate_limit_blocks_same_device_across_ip_rotation_per_provider(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "1",
                    "AUTH_GOOGLE_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server._verify_google_identity", return_value=("google-device-limit-1", None)),
            patch("backend.server._verify_kakao_identity", return_value=("kakao-device-limit-1", None)),
            TestClient(app) as client,
        ):
            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = InMemorySlidingWindowRateLimiter(
                endpoint_limits_per_minute={
                    "/auth/google": 1,
                    "/auth/kakao": 1,
                },
                window_seconds=60,
            )
            try:
                first_google_state = self._seed_oauth_pending_state(
                    provider="google",
                    redirect_uri="foodlens://oauth/google-callback",
                    state=self._oauth_test_state("google-device-limit-1"),
                )
                first_google = client.post(
                    "/auth/google",
                    json={
                        "code": "google-device-limit-1",
                        "state": first_google_state,
                        "redirect_uri": "foodlens://oauth/google-callback",
                        "device_id": "ios-oauth-provider-limit",
                    },
                    headers={
                        "X-Forwarded-For": "8.8.8.8",
                        "X-Request-Id": "req-oauth-google-device-limit-1",
                    },
                )
                self.assertEqual(first_google.status_code, 200)

                blocked_google = client.post(
                    "/auth/google",
                    json={
                        "code": "google-device-limit-2",
                        "state": self._oauth_test_state("google-device-limit-2"),
                        "redirect_uri": "foodlens://oauth/google-callback",
                        "device_id": "ios-oauth-provider-limit",
                    },
                    headers={
                        "X-Forwarded-For": "1.1.1.1",
                        "X-Request-Id": "req-oauth-google-device-limit-blocked",
                    },
                )
                self._assert_auth_rate_limited_response(
                    blocked_google,
                    request_id="req-oauth-google-device-limit-blocked",
                    retry_scope="/auth/google",
                )

                kakao_state = self._seed_oauth_pending_state(
                    provider="kakao",
                    redirect_uri="foodlens://oauth/kakao-callback",
                    state=self._oauth_test_state("kakao-device-limit-1"),
                )
                kakao_same_device = client.post(
                    "/auth/kakao",
                    json={
                        "code": "kakao-device-limit-1",
                        "state": kakao_state,
                        "device_id": "ios-oauth-provider-limit",
                    },
                    headers={
                        "X-Forwarded-For": "1.1.1.1",
                        "X-Request-Id": "req-oauth-kakao-device-limit-1",
                    },
                )
                self.assertEqual(kakao_same_device.status_code, 200)
            finally:
                app.state.auth_rate_limiter = previous_limiter

    def test_oauth_start_rate_limit_blocks_same_forwarded_client(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = InMemorySlidingWindowRateLimiter(
                endpoint_limits_per_minute={"/auth/google/start": 1},
                window_seconds=60,
            )
            try:
                first_start = client.get(
                    "/auth/google/start",
                    params={
                        "redirect_uri": "foodlens://oauth/google-callback",
                        "state": self._oauth_test_state("start-limit-google-1"),
                    },
                    headers={
                        "X-Forwarded-For": "8.8.4.4",
                        "X-Request-Id": "req-oauth-google-start-limit-1",
                    },
                    follow_redirects=False,
                )
                self.assertEqual(first_start.status_code, 302)

                blocked_start = client.get(
                    "/auth/google/start",
                    params={
                        "redirect_uri": "foodlens://oauth/google-callback",
                        "state": self._oauth_test_state("start-limit-google-2"),
                    },
                    headers={
                        "X-Forwarded-For": "8.8.4.4",
                        "X-Request-Id": "req-oauth-google-start-limit-blocked",
                    },
                    follow_redirects=False,
                )
                self._assert_auth_rate_limited_response(
                    blocked_start,
                    request_id="req-oauth-google-start-limit-blocked",
                    retry_scope="/auth/google/start",
                )
            finally:
                app.state.auth_rate_limiter = previous_limiter

    def test_oauth_callback_rate_limit_blocks_same_forwarded_client(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            previous_limiter = getattr(app.state, "auth_rate_limiter", None)
            app.state.auth_rate_limiter = InMemorySlidingWindowRateLimiter(
                endpoint_limits_per_minute={
                    "/auth/google/callback": 1,
                    "/auth/kakao/callback": 1,
                },
                window_seconds=60,
            )
            try:
                google_state, _google_start_query = self._start_oauth_state(
                    client,
                    provider="google",
                    redirect_uri="foodlens://oauth/google-callback",
                    state=self._oauth_test_state("callback-limit-google"),
                )
                first_callback = client.get(
                    "/auth/google/callback",
                    params={"code": "google-callback-limit-1", "state": google_state},
                    headers={
                        "X-Forwarded-For": "9.9.9.9",
                        "X-Request-Id": "req-oauth-google-callback-limit-1",
                    },
                    follow_redirects=False,
                )
                self.assertEqual(first_callback.status_code, 302)

                blocked_callback = client.get(
                    "/auth/google/callback",
                    params={"code": "google-callback-limit-2", "state": google_state},
                    headers={
                        "X-Forwarded-For": "9.9.9.9",
                        "X-Request-Id": "req-oauth-google-callback-limit-blocked",
                    },
                    follow_redirects=False,
                )
                self.assertEqual(blocked_callback.status_code, 302)
                blocked_location = blocked_callback.headers["location"]
                blocked_query = parse_qs(urlparse(blocked_location).query)
                self.assertEqual(blocked_query["error"], ["AUTH_RATE_LIMITED"])
                self.assertEqual(blocked_query["request_id"], ["req-oauth-google-callback-limit-blocked"])
                self.assertEqual(blocked_query["state"], [google_state])
                self.assertIn("retry_after_seconds", blocked_query)
                self.assertEqual(
                    blocked_callback.headers.get("Retry-After"),
                    blocked_query["retry_after_seconds"][0],
                )

                kakao_state, _kakao_start_query = self._start_oauth_state(
                    client,
                    provider="kakao",
                    redirect_uri="foodlens://oauth/kakao-callback",
                    state=self._oauth_test_state("callback-limit-kakao"),
                )
                first_kakao_callback = client.get(
                    "/auth/kakao/callback",
                    params={"code": "kakao-callback-limit-1", "state": kakao_state},
                    headers={
                        "X-Forwarded-For": "9.9.9.9",
                        "X-Request-Id": "req-oauth-kakao-callback-limit-1",
                    },
                    follow_redirects=False,
                )
                self.assertEqual(first_kakao_callback.status_code, 302)

                blocked_kakao_callback = client.get(
                    "/auth/kakao/callback",
                    params={"code": "kakao-callback-limit-2", "state": kakao_state},
                    headers={
                        "X-Forwarded-For": "9.9.9.9",
                        "X-Request-Id": "req-oauth-kakao-callback-limit-blocked",
                    },
                    follow_redirects=False,
                )
                self.assertEqual(blocked_kakao_callback.status_code, 302)
                blocked_kakao_location = blocked_kakao_callback.headers["location"]
                blocked_kakao_query = parse_qs(urlparse(blocked_kakao_location).query)
                self.assertEqual(blocked_kakao_query["error"], ["AUTH_RATE_LIMITED"])
                self.assertEqual(
                    blocked_kakao_query["request_id"],
                    ["req-oauth-kakao-callback-limit-blocked"],
                )
            finally:
                app.state.auth_rate_limiter = previous_limiter

    def test_kakao_oauth_live_verification_uses_client_secret(self):
        mocked_token_response = Mock()
        mocked_token_response.status_code = 200
        mocked_token_response.json.return_value = {
            "access_token": "kakao-access-token",
            "token_type": "bearer",
        }

        mocked_profile_response = Mock()
        mocked_profile_response.status_code = 200
        mocked_profile_response.json.return_value = {
            "id": "kakao-user-123",
            "kakao_account": {
                "email": "verified-kakao@example.com",
                "is_email_valid": True,
                "is_email_verified": True,
            },
        }

        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "1",
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_KAKAO_CLIENT_SECRET": "kakao-client-secret-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server.requests.post", return_value=mocked_token_response) as mocked_post,
            patch("backend.server.requests.get", return_value=mocked_profile_response) as mocked_get,
            TestClient(app) as client,
        ):
            kakao_state = self._seed_oauth_pending_state(
                provider="kakao",
                redirect_uri="foodlens://oauth/kakao-callback",
                state=self._oauth_test_state("kakao-live-secret"),
                code_verifier="K" * 43,
            )
            kakao_success = client.post(
                "/auth/kakao",
                json={
                    "code": "kakao-code-live",
                    "state": kakao_state,
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                },
            )

            self.assertEqual(kakao_success.status_code, 200)
            body = kakao_success.json()
            self.assertEqual(body["user"]["provider"], "kakao")
            self.assertEqual(body["user"]["email"], "verified-kakao@example.com")
            provider_subjects = app.state.auth_service._provider_subject_to_user_id
            self.assertIn("kakao:kakao-user-123", provider_subjects)
            self.assertNotIn("kakao:untrusted-client-subject", provider_subjects)
            self.assertIn("request_id", body)

            self.assertEqual(mocked_post.call_count, 1)
            token_call_kwargs = mocked_post.call_args.kwargs
            self.assertEqual(token_call_kwargs["data"]["client_id"], "kakao-client-id-test")
            self.assertEqual(token_call_kwargs["data"]["client_secret"], "kakao-client-secret-test")
            self.assertTrue(token_call_kwargs["data"]["redirect_uri"].endswith("/auth/kakao/callback"))
            self.assertEqual(token_call_kwargs["data"]["code_verifier"], "K" * 43)

            self.assertEqual(mocked_get.call_count, 1)
            profile_call_kwargs = mocked_get.call_args.kwargs
            self.assertEqual(profile_call_kwargs["headers"]["Authorization"], "Bearer kakao-access-token")

    def test_kakao_oauth_verifies_identity_when_callback_has_no_identity_fields(self):
        mocked_token_response = Mock()
        mocked_token_response.status_code = 200
        mocked_token_response.json.return_value = {
            "access_token": "kakao-access-token",
            "token_type": "bearer",
        }

        mocked_profile_response = Mock()
        mocked_profile_response.status_code = 200
        mocked_profile_response.json.return_value = {
            "id": "kakao-user-bridge",
            "kakao_account": {
                "email": "bridge-kakao@example.com",
                "is_email_valid": True,
                "is_email_verified": True,
            },
        }

        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "0",
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server.requests.post", return_value=mocked_token_response) as mocked_post,
            patch("backend.server.requests.get", return_value=mocked_profile_response) as mocked_get,
            TestClient(app) as client,
        ):
            kakao_state = self._seed_oauth_pending_state(
                provider="kakao",
                redirect_uri="foodlens://oauth/kakao-callback",
                state=self._oauth_test_state("kakao-bridge-live"),
            )
            kakao_success = client.post(
                "/auth/kakao",
                json={
                    "code": "kakao-code-bridge-live",
                    "state": kakao_state,
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                },
            )

            self.assertEqual(kakao_success.status_code, 200)
            body = kakao_success.json()
            self.assertEqual(body["user"]["provider"], "kakao")
            self.assertEqual(body["user"]["email"], "bridge-kakao@example.com")
            self.assertEqual(mocked_post.call_count, 1)
            self.assertEqual(mocked_get.call_count, 1)

    def test_kakao_oauth_live_verification_invalid_grant_maps_error(self):
        mocked_token_response = Mock()
        mocked_token_response.status_code = 400
        mocked_token_response.json.return_value = {"error": "invalid_grant"}

        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "1",
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server.requests.post", return_value=mocked_token_response) as mocked_post,
            patch("backend.server.requests.get") as mocked_get,
            TestClient(app) as client,
        ):
            kakao_state = self._seed_oauth_pending_state(
                provider="kakao",
                redirect_uri="foodlens://oauth/kakao-callback",
                state=self._oauth_test_state("kakao-invalid-live"),
            )
            kakao_invalid = client.post(
                "/auth/kakao",
                json={
                    "code": "invalid-live-code",
                    "state": kakao_state,
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                },
            )

            self.assertEqual(kakao_invalid.status_code, 400)
            self.assertEqual(kakao_invalid.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_CODE")
            mocked_get.assert_not_called()

    def test_google_oauth_live_verification_uses_client_secret(self):
        mocked_token_response = Mock()
        mocked_token_response.status_code = 200
        mocked_token_response.json.return_value = {
            "access_token": "google-access-token",
            "token_type": "Bearer",
        }

        mocked_profile_response = Mock()
        mocked_profile_response.status_code = 200
        mocked_profile_response.json.return_value = {
            "sub": "google-user-123",
            "email": "verified-google@example.com",
            "email_verified": True,
        }

        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_GOOGLE_CLIENT_SECRET": "google-client-secret-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server.requests.post", return_value=mocked_token_response) as mocked_post,
            patch("backend.server.requests.get", return_value=mocked_profile_response) as mocked_get,
            TestClient(app) as client,
        ):
            google_code_verifier = "A" * 43
            google_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-live-secret"),
                code_verifier=google_code_verifier,
            )
            google_success = client.post(
                "/auth/google",
                json={
                    "code": "google-code-live",
                    "state": google_state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                },
            )

            self.assertEqual(google_success.status_code, 200)
            body = google_success.json()
            self.assertEqual(body["user"]["provider"], "google")
            self.assertEqual(body["user"]["email"], "verified-google@example.com")
            provider_subjects = app.state.auth_service._provider_subject_to_user_id
            self.assertIn("google:google-user-123", provider_subjects)
            self.assertNotIn("google:untrusted-google-subject", provider_subjects)
            self.assertIn("request_id", body)

            self.assertEqual(mocked_post.call_count, 1)
            token_call_kwargs = mocked_post.call_args.kwargs
            self.assertEqual(token_call_kwargs["data"]["client_id"], "google-client-id-test")
            self.assertEqual(token_call_kwargs["data"]["client_secret"], "google-client-secret-test")
            self.assertTrue(token_call_kwargs["data"]["redirect_uri"].endswith("/auth/google/callback"))
            self.assertEqual(token_call_kwargs["data"]["code_verifier"], google_code_verifier)

            self.assertEqual(mocked_get.call_count, 1)
            profile_call_kwargs = mocked_get.call_args.kwargs
            self.assertEqual(profile_call_kwargs["headers"]["Authorization"], "Bearer google-access-token")

    def test_google_oauth_live_verification_discards_client_email_without_verified_provider_email(self):
        mocked_token_response = Mock()
        mocked_token_response.status_code = 200
        mocked_token_response.json.return_value = {
            "access_token": "google-no-email-access-token",
            "token_type": "Bearer",
        }

        mocked_profile_response = Mock()
        mocked_profile_response.status_code = 200
        mocked_profile_response.json.return_value = {
            "sub": "google-no-email-subject",
            "email": "unverified-google@example.com",
            "email_verified": False,
        }

        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server.requests.post", return_value=mocked_token_response) as mocked_post,
            patch("backend.server.requests.get", return_value=mocked_profile_response) as mocked_get,
            TestClient(app) as client,
        ):
            google_code_verifier = "C" * 43
            google_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-live-unverified-email"),
                code_verifier=google_code_verifier,
            )
            google_success = client.post(
                "/auth/google",
                json={
                    "code": "google-code-live-unverified-email",
                    "state": google_state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                },
            )

            self.assertEqual(google_success.status_code, 200)
            body = google_success.json()
            self.assertEqual(body["user"]["provider"], "google")
            self.assertEqual(body["user"]["email"], "google_google-no-email-subject@foodlens.local")
            provider_subjects = app.state.auth_service._provider_subject_to_user_id
            self.assertIn("google:google-no-email-subject", provider_subjects)
            self.assertNotIn("google:client-only-google-subject", provider_subjects)
            self.assertEqual(mocked_post.call_count, 1)
            self.assertEqual(mocked_get.call_count, 1)

    def test_google_oauth_live_verification_invalid_grant_maps_error(self):
        mocked_token_response = Mock()
        mocked_token_response.status_code = 400
        mocked_token_response.json.return_value = {"error": "invalid_grant"}

        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_CODE_VERIFY_ENABLED": "1",
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            patch("backend.server.requests.post", return_value=mocked_token_response) as mocked_post,
            patch("backend.server.requests.get") as mocked_get,
            TestClient(app) as client,
        ):
            google_code_verifier = "B" * 43
            google_state = self._seed_oauth_pending_state(
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
                state=self._oauth_test_state("google-invalid-live"),
                code_verifier=google_code_verifier,
            )
            google_invalid = client.post(
                "/auth/google",
                json={
                    "code": "invalid-live-code",
                    "state": google_state,
                    "redirect_uri": "foodlens://oauth/google-callback",
                },
            )

            self.assertEqual(google_invalid.status_code, 400)
            self.assertEqual(google_invalid.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_CODE")
            self.assertEqual(mocked_post.call_count, 1)
            mocked_get.assert_not_called()

    def test_oauth_start_generates_high_entropy_persisted_state_when_omitted(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            google_state, google_query = self._start_oauth_state(
                client,
                provider="google",
                redirect_uri="foodlens://oauth/google-callback",
            )
            kakao_state, kakao_query = self._start_oauth_state(
                client,
                provider="kakao",
                redirect_uri="foodlens://oauth/kakao-callback",
            )

            self.assertTrue(server_module._is_high_entropy_oauth_state(google_state))
            self.assertTrue(server_module._is_high_entropy_oauth_state(kakao_state))
            self.assertFalse(google_state.startswith("test-oauth-state-"))
            self.assertFalse(kakao_state.startswith("test-oauth-state-"))
            self.assertNotEqual(google_state, kakao_state)

            google_pending_state = app.state.auth_service.verify_oauth_pending_state(
                provider="google",
                state=google_state,
                app_redirect_uri="foodlens://oauth/google-callback",
            )
            self.assertEqual(google_pending_state["provider"], "google")
            self.assertEqual(google_pending_state["app_redirect_uri"], "foodlens://oauth/google-callback")
            self.assertEqual(google_pending_state["code_challenge"], google_query["code_challenge"][0])
            self.assertIsInstance(google_pending_state["code_verifier"], str)
            self.assertIn("nonce", google_query)

            kakao_pending_state = app.state.auth_service.verify_oauth_pending_state(
                provider="kakao",
                state=kakao_state,
                app_redirect_uri="foodlens://oauth/kakao-callback",
            )
            self.assertEqual(kakao_pending_state["provider"], "kakao")
            self.assertEqual(kakao_pending_state["app_redirect_uri"], "foodlens://oauth/kakao-callback")
            self.assertEqual(kakao_pending_state["code_challenge"], kakao_query["code_challenge"][0])
            self.assertIsInstance(kakao_pending_state["code_verifier"], str)
            self.assertEqual(kakao_query["code_challenge_method"][0], "S256")
            self.assertEqual(kakao_query["state"][0], kakao_state)

    def test_oauth_start_rejects_low_diversity_client_state(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            low_diversity_state = "a" * server_module.OAUTH_STATE_MIN_LENGTH
            start = client.get(
                "/auth/google/start",
                params={
                    "redirect_uri": "foodlens://oauth/google-callback",
                    "state": low_diversity_state,
                },
                follow_redirects=False,
            )

            self.assertEqual(start.status_code, 400)
            self.assertEqual(start.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_STATE")

    def test_google_oauth_web_bridge_start_and_callback(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            start = client.get(
                "/auth/google/start",
                params={
                    "redirect_uri": "foodlens://oauth/google-callback",
                    "state": self._oauth_test_state("web-google"),
                },
                follow_redirects=False,
            )
            self.assertEqual(start.status_code, 302)
            location = start.headers["location"]

            parsed = urlparse(location)
            self.assertEqual(parsed.netloc, "accounts.google.com")
            query = parse_qs(parsed.query)
            self.assertEqual(query["client_id"][0], "google-client-id-test")
            self.assertEqual(query["redirect_uri"][0], f"{self.AUTH_PUBLIC_BASE_URL}/auth/google/callback")
            self.assertEqual(query["prompt"][0], "select_account")
            self.assertEqual(query["code_challenge_method"][0], "S256")
            self.assertIn("code_challenge", query)
            self.assertIn("nonce", query)
            state_handle = query["state"][0]
            pending_state = app.state.auth_service.verify_oauth_pending_state(
                provider="google",
                state=state_handle,
                app_redirect_uri="foodlens://oauth/google-callback",
            )
            self.assertEqual(pending_state["provider"], "google")
            self.assertEqual(pending_state["app_redirect_uri"], "foodlens://oauth/google-callback")
            self.assertEqual(pending_state["code_challenge"], query["code_challenge"][0])

            callback = client.get(
                "/auth/google/callback",
                params={"code": "google-code-bridge", "state": state_handle},
                follow_redirects=False,
            )
            self.assertEqual(callback.status_code, 302)
            callback_location = callback.headers["location"]
            self.assertTrue(callback_location.startswith("foodlens://oauth/google-callback"))
            callback_query = parse_qs(urlparse(callback_location).query)
            self.assertEqual(callback_query["code"][0], "google-code-bridge")
            self.assertEqual(callback_query["state"][0], state_handle)
            self.assertIn("request_id", callback_query)

    def test_kakao_oauth_web_bridge_omits_scope_by_default(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_KAKAO_OAUTH_SCOPE": "",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            start = client.get(
                "/auth/kakao/start",
                params={
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                    "state": self._oauth_test_state("web-kakao-no-scope"),
                },
                follow_redirects=False,
            )
            self.assertEqual(start.status_code, 302)

            parsed = urlparse(start.headers["location"])
            self.assertEqual(parsed.netloc, "kauth.kakao.com")
            query = parse_qs(parsed.query)
            self.assertEqual(query["client_id"][0], "kakao-client-id-test")
            self.assertEqual(query["redirect_uri"][0], f"{self.AUTH_PUBLIC_BASE_URL}/auth/kakao/callback")
            self.assertNotIn("scope", query)
            self.assertIn("code_challenge", query)
            self.assertEqual(query["code_challenge_method"][0], "S256")

    def test_kakao_oauth_web_bridge_includes_scope_only_when_configured(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_KAKAO_OAUTH_SCOPE": "account_email",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            start = client.get(
                "/auth/kakao/start",
                params={
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                    "state": self._oauth_test_state("web-kakao-scope"),
                },
                follow_redirects=False,
            )
            self.assertEqual(start.status_code, 302)

            query = parse_qs(urlparse(start.headers["location"]).query)
            self.assertEqual(query["scope"], ["account_email"])

    def test_kakao_oauth_web_bridge_rejects_unapproved_app_redirect(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            start = client.get(
                "/auth/kakao/start",
                params={"redirect_uri": "https://malicious.example.com/callback"},
                follow_redirects=False,
            )
            self.assertEqual(start.status_code, 400)
            body = start.json()
            self.assertEqual(body["detail"]["code"], "AUTH_REDIRECT_URI_MISMATCH")

    def test_google_logout_web_bridge_start_and_callback(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS": "foodlens://oauth/logout-complete",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            start = client.get(
                "/auth/google/logout/start",
                params={"redirect_uri": "foodlens://oauth/logout-complete"},
                follow_redirects=False,
            )
            self.assertEqual(start.status_code, 302)
            start_location = start.headers["location"]
            self.assertTrue(start_location.startswith("https://accounts.google.com/Logout"))

            callback = client.get(
                "/auth/google/logout/callback",
                params={"app_redirect_uri": "foodlens://oauth/logout-complete"},
                follow_redirects=False,
            )
            self.assertEqual(callback.status_code, 302)
            callback_location = callback.headers["location"]
            self.assertTrue(callback_location.startswith("foodlens://oauth/logout-complete"))
            callback_query = parse_qs(urlparse(callback_location).query)
            self.assertEqual(callback_query["provider"][0], "google")
            self.assertEqual(callback_query["logout"][0], "ok")
            self.assertIn("request_id", callback_query)

    def test_kakao_logout_web_bridge_start_and_callback(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": self.AUTH_PUBLIC_BASE_URL,
                    "AUTH_KAKAO_CLIENT_ID": "kakao-client-id-test",
                    "AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS": "foodlens://oauth/logout-complete",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            start = client.get(
                "/auth/kakao/logout/start",
                params={"redirect_uri": "foodlens://oauth/logout-complete"},
                follow_redirects=False,
            )
            self.assertEqual(start.status_code, 302)
            start_location = start.headers["location"]
            parsed = urlparse(start_location)
            self.assertEqual(parsed.netloc, "kauth.kakao.com")
            start_query = parse_qs(parsed.query)
            self.assertEqual(start_query["client_id"][0], "kakao-client-id-test")
            self.assertEqual(
                start_query["logout_redirect_uri"][0],
                f"{self.AUTH_PUBLIC_BASE_URL}/auth/kakao/logout/callback?app_redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete",
            )

            callback = client.get(
                "/auth/kakao/logout/callback",
                params={"app_redirect_uri": "foodlens://oauth/logout-complete"},
                follow_redirects=False,
            )
            self.assertEqual(callback.status_code, 302)
            callback_location = callback.headers["location"]
            self.assertTrue(callback_location.startswith("foodlens://oauth/logout-complete"))
            callback_query = parse_qs(urlparse(callback_location).query)
            self.assertEqual(callback_query["provider"][0], "kakao")
            self.assertEqual(callback_query["logout"][0], "ok")

    def test_logout_bridge_rejects_unapproved_redirect_uri(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS": "foodlens://oauth/logout-complete",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            rejected = client.get(
                "/auth/google/logout/start",
                params={"redirect_uri": "https://malicious.example.com/logout"},
                follow_redirects=False,
            )
            self.assertEqual(rejected.status_code, 400)
            body = rejected.json()
            self.assertEqual(body["detail"]["code"], "AUTH_REDIRECT_URI_MISMATCH")

    def test_account_switch_keeps_profiles_isolated(self):
        with TestClient(app) as client:
            _, account_a = self._signup_and_verify(
                client,
                email="a@example.com",
                password="Passw0rd!",
                display_name="A",
            )
            _, account_b = self._signup_and_verify(
                client,
                email="b@example.com",
                password="Passw0rd!",
                display_name="B",
            )

            self.assertNotEqual(account_a["user"]["id"], account_b["user"]["id"])

            client.put(
                "/me/profile",
                json={"display_name": "Account A"},
                headers=_auth_headers(account_a["access_token"]),
            )
            client.put(
                "/me/profile",
                json={"display_name": "Account B"},
                headers=_auth_headers(account_b["access_token"]),
            )

            profile_a = client.get("/me/profile", headers=_auth_headers(account_a["access_token"]))
            profile_b = client.get("/me/profile", headers=_auth_headers(account_b["access_token"]))

            self.assertEqual(profile_a.status_code, 200)
            self.assertEqual(profile_b.status_code, 200)
            self.assertEqual(profile_a.json()["profile"]["display_name"], "Account A")
            self.assertEqual(profile_b.json()["profile"]["display_name"], "Account B")

    def test_logout_revokes_tokens(self):
        with TestClient(app) as client:
            _, signup = self._signup_and_verify(
                client,
                email="logout@example.com",
                password="Passw0rd!",
                display_name="Logout",
            )

            logout_response = client.post(
                "/auth/logout",
                json={"refresh_token": signup["refresh_token"]},
                headers=_auth_headers(signup["access_token"]),
            )
            self.assertEqual(logout_response.status_code, 200)
            self.assertTrue(logout_response.json()["ok"])

            post_logout_me = client.get("/me/profile", headers=_auth_headers(signup["access_token"]))
            self.assertEqual(post_logout_me.status_code, 401)
            self.assertEqual(post_logout_me.json()["detail"]["code"], "AUTH_TOKEN_INVALID")

    def test_logout_is_idempotent_when_session_already_revoked(self):
        with TestClient(app) as client:
            _, signup = self._signup_and_verify(
                client,
                email="logout-idempotent@example.com",
                password="Passw0rd!",
                display_name="LogoutIdempotent",
            )

            first_logout = client.post(
                "/auth/logout",
                json={"refresh_token": signup["refresh_token"]},
                headers=_auth_headers(signup["access_token"]),
            )
            self.assertEqual(first_logout.status_code, 200)
            self.assertTrue(first_logout.json()["ok"])
            self.assertGreaterEqual(first_logout.json().get("revoked_sessions", 0), 1)

            second_logout = client.post(
                "/auth/logout",
                json={"refresh_token": signup["refresh_token"]},
                headers=_auth_headers(signup["access_token"]),
            )
            self.assertEqual(second_logout.status_code, 200)
            self.assertTrue(second_logout.json()["ok"])
            self.assertEqual(second_logout.json().get("revoked_sessions"), 0)
            self.assertIsNotNone(second_logout.json().get("request_id"))


if __name__ == "__main__":
    unittest.main()
