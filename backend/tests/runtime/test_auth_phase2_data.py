import os
import sys
import types
import unittest
from uuid import uuid4

from fastapi.testclient import TestClient


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_REQUIRED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DELIVERY_MODE"] = "log"
sys.modules.setdefault("sentry_sdk", types.SimpleNamespace(init=lambda **_kwargs: None))
from backend.server import app  # noqa: E402


def _auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


class AuthPhase2DataRuntimeTests(unittest.TestCase):
    @staticmethod
    def _unique_email(prefix: str) -> str:
        return f"{prefix}-{uuid4().hex[:10]}@example.com"

    def _signup_and_verify(
        self,
        client: TestClient,
        *,
        email: str,
        password: str = "Passw0rd!",
        display_name: str = "Phase2 User",
    ) -> dict[str, object]:
        signup_response = client.post(
            "/auth/email/signup",
            json={
                "email": email,
                "password": password,
                "display_name": display_name,
                "locale": "ko-KR",
            },
        )
        self.assertEqual(signup_response.status_code, 200)
        signup_body = signup_response.json()
        self.assertTrue(signup_body.get("verification_required"))
        self.assertIn("verification_debug_code", signup_body)
        self.assertIn("request_id", signup_body)

        verify_response = client.post(
            "/auth/email/verify",
            json={
                "email": email,
                "code": signup_body["verification_debug_code"],
            },
        )
        self.assertEqual(verify_response.status_code, 200)
        verify_body = verify_response.json()
        self.assertIn("access_token", verify_body)
        self.assertIn("refresh_token", verify_body)
        self.assertIn("request_id", verify_body)
        return verify_body

    def test_me_endpoints_roundtrip_profile_allergies_settings_history(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase2-roundtrip"))
            headers = _auth_headers(session["access_token"])

            put_allergies = client.put(
                "/me/allergies",
                json={
                    "allergies": ["peanut", "soy"],
                    "dietary_restrictions": ["vegan"],
                    "severity_map": {"peanut": "severe", "soy": "mild"},
                },
                headers=headers,
            )
            self.assertEqual(put_allergies.status_code, 200)
            self.assertIn("request_id", put_allergies.json())

            get_allergies = client.get("/me/allergies", headers=headers)
            self.assertEqual(get_allergies.status_code, 200)
            allergies_payload = get_allergies.json()
            self.assertIn("request_id", allergies_payload)
            self.assertEqual(allergies_payload["allergies"]["allergies"], ["peanut", "soy"])
            self.assertEqual(allergies_payload["allergies"]["dietary_restrictions"], ["vegan"])
            self.assertEqual(allergies_payload["allergies"]["severity_map"]["peanut"], "severe")

            put_settings = client.put(
                "/me/settings",
                json={
                    "language": "en-US",
                    "target_language": "ja-JP",
                    "auto_play_audio": True,
                    "selected_emoji": "🍎",
                },
                headers=headers,
            )
            self.assertEqual(put_settings.status_code, 200)
            self.assertIn("request_id", put_settings.json())

            get_settings = client.get("/me/settings", headers=headers)
            self.assertEqual(get_settings.status_code, 200)
            settings_payload = get_settings.json()
            self.assertEqual(settings_payload["settings"]["language"], "en-US")
            self.assertEqual(settings_payload["settings"]["target_language"], "ja-JP")
            self.assertTrue(settings_payload["settings"]["auto_play_audio"])
            self.assertEqual(settings_payload["settings"]["selected_emoji"], "🍎")

            history_entry = {
                "id": "local-analysis-1",
                "foodName": "Bibimbap",
                "safetyStatus": "SAFE",
                "timestamp": "2026-02-25T00:00:00Z",
            }
            post_history = client.post(
                "/me/history",
                json={
                    "entry": history_entry,
                    "idempotency_key": "idem-history-roundtrip",
                },
                headers=headers,
            )
            self.assertEqual(post_history.status_code, 200)
            history_body = post_history.json()
            self.assertIn("request_id", history_body)
            self.assertEqual(history_body["history_item"]["entry"]["foodName"], "Bibimbap")

            get_history = client.get("/me/history?limit=10", headers=headers)
            self.assertEqual(get_history.status_code, 200)
            history_list = get_history.json()
            self.assertIn("request_id", history_list)
            self.assertEqual(len(history_list["history"]), 1)
            self.assertEqual(history_list["history"][0]["entry"]["id"], "local-analysis-1")

    def test_history_idempotency_isolated_by_user(self):
        with TestClient(app) as client:
            session_a = self._signup_and_verify(client, email=self._unique_email("phase2-a"))
            session_b = self._signup_and_verify(client, email=self._unique_email("phase2-b"))
            headers_a = _auth_headers(session_a["access_token"])
            headers_b = _auth_headers(session_b["access_token"])

            entry_a = {
                "id": "entry-a-1",
                "foodName": "A",
                "timestamp": "2026-02-25T01:00:00Z",
            }
            first = client.post(
                "/me/history",
                json={"entry": entry_a, "idempotency_key": "same-key"},
                headers=headers_a,
            )
            self.assertEqual(first.status_code, 200)
            first_history_id = first.json()["history_item"]["id"]

            replay = client.post(
                "/me/history",
                json={"entry": {"id": "entry-a-2", "foodName": "A2"}, "idempotency_key": "same-key"},
                headers=headers_a,
            )
            self.assertEqual(replay.status_code, 200)
            replay_history_id = replay.json()["history_item"]["id"]
            self.assertEqual(replay_history_id, first_history_id)

            post_b = client.post(
                "/me/history",
                json={"entry": {"id": "entry-b-1", "foodName": "B"}, "idempotency_key": "same-key"},
                headers=headers_b,
            )
            self.assertEqual(post_b.status_code, 200)

            history_a = client.get("/me/history", headers=headers_a)
            history_b = client.get("/me/history", headers=headers_b)
            self.assertEqual(history_a.status_code, 200)
            self.assertEqual(history_b.status_code, 200)
            self.assertEqual(len(history_a.json()["history"]), 1)
            self.assertEqual(len(history_b.json()["history"]), 1)
            self.assertNotEqual(history_a.json()["history"][0]["user_id"], history_b.json()["history"][0]["user_id"])

    def test_me_endpoints_require_bearer_token(self):
        with TestClient(app) as client:
            response = client.get("/me/profile")
            self.assertEqual(response.status_code, 401)
            body = response.json()
            self.assertEqual(body["detail"]["code"], "AUTH_TOKEN_MISSING")
            self.assertIn("request_id", body["detail"])


if __name__ == "__main__":
    unittest.main()
