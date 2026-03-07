import os
import unittest
from unittest.mock import patch

from backend.modules.auth.service import InMemoryAuthSessionService
from backend.modules.auth.state_store import PostgresAuthProjectionStore


class _DummyProjectionStore:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def save_projection(self, payload: dict[str, object]) -> None:
        self.calls.append(payload)


class AuthProjectionTests(unittest.TestCase):
    def test_from_env_creates_projection_store_when_enabled(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_STATE_BACKEND": "memory",
                "DATABASE_URL": "postgresql://foodlens:foodlens@127.0.0.1:5432/foodlens",
                "AUTH_NORMALIZED_PROJECTION_ENABLED": "1",
            },
            clear=True,
        ):
            service = InMemoryAuthSessionService.from_env()

        self.assertIsInstance(service._projection_store, PostgresAuthProjectionStore)

    def test_from_env_keeps_projection_disabled_by_default(self):
        with patch.dict(
            os.environ,
            {
                "AUTH_STATE_BACKEND": "memory",
                "DATABASE_URL": "postgresql://foodlens:foodlens@127.0.0.1:5432/foodlens",
            },
            clear=True,
        ):
            service = InMemoryAuthSessionService.from_env()

        self.assertIsNone(service._projection_store)

    def test_projection_save_runs_on_profile_mutation(self):
        projection = _DummyProjectionStore()
        service = InMemoryAuthSessionService(
            email_verification_required=False,
            projection_store=projection,
        )

        signup = service.signup_email(
            email="projection-user@example.com",
            password="ProjectionPass!123",
            display_name="Projection User",
            locale="en-US",
            device_id="ios-projection",
        )
        user_id = str(signup["user"]["id"])
        service.update_profile(
            user_id=user_id,
            display_name="Projection Updated",
        )

        self.assertGreaterEqual(len(projection.calls), 2)
        latest = projection.calls[-1]
        users = latest.get("users")
        profiles = latest.get("profiles")
        self.assertIsInstance(users, list)
        self.assertIsInstance(profiles, list)
        self.assertTrue(any(isinstance(item, dict) and item.get("user_id") == user_id for item in users))
        self.assertTrue(any(isinstance(item, dict) and item.get("user_id") == user_id for item in profiles))


if __name__ == "__main__":
    unittest.main()
