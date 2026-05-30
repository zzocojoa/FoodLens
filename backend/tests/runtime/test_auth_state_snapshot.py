import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from backend.modules.auth.service import AuthServiceError, InMemoryAuthSessionService
from backend.modules.auth.state_store import PostgresAuthStateStore


_TEST_TOKEN_HASH_SECRET = "test-auth-state-token-hash-secret"


class _MemoryStateStore:
    def __init__(self) -> None:
        self.payload: dict[str, object] | None = None

    def load(self) -> dict[str, object] | None:
        return self.payload

    def save(self, payload: dict[str, object]) -> None:
        self.payload = payload


class _FakePostgresCursor:
    def __init__(
        self,
        executed: list[tuple[str, tuple[object, ...]]],
        rowcounts: list[int],
        fetchone_results: list[tuple[object, ...] | None],
    ) -> None:
        self._executed = executed
        self._rowcounts = rowcounts
        self._fetchone_results = fetchone_results
        self.rowcount = 0

    def __enter__(self) -> "_FakePostgresCursor":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None

    def execute(self, query: str, params: tuple[object, ...] = ()) -> None:
        self._executed.append((query, params))
        normalized_query = query.strip().upper()
        if normalized_query.startswith("INSERT") or normalized_query.startswith("UPDATE"):
            if not self._rowcounts:
                raise AssertionError("Fake postgres cursor rowcount queue is empty.")
            self.rowcount = self._rowcounts.pop(0)
            return
        self.rowcount = 0

    def fetchone(self) -> tuple[object, ...] | None:
        if not self._fetchone_results:
            raise AssertionError("Fake postgres cursor fetchone queue is empty.")
        return self._fetchone_results.pop(0)


