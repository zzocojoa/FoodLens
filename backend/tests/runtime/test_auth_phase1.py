import os
import sys
import threading
import types
import unittest
from urllib.parse import parse_qs, urlparse
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_REQUIRED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED"] = "1"
sys.modules.setdefault("sentry_sdk", types.SimpleNamespace(init=lambda **_kwargs: None))
from backend.server import app  # noqa: E402
from backend.modules.auth import AuthServiceError  # noqa: E402


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


class AuthPhase1RuntimeTests(unittest.TestCase):
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

            update_response = client.put(
                "/me/profile",
                json={"display_name": "Alpha Prime", "timezone": "Asia/Seoul"},
                headers=_auth_headers(session_body["access_token"]),
            )
            self.assertEqual(update_response.status_code, 200)
            updated_profile = update_response.json()["profile"]
            self.assertEqual(updated_profile["display_name"], "Alpha Prime")
            self.assertEqual(updated_profile["timezone"], "Asia/Seoul")

            refresh_response = client.post(
                "/auth/refresh",
                json={"refresh_token": session_body["refresh_token"]},
            )
            self.assertEqual(refresh_response.status_code, 200)
            refresh_body = refresh_response.json()
            self.assertNotEqual(refresh_body["refresh_token"], session_body["refresh_token"])

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

    def test_oauth_provider_error_mapping_and_redirect_mismatch(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_GOOGLE_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback",
                    "AUTH_KAKAO_CODE_VERIFY_ENABLED": "0",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            google_success = client.post(
                "/auth/google",
                json={
                    "code": "google-code-1",
                    "state": "state-1",
                    "redirect_uri": "foodlens://oauth/google-callback",
                    "email": "google-user@example.com",
                },
            )
            self.assertEqual(google_success.status_code, 200)
            self.assertEqual(google_success.json()["user"]["provider"], "google")

            kakao_success = client.post(
                "/auth/kakao",
                json={
                    "code": "kakao-code-1",
                    "state": "state-2",
                    "email": "kakao-user@example.com",
                },
            )
            self.assertEqual(kakao_success.status_code, 200)
            self.assertEqual(kakao_success.json()["user"]["provider"], "kakao")

            cancelled = client.post(
                "/auth/google",
                json={"error": "access_denied", "state": "abc"},
            )
            self.assertEqual(cancelled.status_code, 400)
            self.assertEqual(cancelled.json()["detail"]["code"], "AUTH_PROVIDER_CANCELLED")

            invalid_code = client.post(
                "/auth/google",
                json={"state": "abc", "redirect_uri": "foodlens://oauth/google-callback"},
            )
            self.assertEqual(invalid_code.status_code, 400)
            self.assertEqual(invalid_code.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_CODE")

            redirect_mismatch = client.post(
                "/auth/google",
                json={
                    "code": "google-auth-code",
                    "state": "state-1",
                    "redirect_uri": "foodlens://oauth/invalid",
                    "email": "google-user@example.com",
                },
            )
            self.assertEqual(redirect_mismatch.status_code, 400)
            self.assertEqual(redirect_mismatch.json()["detail"]["code"], "AUTH_REDIRECT_URI_MISMATCH")

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
            "kakao_account": {"email": "verified-kakao@example.com"},
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
            kakao_success = client.post(
                "/auth/kakao",
                json={
                    "code": "kakao-code-live",
                    "state": "state-live",
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                    "provider_user_id": "untrusted-client-subject",
                    "email": "untrusted@example.com",
                },
            )

            self.assertEqual(kakao_success.status_code, 200)
            body = kakao_success.json()
            self.assertEqual(body["user"]["provider"], "kakao")
            self.assertEqual(body["user"]["email"], "verified-kakao@example.com")
            self.assertIn("request_id", body)

            self.assertEqual(mocked_post.call_count, 1)
            token_call_kwargs = mocked_post.call_args.kwargs
            self.assertEqual(token_call_kwargs["data"]["client_id"], "kakao-client-id-test")
            self.assertEqual(token_call_kwargs["data"]["client_secret"], "kakao-client-secret-test")
            self.assertTrue(token_call_kwargs["data"]["redirect_uri"].endswith("/auth/kakao/callback"))

            self.assertEqual(mocked_get.call_count, 1)
            profile_call_kwargs = mocked_get.call_args.kwargs
            self.assertEqual(profile_call_kwargs["headers"]["Authorization"], "Bearer kakao-access-token")

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
            patch("backend.server.requests.post", return_value=mocked_token_response),
            patch("backend.server.requests.get") as mocked_get,
            TestClient(app) as client,
        ):
            kakao_invalid = client.post(
                "/auth/kakao",
                json={
                    "code": "invalid-live-code",
                    "state": "state-invalid",
                    "redirect_uri": "foodlens://oauth/kakao-callback",
                },
            )

            self.assertEqual(kakao_invalid.status_code, 400)
            self.assertEqual(kakao_invalid.json()["detail"]["code"], "AUTH_PROVIDER_INVALID_CODE")
            mocked_get.assert_not_called()

    def test_google_oauth_web_bridge_start_and_callback(self):
        with (
            patch.dict(
                os.environ,
                {
                    "AUTH_PUBLIC_BASE_URL": "https://foodlens-2-w1xu.onrender.com",
                    "AUTH_GOOGLE_CLIENT_ID": "google-client-id-test",
                    "AUTH_APP_ALLOWED_REDIRECT_URIS": "foodlens://oauth/google-callback,foodlens://oauth/kakao-callback",
                },
                clear=False,
            ),
            TestClient(app) as client,
        ):
            start = client.get(
                "/auth/google/start",
                params={"redirect_uri": "foodlens://oauth/google-callback", "state": "state-web-google"},
                follow_redirects=False,
            )
            self.assertEqual(start.status_code, 302)
            location = start.headers["location"]

            parsed = urlparse(location)
            self.assertEqual(parsed.netloc, "accounts.google.com")
            query = parse_qs(parsed.query)
            self.assertEqual(query["client_id"][0], "google-client-id-test")
            self.assertEqual(query["redirect_uri"][0], "https://foodlens-2-w1xu.onrender.com/auth/google/callback")
            packed_state = query["state"][0]

            callback = client.get(
                "/auth/google/callback",
                params={"code": "google-code-bridge", "state": packed_state},
                follow_redirects=False,
            )
            self.assertEqual(callback.status_code, 302)
            callback_location = callback.headers["location"]
            self.assertTrue(callback_location.startswith("foodlens://oauth/google-callback"))
            callback_query = parse_qs(urlparse(callback_location).query)
            self.assertEqual(callback_query["code"][0], "google-code-bridge")
            self.assertEqual(callback_query["state"][0], packed_state)
            self.assertIn("request_id", callback_query)

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
                    "AUTH_PUBLIC_BASE_URL": "https://foodlens-2-w1xu.onrender.com",
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
                    "AUTH_PUBLIC_BASE_URL": "https://foodlens-2-w1xu.onrender.com",
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
                "https://foodlens-2-w1xu.onrender.com/auth/kakao/logout/callback?app_redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete",
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


if __name__ == "__main__":
    unittest.main()
