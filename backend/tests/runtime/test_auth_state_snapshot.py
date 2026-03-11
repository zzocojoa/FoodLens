import unittest
from unittest.mock import patch

from backend.modules.auth.service import InMemoryAuthSessionService


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
                }.get(key, default)
            )
            self.assertEqual(service.state_backend, "postgres")
            mocked_store.assert_called_once()


if __name__ == "__main__":
    unittest.main()
