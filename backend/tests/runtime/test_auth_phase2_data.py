import os
import sys
import types
import unittest
from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient


os.environ["OPENAPI_EXPORT_ONLY"] = "1"
os.environ["AUTH_STATE_BACKEND"] = "memory"
os.environ["AUTH_NORMALIZED_PROJECTION_ENABLED"] = "0"
os.environ["AUTH_EMAIL_VERIFICATION_REQUIRED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED"] = "1"
os.environ["AUTH_EMAIL_VERIFICATION_DELIVERY_MODE"] = "log"
os.environ.pop("DATABASE_URL", None)
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

    @staticmethod
    def _register_media_asset(
        *,
        user_id: str,
        asset_id: str,
        scope: str = "profile",
    ) -> dict[str, object]:
        return app.state.auth_service.register_media_asset(
            user_id=user_id,
            scope=scope,
            mime_type="image/jpeg",
            size_bytes=1234,
            sha256="b" * 64,
            object_key=f"media/{user_id}/{scope}/{asset_id}/original.jpg",
            asset_id=asset_id,
        )

    @staticmethod
    def _create_completed_analysis_job(
        *,
        user_id: str | None,
        idempotency_key: str | None,
        allergy_info: str,
        result_food_name: str,
    ) -> str:
        job_id = f"job_privacy_{uuid4().hex}"
        accepted_at = datetime.now(timezone.utc)
        app.state.analysis_job_store.submit_job(
            job_id=job_id,
            user_id=user_id,
            idempotency_key=idempotency_key,
            request_id=f"req_{job_id}",
            mode="food",
            allergy_info=allergy_info,
            iso_country_code="US",
            locale="en-US",
            content_type="image/jpeg",
            image_base64="cHJpdmF0ZS1pbWFnZQ==",
            image_sha256="a" * 64,
            accepted_at=accepted_at,
            poll_after_ms=1000,
        )
        app.state.analysis_job_store.update_job(
            job_id=job_id,
            updates={
                "status": "completed",
                "result_json": {
                    "foodName": result_food_name,
                    "ingredients": [{"name": "peanut", "isAllergen": True}],
                    "safetyStatus": "CAUTION",
                },
                "updated_at": accepted_at,
            },
        )
        return job_id

    @classmethod
    def _create_analysis_job_for_user(
        cls,
        *,
        user_id: str,
        allergy_info: str,
        result_food_name: str,
    ) -> str:
        return cls._create_completed_analysis_job(
            user_id=user_id,
            idempotency_key=f"idempotency_{uuid4().hex}",
            allergy_info=allergy_info,
            result_food_name=result_food_name,
        )

    @classmethod
    def _create_anonymous_analysis_job(
        cls,
        *,
        allergy_info: str,
        result_food_name: str,
    ) -> str:
        return cls._create_completed_analysis_job(
            user_id=None,
            idempotency_key=None,
            allergy_info=allergy_info,
            result_food_name=result_food_name,
        )

    @classmethod
    def _create_device_scoped_analysis_job(
        cls,
        *,
        allergy_info: str,
        result_food_name: str,
    ) -> str:
        return cls._create_completed_analysis_job(
            user_id=f"device:device_{uuid4().hex}",
            idempotency_key=f"idempotency_{uuid4().hex}",
            allergy_info=allergy_info,
            result_food_name=result_food_name,
        )

    def _assert_analysis_job_user_data_scrubbed(self, *, job_id: str) -> None:
        record = app.state.analysis_job_store.get_job(job_id=job_id)
        self.assertIsNotNone(record)
        if record is None:
            raise AssertionError(f"Analysis job not found: {job_id}")
        self.assertIsNone(record["user_id"])
        self.assertIsNone(record["idempotency_key"])
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["allergy_info"], "")
        self.assertEqual(record["image_base64"], "")
        self.assertEqual(record["image_sha256"], "")
        self.assertIsNone(record["result_json"])
        self.assertEqual(record["error_code"], "USER_DATA_DELETED")

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

    def test_local_media_references_are_sanitized_while_remote_and_asset_urls_remain(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase2-media-sanitize"))
            headers = _auth_headers(session["access_token"])
            user_id = session["user"]["id"]

            remote_profile = client.put(
                "/me/profile",
                json={
                    "profile_image_url": "https://cdn.example.com/profile/remote.png",
                },
                headers=headers,
            )
            self.assertEqual(remote_profile.status_code, 200)
            self.assertEqual(
                remote_profile.json()["profile"]["profile_image_url"],
                "https://cdn.example.com/profile/remote.png",
            )

            local_profile = client.put(
                "/me/profile",
                json={
                    "profile_image_url": "avatar.png",
                },
                headers=headers,
            )
            self.assertEqual(local_profile.status_code, 200)
            self.assertIsNone(local_profile.json()["profile"]["profile_image_url"])

            app.state.auth_service.update_profile(
                user_id=user_id,
                profile_image_url="legacy-avatar.png",
            )
            legacy_profile = client.get("/me/profile", headers=headers)
            self.assertEqual(legacy_profile.status_code, 200)
            self.assertIsNone(legacy_profile.json()["profile"]["profile_image_url"])

            self._register_media_asset(
                user_id=user_id,
                asset_id="asset_profile_1",
            )
            asset_profile = client.put(
                "/me/profile",
                json={
                    "profile_image_url": "avatar.png",
                    "profile_image_asset_id": "asset_profile_1",
                },
                headers=headers,
            )
            self.assertEqual(asset_profile.status_code, 200)
            asset_profile_body = asset_profile.json()["profile"]
            self.assertTrue(
                asset_profile_body["profile_image_render_url"].startswith(
                    "http://testserver/media/render/asset_profile_1"
                )
            )
            self.assertEqual(
                asset_profile_body["profile_image_url"],
                asset_profile_body["profile_image_render_url"],
            )

            remote_history = client.post(
                "/me/history",
                json={
                    "entry": {
                        "id": "history-remote",
                        "foodName": "Remote",
                        "imageUri": "https://cdn.example.com/history/remote.png",
                        "timestamp": "2026-03-01T00:00:00Z",
                    },
                    "idempotency_key": "idem-history-remote",
                },
                headers=headers,
            )
            self.assertEqual(remote_history.status_code, 200)
            self.assertEqual(
                remote_history.json()["history_item"]["entry"]["imageUri"],
                "https://cdn.example.com/history/remote.png",
            )

            local_history = client.post(
                "/me/history",
                json={
                    "entry": {
                        "id": "history-local",
                        "foodName": "Local",
                        "imageUri": "avatar.png",
                        "timestamp": "2026-03-02T00:00:00Z",
                    },
                    "idempotency_key": "idem-history-local",
                },
                headers=headers,
            )
            self.assertEqual(local_history.status_code, 200)
            self.assertIsNone(local_history.json()["history_item"]["entry"].get("imageUri"))

            app.state.auth_service.register_media_asset(
                user_id=user_id,
                scope="history",
                mime_type="image/jpeg",
                size_bytes=1234,
                sha256="a" * 64,
                object_key="media/usr_test/history/asset_history_1/original.jpg",
                asset_id="asset_history_1",
            )
            asset_history = client.post(
                "/me/history",
                json={
                    "entry": {
                        "id": "history-asset",
                        "foodName": "Asset",
                        "imageUri": "avatar.png",
                        "image_asset_id": "asset_history_1",
                        "timestamp": "2026-03-02T12:00:00Z",
                    },
                    "idempotency_key": "idem-history-asset",
                },
                headers=headers,
            )
            self.assertEqual(asset_history.status_code, 200)
            asset_history_entry = asset_history.json()["history_item"]["entry"]
            self.assertTrue(
                asset_history_entry["image_render_url"].startswith(
                    "http://testserver/media/render/asset_history_1"
                )
            )
            self.assertEqual(
                asset_history_entry["imageUri"],
                asset_history_entry["image_render_url"],
            )

            app.state.auth_service.append_history(
                user_id=user_id,
                entry={
                    "id": "history-legacy-local",
                    "foodName": "Legacy",
                    "imageUri": "file:///tmp/history.png",
                    "timestamp": "2026-03-03T00:00:00Z",
                },
                idempotency_key=None,
            )
            history = client.get("/me/history?limit=10", headers=headers)
            self.assertEqual(history.status_code, 200)
            history_entries = {
                item["entry"]["id"]: item["entry"]
                for item in history.json()["history"]
                if isinstance(item.get("entry"), dict) and isinstance(item["entry"].get("id"), str)
            }
            self.assertEqual(
                history_entries["history-remote"]["imageUri"],
                "https://cdn.example.com/history/remote.png",
            )
            self.assertIsNone(history_entries["history-local"].get("imageUri"))
            self.assertTrue(
                history_entries["history-asset"]["image_render_url"].startswith(
                    "http://testserver/media/render/asset_history_1"
                )
            )
            self.assertEqual(
                history_entries["history-asset"]["imageUri"],
                history_entries["history-asset"]["image_render_url"],
            )
            self.assertIsNone(history_entries["history-legacy-local"].get("imageUri"))

    def test_profile_image_asset_id_requires_media_owner(self):
        with TestClient(app) as client:
            session_a = self._signup_and_verify(client, email=self._unique_email("phase2-profile-asset-a"))
            session_b = self._signup_and_verify(client, email=self._unique_email("phase2-profile-asset-b"))
            headers_a = _auth_headers(session_a["access_token"])
            user_id_a = str(session_a["user"]["id"])
            user_id_b = str(session_b["user"]["id"])

            owned_asset = self._register_media_asset(
                user_id=user_id_a,
                asset_id="asset_profile_owned",
            )
            foreign_asset = self._register_media_asset(
                user_id=user_id_b,
                asset_id="asset_profile_foreign",
            )
            history_asset = self._register_media_asset(
                user_id=user_id_a,
                asset_id="asset_history_owned",
                scope="history",
            )

            unknown_profile = client.put(
                "/me/profile",
                json={
                    "profile_image_asset_id": "asset_profile_unknown",
                },
                headers=headers_a,
            )
            self.assertEqual(unknown_profile.status_code, 404)
            self.assertEqual(unknown_profile.json()["detail"]["code"], "AUTH_MEDIA_NOT_FOUND")
            profile_after_unknown = client.get("/me/profile", headers=headers_a)
            self.assertEqual(profile_after_unknown.status_code, 200)
            self.assertIsNone(profile_after_unknown.json()["profile"]["profile_image_asset_id"])

            foreign_profile = client.put(
                "/me/profile",
                json={
                    "profile_image_asset_id": foreign_asset["asset_id"],
                },
                headers=headers_a,
            )
            self.assertEqual(foreign_profile.status_code, 403)
            self.assertEqual(foreign_profile.json()["detail"]["code"], "AUTH_MEDIA_FORBIDDEN")
            profile_after_foreign = client.get("/me/profile", headers=headers_a)
            self.assertEqual(profile_after_foreign.status_code, 200)
            self.assertIsNone(profile_after_foreign.json()["profile"]["profile_image_asset_id"])

            history_scope_profile = client.put(
                "/me/profile",
                json={
                    "profile_image_asset_id": history_asset["asset_id"],
                },
                headers=headers_a,
            )
            self.assertEqual(history_scope_profile.status_code, 400)
            self.assertEqual(
                history_scope_profile.json()["detail"]["code"],
                "AUTH_MEDIA_SCOPE_INVALID",
            )
            profile_after_history_scope = client.get("/me/profile", headers=headers_a)
            self.assertEqual(profile_after_history_scope.status_code, 200)
            self.assertIsNone(profile_after_history_scope.json()["profile"]["profile_image_asset_id"])

            owned_profile = client.put(
                "/me/profile",
                json={
                    "profile_image_asset_id": owned_asset["asset_id"],
                },
                headers=headers_a,
            )
            self.assertEqual(owned_profile.status_code, 200)
            owned_profile_body = owned_profile.json()["profile"]
            self.assertEqual(owned_profile_body["profile_image_asset_id"], owned_asset["asset_id"])
            self.assertTrue(
                owned_profile_body["profile_image_render_url"].startswith(
                    "http://testserver/media/render/asset_profile_owned"
                )
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

    def test_latest_deletion_request_is_null_before_request(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase5-latest-empty"))
            headers = _auth_headers(session["access_token"])

            latest = client.get("/me/deletion-requests/latest", headers=headers)

            self.assertEqual(latest.status_code, 200)
            latest_body = latest.json()
            self.assertIn("request_id", latest_body)
            self.assertIsNone(latest_body["deletion_request"])

    def test_data_deletion_request_clears_user_data_and_updates_latest_status(self):
        with TestClient(app) as client:
            email = self._unique_email("phase5-data-delete")
            password = "Passw0rd!"
            session = self._signup_and_verify(client, email=email, password=password)
            headers = _auth_headers(session["access_token"])
            user_id = str(session["user"]["id"])

            put_profile = client.put(
                "/me/profile",
                json={
                    "display_name": "Delete Me",
                    "profile_image_url": "https://cdn.example.com/profile/delete.png",
                    "gender": "female",
                    "birth_year": 1994,
                    "disliked_ingredients": ["celery"],
                    "current_trip_location": "Busan, KR",
                },
                headers=headers,
            )
            self.assertEqual(put_profile.status_code, 200)

            put_allergies = client.put(
                "/me/allergies",
                json={
                    "allergies": ["soy"],
                    "dietary_restrictions": ["vegan"],
                    "severity_map": {"soy": "high"},
                },
                headers=headers,
            )
            self.assertEqual(put_allergies.status_code, 200)

            put_settings = client.put(
                "/me/settings",
                json={
                    "language": "en-US",
                    "target_language": "ja-JP",
                    "auto_play_audio": True,
                    "selected_emoji": "🍎",
                    "client_state": {"home": {"selected_date": "2026-03-03"}},
                },
                headers=headers,
            )
            self.assertEqual(put_settings.status_code, 200)

            post_history = client.post(
                "/me/history",
                json={
                    "entry": {
                        "id": "phase5-data-history",
                        "foodName": "Delete Target",
                        "timestamp": "2026-03-01T00:00:00Z",
                    },
                    "idempotency_key": "phase5-data-delete-history",
                },
                headers=headers,
            )
            self.assertEqual(post_history.status_code, 200)
            analysis_job_id = self._create_analysis_job_for_user(
                user_id=user_id,
                allergy_info="soy allergy",
                result_food_name="Private Data Meal",
            )
            deletion_request_id = "req-phase5-data-deletion-route"
            deletion_headers = {**headers, "X-Request-Id": deletion_request_id}

            deletion = client.post(
                "/me/deletion-requests",
                json={"target": "data"},
                headers=deletion_headers,
            )
            self.assertEqual(deletion.status_code, 200)
            deletion_body = deletion.json()
            self.assertEqual(deletion_body["request_id"], deletion_request_id)
            self.assertEqual(deletion_body["deletion_request"]["request_id"], deletion_request_id)
            self.assertEqual(deletion_body["deletion_request"]["target"], "data")
            self.assertEqual(deletion_body["deletion_request"]["status"], "done")
            self.assertEqual(deletion_body["deletion_request"]["retry_count"], 0)
            self.assertIsNone(deletion_body["deletion_request"]["next_attempt_at"])
            self._assert_analysis_job_user_data_scrubbed(job_id=analysis_job_id)

            latest = client.get("/me/deletion-requests/latest", headers=headers)
            self.assertEqual(latest.status_code, 401)
            self.assertEqual(latest.json()["detail"]["code"], "AUTH_TOKEN_INVALID")

            login = client.post(
                "/auth/email/login",
                json={"email": email, "password": password},
            )
            self.assertEqual(login.status_code, 200)
            latest_headers = _auth_headers(login.json()["access_token"])

            latest = client.get("/me/deletion-requests/latest", headers=latest_headers)
            self.assertEqual(latest.status_code, 200)
            latest_body = latest.json()
            self.assertEqual(latest_body["deletion_request"]["queue_id"], deletion_body["deletion_request"]["queue_id"])
            self.assertEqual(latest_body["deletion_request"]["request_id"], deletion_request_id)
            self.assertEqual(latest_body["deletion_request"]["status"], "done")

            profile = client.get("/me/profile", headers=latest_headers)
            self.assertEqual(profile.status_code, 200)
            profile_payload = profile.json()["profile"]
            self.assertIsNone(profile_payload["display_name"])
            self.assertIsNone(profile_payload["profile_image_url"])
            self.assertIsNone(profile_payload["gender"])
            self.assertIsNone(profile_payload["birth_year"])
            self.assertEqual(profile_payload["disliked_ingredients"], [])
            self.assertIsNone(profile_payload["current_trip_location"])

            allergies = client.get("/me/allergies", headers=latest_headers)
            self.assertEqual(allergies.status_code, 200)
            allergies_payload = allergies.json()["allergies"]
            self.assertEqual(allergies_payload["allergies"], [])
            self.assertEqual(allergies_payload["dietary_restrictions"], [])
            self.assertEqual(allergies_payload["severity_map"], {})

            settings = client.get("/me/settings", headers=latest_headers)
            self.assertEqual(settings.status_code, 200)
            settings_payload = settings.json()["settings"]
            self.assertEqual(settings_payload["language"], "auto")
            self.assertIsNone(settings_payload["target_language"])
            self.assertFalse(settings_payload["auto_play_audio"])
            self.assertIsNone(settings_payload["selected_emoji"])
            self.assertEqual(settings_payload["client_state"], {})

            history = client.get("/me/history", headers=latest_headers)
            self.assertEqual(history.status_code, 200)
            self.assertEqual(history.json()["history"], [])

    def test_account_deletion_request_blocks_followup_reads(self):
        with TestClient(app) as client:
            session = self._signup_and_verify(client, email=self._unique_email("phase5-account-delete"))
            headers = _auth_headers(session["access_token"])
            user_id = str(session["user"]["id"])
            analysis_job_id = self._create_analysis_job_for_user(
                user_id=user_id,
                allergy_info="shellfish allergy",
                result_food_name="Private Account Meal",
            )
            deletion_request_id = "req-phase5-account-deletion-route"
            deletion_headers = {**headers, "X-Request-Id": deletion_request_id}

            deletion = client.post(
                "/me/deletion-requests",
                json={"target": "account"},
                headers=deletion_headers,
            )
            self.assertEqual(deletion.status_code, 200)
            deletion_body = deletion.json()
            self.assertEqual(deletion_body["request_id"], deletion_request_id)
            self.assertEqual(deletion_body["deletion_request"]["request_id"], deletion_request_id)
            self.assertEqual(deletion_body["deletion_request"]["target"], "account")
            self.assertEqual(deletion_body["deletion_request"]["status"], "done")
            self._assert_analysis_job_user_data_scrubbed(job_id=analysis_job_id)

            profile = client.get("/me/profile", headers=headers)
            self.assertEqual(profile.status_code, 401)
            self.assertEqual(profile.json()["detail"]["code"], "AUTH_TOKEN_INVALID")

    def test_analysis_job_status_requires_owner_for_user_jobs_and_preserves_anonymous_jobs(self):
        with TestClient(app) as client:
            session_a = self._signup_and_verify(client, email=self._unique_email("phase5-job-owner-a"))
            session_b = self._signup_and_verify(client, email=self._unique_email("phase5-job-owner-b"))
            headers_a = _auth_headers(session_a["access_token"])
            headers_b = _auth_headers(session_b["access_token"])
            user_job_id = self._create_analysis_job_for_user(
                user_id=str(session_a["user"]["id"]),
                allergy_info="peanut allergy",
                result_food_name="Owner Meal",
            )
            anonymous_job_id = self._create_anonymous_analysis_job(
                allergy_info="anonymous allergy",
                result_food_name="Legacy Anonymous Meal",
            )
            device_scoped_job_id = self._create_device_scoped_analysis_job(
                allergy_info="anonymous device allergy",
                result_food_name="Legacy Device Meal",
            )

            missing_owner = client.get(f"/analyze/jobs/{user_job_id}")
            self.assertEqual(missing_owner.status_code, 401)
            self.assertEqual(missing_owner.json()["detail"]["code"], "AUTH_TOKEN_MISSING")

            foreign_owner = client.get(f"/analyze/jobs/{user_job_id}", headers=headers_b)
            self.assertEqual(foreign_owner.status_code, 403)
            self.assertEqual(foreign_owner.json()["detail"]["code"], "ANALYSIS_JOB_FORBIDDEN")

            owner = client.get(f"/analyze/jobs/{user_job_id}", headers=headers_a)
            self.assertEqual(owner.status_code, 200)
            self.assertEqual(owner.json()["foodName"], "Owner Meal")

            anonymous = client.get(f"/analyze/jobs/{anonymous_job_id}")
            self.assertEqual(anonymous.status_code, 200)
            self.assertEqual(anonymous.json()["foodName"], "Legacy Anonymous Meal")

            device_scoped = client.get(f"/analyze/jobs/{device_scoped_job_id}")
            self.assertEqual(device_scoped.status_code, 200)
            self.assertEqual(device_scoped.json()["foodName"], "Legacy Device Meal")

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
