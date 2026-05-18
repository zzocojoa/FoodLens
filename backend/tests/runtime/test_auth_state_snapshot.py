import json
import unittest
from unittest.mock import patch

from backend.modules.auth.service import InMemoryAuthSessionService


_TEST_TOKEN_HASH_SECRET = "test-auth-state-token-hash-secret"


class _MemoryStateStore:
    def __init__(self) -> None:
        self.payload: dict[str, object] | None = None

    def load(self) -> dict[str, object] | None:
        return self.payload

    def save(self, payload: dict[str, object]) -> None:
        self.payload = payload


class AuthStateSnapshotTests(unittest.TestCase):
    def test_state_snapshot_restores_auth_profile_and_sessions(self):
        state_store = _MemoryStateStore()

        service_a = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        session = service_a.signup_email(
            email="snapshot@example.com",
            password="Passw0rd!",
            display_name="Snapshot User",
            locale="ko-KR",
            device_id="ios-device",
        )
        user_id = session["user"]["id"]

        service_a.update_profile(
            user_id=user_id,
            display_name="Snapshot Updated",
            locale="en-US",
            timezone_name="Asia/Seoul",
        )
        service_a.update_allergies(
            user_id=user_id,
            allergies=["peanut"],
            dietary_restrictions=["vegan"],
            severity_map={"peanut": "severe"},
        )
        service_a.append_history(
            user_id=user_id,
            entry={"id": "his-local-1", "foodName": "Kimchi"},
            idempotency_key="snapshot-history-1",
        )

        service_b = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )

        login = service_b.login_email(
            email="snapshot@example.com",
            password="Passw0rd!",
            device_id="android-device",
        )
        self.assertEqual(login["user"]["id"], user_id)

        profile = service_b.get_profile(user_id=user_id)
        self.assertEqual(profile["display_name"], "Snapshot Updated")
        self.assertEqual(profile["locale"], "en-US")
        self.assertEqual(profile["timezone"], "Asia/Seoul")

        allergies = service_b.get_allergies(user_id=user_id)
        self.assertEqual(allergies["allergies"], ["peanut"])
        self.assertEqual(allergies["dietary_restrictions"], ["vegan"])
        self.assertEqual(allergies["severity_map"]["peanut"], "severe")

        history = service_b.get_history(user_id=user_id, limit=10)
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["entry"]["foodName"], "Kimchi")

    def test_from_env_selects_postgres_backend_when_database_url_exists(self):
        with patch("backend.modules.auth.service.PostgresAuthStateStore") as mocked_store:
            mocked_store.return_value = _MemoryStateStore()
            service = InMemoryAuthSessionService.from_env(
                lambda key, default=None: {
                    "DATABASE_URL": "postgresql://foodlens:foodlens@127.0.0.1:5432/foodlens",
                    "AUTH_TOKEN_HASH_SECRET": _TEST_TOKEN_HASH_SECRET,
                }.get(key, default)
            )
            self.assertEqual(service.state_backend, "postgres")
            mocked_store.assert_called_once()

    def test_from_env_requires_token_hash_secret_for_postgres_backend(self):
        with patch("backend.modules.auth.service.PostgresAuthStateStore") as mocked_store:
            mocked_store.return_value = _MemoryStateStore()
            with self.assertRaises(ValueError) as context:
                InMemoryAuthSessionService.from_env(
                    lambda key, default=None: {
                        "DATABASE_URL": "postgresql://foodlens:foodlens@127.0.0.1:5432/foodlens",
                    }.get(key, default)
                )
            self.assertIn("AUTH_TOKEN_HASH_SECRET", str(context.exception))

    def test_state_snapshot_restores_legacy_media_asset_without_object_generation(self):
        state_store = _MemoryStateStore()
        service_a = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        session = service_a.signup_email(
            email="legacy-media@example.com",
            password="Passw0rd!",
            display_name="Legacy Media User",
            locale="ko-KR",
            device_id="ios-device",
        )
        user_id = str(session["user"]["id"])
        asset = service_a.register_media_asset(
            user_id=user_id,
            scope="history",
            mime_type="image/png",
            size_bytes=3,
            sha256="ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            object_key=f"media/{user_id}/history/asset_legacy/original.png",
            asset_id="asset_legacy",
            object_generation=42,
        )
        self.assertEqual(asset["object_generation"], 42)

        self.assertIsNotNone(state_store.payload)
        snapshot = dict(state_store.payload or {})
        payload = json.loads(str(snapshot["payload"]))
        media_assets = payload["_media_assets_by_id"]
        media_assets["asset_legacy"].pop("object_generation", None)
        snapshot["payload"] = json.dumps(payload, separators=(",", ":"))
        state_store.payload = snapshot

        service_b = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        restored = service_b.get_media_asset(asset_id="asset_legacy", user_id=user_id)
        self.assertIsNone(restored["object_generation"])


if __name__ == "__main__":
    unittest.main()
