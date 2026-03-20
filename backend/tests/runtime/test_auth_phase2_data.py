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

            put_profile = client.put(
                "/me/profile",
                json={
                    "display_name": "Phase2 Updated",
                    "profile_image_url": "https://cdn.example.com/profile/phase2.png",
                    "gender": "female",
                    "birth_year": 1995,
                    "disliked_ingredients": ["coriander", "celery"],
                    "timezone": "Asia/Seoul",
                    "current_trip_start": "2026-03-03T10:00:00Z",
                    "current_trip_location": "Seoul, KR",
                    "current_trip_coordinates": {"latitude": 37.5665, "longitude": 126.9780},
                },
                headers=headers,
            )
            self.assertEqual(put_profile.status_code, 200)
            self.assertIn("request_id", put_profile.json())
            self.assertEqual(
                put_profile.json()["profile"]["profile_image_url"],
                "https://cdn.example.com/profile/phase2.png",
            )
            self.assertEqual(put_profile.json()["profile"]["gender"], "female")
            self.assertEqual(put_profile.json()["profile"]["birth_year"], 1995)
            self.assertEqual(
                put_profile.json()["profile"]["disliked_ingredients"],
                ["coriander", "celery"],
            )
            self.assertEqual(
                put_profile.json()["profile"]["current_trip_location"],
                "Seoul, KR",
            )

            get_profile = client.get("/me/profile", headers=headers)
            self.assertEqual(get_profile.status_code, 200)
            profile_payload = get_profile.json()
            self.assertIn("request_id", profile_payload)
            self.assertEqual(profile_payload["profile"]["display_name"], "Phase2 Updated")
            self.assertEqual(
                profile_payload["profile"]["profile_image_url"],
                "https://cdn.example.com/profile/phase2.png",
            )
            self.assertEqual(profile_payload["profile"]["gender"], "female")
            self.assertEqual(profile_payload["profile"]["birth_year"], 1995)
            self.assertEqual(
                profile_payload["profile"]["disliked_ingredients"],
                ["coriander", "celery"],
            )
            self.assertEqual(
                profile_payload["profile"]["current_trip_start"],
                "2026-03-03T10:00:00Z",
            )
            self.assertEqual(
                profile_payload["profile"]["current_trip_location"],
                "Seoul, KR",
            )
            self.assertEqual(
                profile_payload["profile"]["current_trip_coordinates"],
                {"latitude": 37.5665, "longitude": 126.978},
            )

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
                    "client_state": {
                        "onboarding": {"completed_at": "2026-03-03T10:00:00Z"},
                        "home": {"selected_date": "2026-03-03"},
                        "history": {
                            "archive_mode": "map",
                            "filter": "ok",
                            "map_region": {
                                "latitude": 37.5665,
                                "longitude": 126.9780,
                                "latitudeDelta": 0.5,
                                "longitudeDelta": 0.5,
                            },
                        },
                    },
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
            self.assertEqual(
                settings_payload["settings"]["client_state"]["home"]["selected_date"],
                "2026-03-03",
            )
            self.assertEqual(
                settings_payload["settings"]["client_state"]["history"]["archive_mode"],
                "map",
            )

            history_entry = {
                "id": "local-analysis-1",
                "foodName": "Bibimbap",
                "safetyStatus": "SAFE",
                "ingredients": [],
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

            initial_history_updated_at = history_list["history"][0]["updated_at"]
            patch_history = client.patch(
                "/me/history/local-analysis-1",
                json={
                    "timestamp": "2026-02-26T00:00:00Z",
                    "expected_updated_at": initial_history_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(patch_history.status_code, 200)
            self.assertEqual(
                patch_history.json()["history_item"]["entry"]["timestamp"],
                "2026-02-26T00:00:00Z",
            )

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

    def test_history_delete_by_entry_id_is_idempotent(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase2-history-delete"))
            headers = _auth_headers(session["access_token"])

            post_history = client.post(
                "/me/history",
                json={
                    "entry": {
                        "id": "entry-delete-1",
                        "foodName": "Delete Target",
                        "timestamp": "2026-03-01T00:00:00Z",
                    },
                    "idempotency_key": "idem-history-delete-1",
                },
                headers=headers,
            )
            self.assertEqual(post_history.status_code, 200)

            first_delete = client.delete("/me/history/entry-delete-1", headers=headers)
            self.assertEqual(first_delete.status_code, 200)
            first_payload = first_delete.json()
            self.assertTrue(first_payload["deleted"])
            self.assertIn("request_id", first_payload)

            second_delete = client.delete("/me/history/entry-delete-1", headers=headers)
            self.assertEqual(second_delete.status_code, 200)
            self.assertFalse(second_delete.json()["deleted"])

            history = client.get("/me/history", headers=headers)
            self.assertEqual(history.status_code, 200)
            self.assertEqual(history.json()["history"], [])

    def test_me_update_conflict_returns_409_with_server_payload(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase3-conflict"))
            headers = _auth_headers(session["access_token"])

            profile_before = client.get("/me/profile", headers=headers).json()["profile"]
            profile_initial_updated_at = profile_before["updated_at"]
            profile_ok = client.put(
                "/me/profile",
                json={
                    "display_name": "First Name",
                    "expected_updated_at": profile_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(profile_ok.status_code, 200)
            profile_conflict = client.put(
                "/me/profile",
                json={
                    "display_name": "Stale Name",
                    "expected_updated_at": profile_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(profile_conflict.status_code, 409)
            profile_detail = profile_conflict.json()["detail"]
            self.assertEqual(profile_detail["code"], "PHASE2_CONFLICT")
            self.assertEqual(profile_detail["entity"], "profile")
            self.assertIn("server_payload", profile_detail)
            self.assertEqual(profile_detail["server_payload"]["display_name"], "First Name")

            allergies_before = client.get("/me/allergies", headers=headers).json()["allergies"]
            allergies_initial_updated_at = allergies_before["updated_at"]
            allergies_ok = client.put(
                "/me/allergies",
                json={
                    "allergies": ["soy"],
                    "expected_updated_at": allergies_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(allergies_ok.status_code, 200)
            allergies_conflict = client.put(
                "/me/allergies",
                json={
                    "allergies": ["soy", "egg"],
                    "expected_updated_at": allergies_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(allergies_conflict.status_code, 409)
            allergies_detail = allergies_conflict.json()["detail"]
            self.assertEqual(allergies_detail["code"], "PHASE2_CONFLICT")
            self.assertEqual(allergies_detail["entity"], "allergies")
            self.assertIn("server_payload", allergies_detail)
            self.assertEqual(allergies_detail["server_payload"]["allergies"], ["soy"])

            settings_before = client.get("/me/settings", headers=headers).json()["settings"]
            settings_initial_updated_at = settings_before["updated_at"]
            settings_ok = client.put(
                "/me/settings",
                json={
                    "language": "en-US",
                    "expected_updated_at": settings_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(settings_ok.status_code, 200)
            settings_conflict = client.put(
                "/me/settings",
                json={
                    "language": "ko-KR",
                    "expected_updated_at": settings_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(settings_conflict.status_code, 409)
            settings_detail = settings_conflict.json()["detail"]
            self.assertEqual(settings_detail["code"], "PHASE2_CONFLICT")
            self.assertEqual(settings_detail["entity"], "settings")
            self.assertIn("server_payload", settings_detail)
            self.assertEqual(settings_detail["server_payload"]["language"], "en-US")

            history_create = client.post(
                "/me/history",
                json={
                    "entry": {
                        "id": "history-conflict-1",
                        "foodName": "History Conflict",
                        "safetyStatus": "SAFE",
                        "ingredients": [],
                        "timestamp": "2026-03-10T00:00:00Z",
                    },
                    "idempotency_key": "idem-history-conflict-1",
                },
                headers=headers,
            )
            self.assertEqual(history_create.status_code, 200)
            history_initial_updated_at = history_create.json()["history_item"]["updated_at"]

            history_ok = client.patch(
                "/me/history/history-conflict-1",
                json={
                    "timestamp": "2026-03-11T00:00:00Z",
                    "expected_updated_at": history_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(history_ok.status_code, 200)
            history_conflict = client.patch(
                "/me/history/history-conflict-1",
                json={
                    "timestamp": "2026-03-12T00:00:00Z",
                    "expected_updated_at": history_initial_updated_at,
                },
                headers=headers,
            )
            self.assertEqual(history_conflict.status_code, 409)
            history_detail = history_conflict.json()["detail"]
            self.assertEqual(history_detail["code"], "PHASE2_CONFLICT")
            self.assertEqual(history_detail["entity"], "history")
            self.assertEqual(
                history_detail["server_payload"]["entry"]["timestamp"],
                "2026-03-11T00:00:00Z",
            )

    def test_me_endpoints_require_bearer_token(self):
        with TestClient(app) as client:
            response = client.get("/me/profile")
            self.assertEqual(response.status_code, 401)
            body = response.json()
            self.assertEqual(body["detail"]["code"], "AUTH_TOKEN_MISSING")
            self.assertIn("request_id", body["detail"])

    def test_settings_locale_variants_are_normalized(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase2-settings-locale"))
            headers = _auth_headers(session["access_token"])

            put_settings = client.put(
                "/me/settings",
                json={
                    "language": "en",
                    "target_language": "KR",
                    "auto_play_audio": False,
                },
                headers=headers,
            )
            self.assertEqual(put_settings.status_code, 200)

            get_settings = client.get("/me/settings", headers=headers)
            self.assertEqual(get_settings.status_code, 200)
            settings_payload = get_settings.json()["settings"]
            self.assertEqual(settings_payload["language"], "en-US")
            self.assertEqual(settings_payload["target_language"], "ko-KR")

    def test_settings_target_language_explicit_null_clears_manual_value(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase2-settings-clear"))
            headers = _auth_headers(session["access_token"])

            put_manual = client.put(
                "/me/settings",
                json={
                    "language": "ko-KR",
                    "target_language": "ja-JP",
                    "auto_play_audio": False,
                    "selected_emoji": "🍎",
                },
                headers=headers,
            )
            self.assertEqual(put_manual.status_code, 200)
            self.assertEqual(put_manual.json()["settings"]["target_language"], "ja-JP")

            clear_target = client.put(
                "/me/settings",
                json={
                    "target_language": None,
                },
                headers=headers,
            )
            self.assertEqual(clear_target.status_code, 200)
            cleared_payload = clear_target.json()["settings"]
            self.assertIsNone(cleared_payload["target_language"])
            self.assertEqual(cleared_payload["language"], "ko-KR")
            self.assertEqual(cleared_payload["selected_emoji"], "🍎")

            get_settings = client.get("/me/settings", headers=headers)
            self.assertEqual(get_settings.status_code, 200)
            settings_payload = get_settings.json()["settings"]
            self.assertIsNone(settings_payload["target_language"])
            self.assertEqual(settings_payload["language"], "ko-KR")


if __name__ == "__main__":
    unittest.main()