class _FakePostgresConnection:
    def __init__(
        self,
        *,
        rowcounts: list[int],
        fetchone_results: list[tuple[object, ...] | None],
    ) -> None:
        self.executed: list[tuple[str, tuple[object, ...]]] = []
        self._rowcounts = rowcounts
        self._fetchone_results = fetchone_results
        self.database_url: str | None = None
        self.autocommit: bool | None = None

    def connect(self, database_url: str, *, autocommit: bool) -> "_FakePostgresConnection":
        self.database_url = database_url
        self.autocommit = autocommit
        return self

    def __enter__(self) -> "_FakePostgresConnection":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None

    def cursor(self) -> _FakePostgresCursor:
        return _FakePostgresCursor(
            executed=self.executed,
            rowcounts=self._rowcounts,
            fetchone_results=self._fetchone_results,
        )


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

    def test_state_snapshot_restores_oauth_pending_state(self):
        state_store = _MemoryStateStore()
        state = "snapshot-oauth-state-000000000000000000000000"
        code_verifier = "snapshot-code-verifier-0000000000000000000"
        code_challenge = "snapshot-code-challenge-000000000000000000"

        service_a = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        service_a.create_oauth_pending_state(
            provider="google",
            app_redirect_uri="foodlens://oauth/google-callback",
            state=state,
            request_id="req-oauth-snapshot",
            nonce="snapshot-oauth-nonce-0000000000000000000000",
            code_verifier=code_verifier,
            code_challenge=code_challenge,
            app_proof_challenge="snapshot-app-proof-challenge-0000000000000",
            app_proof_method="S256",
            ttl_seconds=600,
        )

        persisted_snapshot = state_store.payload
        if persisted_snapshot is None:
            raise AssertionError("OAuth pending state was not persisted.")
        snapshot_payload = json.loads(str(persisted_snapshot["payload"]))
        stored_pending_states = snapshot_payload["_oauth_pending_states"]
        self.assertEqual(
            stored_pending_states[state]["__fl_dataclass__"],
            "OAuthPendingStateRecord",
        )

        service_b = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        restored = service_b.verify_oauth_pending_state(
            provider="google",
            state=state,
            app_redirect_uri="foodlens://oauth/google-callback",
        )
        self.assertEqual(restored["provider"], "google")
        self.assertEqual(restored["app_redirect_uri"], "foodlens://oauth/google-callback")
        self.assertEqual(restored["request_id"], "req-oauth-snapshot")
        self.assertEqual(restored["nonce"], "snapshot-oauth-nonce-0000000000000000000000")
        self.assertEqual(restored["code_verifier"], code_verifier)
        self.assertEqual(restored["code_challenge"], code_challenge)
        self.assertEqual(restored["app_proof_challenge"], "snapshot-app-proof-challenge-0000000000000")
        self.assertEqual(restored["app_proof_method"], "S256")

        consumed = service_b.consume_oauth_pending_state(
            provider="google",
            state=state,
            app_redirect_uri="foodlens://oauth/google-callback",
        )
        self.assertIsNotNone(consumed["consumed_at"])

        service_c = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        with self.assertRaises(AuthServiceError) as context:
            service_c.verify_oauth_pending_state(
                provider="google",
                state=state,
                app_redirect_uri="foodlens://oauth/google-callback",
            )
        self.assertEqual(context.exception.code, "AUTH_PROVIDER_STATE_REUSED")

    def test_snapshot_store_stale_instances_can_double_consume_oauth_state(self):
        state_store = _MemoryStateStore()
        state = "snapshot-oauth-state-race-000000000000000000"

        service_seed = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        service_seed.create_oauth_pending_state(
            provider="google",
            app_redirect_uri="foodlens://oauth/google-callback",
            state=state,
            request_id="req-oauth-race",
            nonce="snapshot-oauth-nonce-race-00000000000000000000",
            code_verifier="snapshot-code-verifier-race-0000000000000000",
            code_challenge="snapshot-code-challenge-race-000000000000",
            app_proof_challenge=None,
            app_proof_method=None,
            ttl_seconds=600,
        )

        service_a = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )
        service_b = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret=_TEST_TOKEN_HASH_SECRET,
        )

        first_consume = service_a.consume_oauth_pending_state(
            provider="google",
            state=state,
            app_redirect_uri="foodlens://oauth/google-callback",
        )
        second_consume = service_b.consume_oauth_pending_state(
            provider="google",
            state=state,
            app_redirect_uri="foodlens://oauth/google-callback",
        )

        self.assertIsNotNone(first_consume["consumed_at"])
        self.assertIsNotNone(second_consume["consumed_at"])

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

    def test_postgres_oauth_pending_state_create_uses_dedicated_conflict_guard(self):
        fake_connection = _FakePostgresConnection(rowcounts=[1], fetchone_results=[("state-create",)])
        created_at = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
        expires_at = created_at + timedelta(minutes=10)

        store = PostgresAuthStateStore(database_url="postgresql://unit-test/foodlens")
        with patch.object(PostgresAuthStateStore, "_load_connect", return_value=fake_connection.connect):
            inserted = store.create_oauth_pending_state(
                state="state-create-00000000000000000000000000000000",
                provider="google",
                app_redirect_uri="foodlens://oauth/google-callback",
                request_id="req-create",
                created_at=created_at,
                expires_at=expires_at,
                nonce="nonce-create",
                code_verifier="verifier-create",
                code_challenge="challenge-create",
                app_proof_challenge="app-proof-challenge-create",
                app_proof_method="S256",
            )

        self.assertTrue(inserted)
        self.assertTrue(fake_connection.autocommit)
        insert_query = _first_sql_containing(
            fake_connection.executed,
            "INSERT INTO auth_runtime_state_oauth_pending_states",
        )
        self.assertIn("ON CONFLICT (state) DO NOTHING", insert_query)
        self.assertIn("RETURNING state", insert_query)

    def test_postgres_oauth_pending_state_create_returns_false_when_state_exists(self):
        fake_connection = _FakePostgresConnection(rowcounts=[0], fetchone_results=[None])
        created_at = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
        expires_at = created_at + timedelta(minutes=10)

        store = PostgresAuthStateStore(database_url="postgresql://unit-test/foodlens")
        with patch.object(PostgresAuthStateStore, "_load_connect", return_value=fake_connection.connect):
            inserted = store.create_oauth_pending_state(
                state="state-duplicate-0000000000000000000000000000",
                provider="google",
                app_redirect_uri="foodlens://oauth/google-callback",
                request_id="req-duplicate",
                created_at=created_at,
                expires_at=expires_at,
                nonce=None,
                code_verifier=None,
                code_challenge=None,
                app_proof_challenge=None,
                app_proof_method=None,
            )

        self.assertFalse(inserted)

    def test_postgres_oauth_pending_state_get_loads_record_without_consuming(self):
        now = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
        expires_at = now + timedelta(minutes=10)
        row = (
            "state-get-000000000000000000000000000000000",
            "google",
            "foodlens://oauth/google-callback",
            "req-get",
            now,
            expires_at,
            None,
            "nonce-get",
            "verifier-get",
            "challenge-get",
            "app-proof-challenge-get",
            "S256",
        )
        fake_connection = _FakePostgresConnection(rowcounts=[], fetchone_results=[row])

        store = PostgresAuthStateStore(database_url="postgresql://unit-test/foodlens")
        with patch.object(PostgresAuthStateStore, "_load_connect", return_value=fake_connection.connect):
            loaded = store.get_oauth_pending_state(
                state="state-get-000000000000000000000000000000000",
            )

        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["request_id"], "req-get")
        select_query = _first_sql_containing(
            fake_connection.executed,
            "FROM auth_runtime_state_oauth_pending_states",
        )
        self.assertIn("WHERE state = %s", select_query)
        self.assertNotIn("UPDATE", select_query)

    def test_postgres_oauth_pending_state_consume_uses_conditional_update(self):
        consumed_at = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
        expires_at = consumed_at + timedelta(minutes=10)
        row = (
            "state-consume-000000000000000000000000000000",
            "google",
            "foodlens://oauth/google-callback",
            "req-consume",
            consumed_at - timedelta(minutes=1),
            expires_at,
            consumed_at,
            "nonce-consume",
            "verifier-consume",
            "challenge-consume",
            "app-proof-challenge-consume",
            "S256",
        )
        fake_connection = _FakePostgresConnection(rowcounts=[1], fetchone_results=[row])

        store = PostgresAuthStateStore(database_url="postgresql://unit-test/foodlens")
        with patch.object(PostgresAuthStateStore, "_load_connect", return_value=fake_connection.connect):
            consumed = store.consume_oauth_pending_state(
                state="state-consume-000000000000000000000000000000",
                provider="google",
                app_redirect_uri="foodlens://oauth/google-callback",
                now=consumed_at,
            )

        self.assertIsNotNone(consumed)
        self.assertEqual(consumed["consumed_at"], consumed_at)
        update_query = _first_sql_containing(
            fake_connection.executed,
            "UPDATE auth_runtime_state_oauth_pending_states",
        )
        self.assertIn("SET consumed_at = %s", update_query)
        self.assertIn("AND provider = %s", update_query)
        self.assertIn("AND app_redirect_uri = %s", update_query)
        self.assertIn("AND consumed_at IS NULL", update_query)
        self.assertIn("AND expires_at > %s", update_query)
        self.assertIn("RETURNING state, provider", update_query)

    def test_postgres_oauth_pending_state_consume_returns_none_after_reuse_or_expiry(self):
        consumed_at = datetime(2026, 5, 25, 12, 0, tzinfo=timezone.utc)
        fake_connection = _FakePostgresConnection(rowcounts=[0], fetchone_results=[None])

        store = PostgresAuthStateStore(database_url="postgresql://unit-test/foodlens")
        with patch.object(PostgresAuthStateStore, "_load_connect", return_value=fake_connection.connect):
            consumed = store.consume_oauth_pending_state(
                state="state-reused-0000000000000000000000000000000",
                provider="google",
                app_redirect_uri="foodlens://oauth/google-callback",
                now=consumed_at,
            )

        self.assertIsNone(consumed)


def _first_sql_containing(executed: list[tuple[str, tuple[object, ...]]], needle: str) -> str:
    for query, _params in executed:
        if needle in query:
            return query
    raise AssertionError(f"SQL containing {needle} was not executed.")


if __name__ == "__main__":
    unittest.main()
