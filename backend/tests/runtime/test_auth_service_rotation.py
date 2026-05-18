import json
import threading
import unittest
from datetime import timedelta

from backend.modules.auth import AuthServiceError, InMemoryAuthSessionService
from backend.modules.auth.service import AccessTokenRecord, RefreshTokenRecord, _to_iso8601, _utc_now


class MemoryAuthStateStore:
    def __init__(self, payload: dict[str, object] | None):
        self.payload = payload

    def load(self) -> dict[str, object] | None:
        return self.payload

    def save(self, payload: dict[str, object]) -> None:
        self.payload = payload


class AuthServiceRotationTests(unittest.TestCase):
    def setUp(self):
        self.service = InMemoryAuthSessionService(email_verification_required=False)

    def test_refresh_reuse_revokes_family(self):
        bundle = self.service.signup_email(
            email='user@example.com',
            password='Passw0rd!',
            display_name='User',
            locale='ko-KR',
            device_id='ios-user',
        )

        rotated = self.service.refresh(refresh_token=bundle['refresh_token'])

        with self.assertRaises(AuthServiceError) as reused:
            self.service.refresh(refresh_token=bundle['refresh_token'])
        self.assertEqual(reused.exception.code, 'AUTH_REFRESH_REUSED')

        with self.assertRaises(AuthServiceError) as revoked:
            self.service.refresh(refresh_token=rotated['refresh_token'])
        self.assertEqual(revoked.exception.code, 'AUTH_SESSION_REVOKED')

    def test_refresh_race_reuse_detection(self):
        bundle = self.service.signup_email(
            email='race@example.com',
            password='Passw0rd!',
            display_name='Race',
            locale='ko-KR',
            device_id='ios-race',
        )

        barrier = threading.Barrier(2)
        results: list[tuple[str, str | None]] = []
        lock = threading.Lock()

        def _refresh_once():
            barrier.wait()
            try:
                rotated = self.service.refresh(refresh_token=bundle['refresh_token'])
                with lock:
                    results.append(('ok', rotated['refresh_token']))
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
        self.assertEqual(statuses, ['AUTH_REFRESH_REUSED', 'ok'])

    def test_authenticate_denies_revoked_access_after_logout(self):
        bundle = self.service.signup_email(
            email='logout@example.com',
            password='Passw0rd!',
            display_name='Logout',
            locale='ko-KR',
            device_id='ios-logout',
        )

        revoked = self.service.logout(
            access_token=bundle['access_token'],
            refresh_token=bundle['refresh_token'],
        )
        self.assertEqual(revoked, 1)

        with self.assertRaises(AuthServiceError) as error:
            self.service.authenticate_access_token(access_token=bundle['access_token'])
        self.assertEqual(error.exception.code, 'AUTH_TOKEN_INVALID')

    def test_refresh_reuse_grace_window_allows_single_recovery(self):
        service = InMemoryAuthSessionService(
            email_verification_required=False,
            refresh_reuse_grace_seconds=3,
        )
        bundle = service.signup_email(
            email='grace@example.com',
            password='Passw0rd!',
            display_name='Grace',
            locale='ko-KR',
            device_id='ios-grace',
        )

        first = service.refresh(refresh_token=bundle['refresh_token'])
        second = service.refresh(refresh_token=bundle['refresh_token'])

        self.assertEqual(second['refresh_token'], first['refresh_token'])
        self.assertEqual(second['access_token'], first['access_token'])

        with self.assertRaises(AuthServiceError) as reused_again:
            service.refresh(refresh_token=bundle['refresh_token'])
        self.assertEqual(reused_again.exception.code, 'AUTH_REFRESH_REUSED')

        with self.assertRaises(AuthServiceError) as family_revoked:
            service.refresh(refresh_token=first['refresh_token'])
        self.assertEqual(family_revoked.exception.code, 'AUTH_SESSION_REVOKED')

    def test_refresh_does_not_cache_raw_grace_bundle_when_grace_disabled(self):
        bundle = self.service.signup_email(
            email='no-grace-cache@example.com',
            password='Passw0rd!',
            display_name='No Grace Cache',
            locale='ko-KR',
            device_id='ios-no-grace-cache',
        )

        self.service.refresh(refresh_token=bundle['refresh_token'])

        self.assertEqual(self.service._refresh_grace_bundles_by_digest, {})

    def test_refresh_grace_bundle_is_purged_after_window(self):
        service = InMemoryAuthSessionService(
            email_verification_required=False,
            refresh_reuse_grace_seconds=1,
        )
        bundle = service.signup_email(
            email='expired-grace-cache@example.com',
            password='Passw0rd!',
            display_name='Expired Grace Cache',
            locale='ko-KR',
            device_id='ios-expired-grace-cache',
        )

        service.refresh(refresh_token=bundle['refresh_token'])
        refresh_token_digest = service._refresh_token_digest(str(bundle['refresh_token']))
        record = service._refresh_tokens[refresh_token_digest]
        record.used_at = _utc_now() - timedelta(seconds=5)

        with self.assertRaises(AuthServiceError) as reused:
            service.refresh(refresh_token=bundle['refresh_token'])

        self.assertEqual(reused.exception.code, 'AUTH_REFRESH_REUSED')
        self.assertNotIn(refresh_token_digest, service._refresh_grace_bundles_by_digest)

    def test_refresh_grace_restore_does_not_revoke_replacement_session(self):
        state_store = MemoryAuthStateStore(None)
        service = InMemoryAuthSessionService(
            email_verification_required=False,
            refresh_reuse_grace_seconds=3,
            state_store=state_store,
            token_hash_secret='test-token-hash-secret',
        )
        bundle = service.signup_email(
            email='grace-restore@example.com',
            password='Passw0rd!',
            display_name='Grace Restore',
            locale='ko-KR',
            device_id='ios-grace-restore',
        )

        first = service.refresh(refresh_token=bundle['refresh_token'])
        restored = InMemoryAuthSessionService(
            email_verification_required=False,
            refresh_reuse_grace_seconds=3,
            state_store=state_store,
            token_hash_secret='test-token-hash-secret',
        )

        with self.assertRaises(AuthServiceError) as retry_unavailable:
            restored.refresh(refresh_token=bundle['refresh_token'])
        self.assertEqual(retry_unavailable.exception.code, 'AUTH_REFRESH_REUSED')

        rotated_again = restored.refresh(refresh_token=first['refresh_token'])
        self.assertNotEqual(rotated_again['refresh_token'], first['refresh_token'])

    def test_runtime_snapshot_does_not_persist_raw_tokens(self):
        bundle = self.service.signup_email(
            email='snapshot-token-user@example.com',
            password='Passw0rd!',
            display_name='Snapshot Token User',
            locale='ko-KR',
            device_id='ios-token-snapshot',
        )

        snapshot = self.service._build_runtime_snapshot()
        serialized = str(snapshot)

        self.assertNotIn(bundle['access_token'], serialized)
        self.assertNotIn(bundle['refresh_token'], serialized)
        self.assertNotIn('atk_', serialized)
        self.assertNotIn('rtk_', serialized)

        self.service.authenticate_access_token(access_token=bundle['access_token'])
        rotated = self.service.refresh(refresh_token=bundle['refresh_token'])
        rotated_snapshot = str(self.service._build_runtime_snapshot())
        self.assertNotIn(rotated['access_token'], rotated_snapshot)
        self.assertNotIn(rotated['refresh_token'], rotated_snapshot)

    def test_legacy_plaintext_snapshot_is_scrubbed_and_remains_usable(self):
        bundle = self.service.signup_email(
            email='legacy-token-user@example.com',
            password='Passw0rd!',
            display_name='Legacy Token User',
            locale='ko-KR',
            device_id='ios-legacy-token',
        )
        session = next(iter(self.service._sessions.values()))
        user_id = str(bundle['user']['id'])
        access_token = str(bundle['access_token'])
        refresh_token = str(bundle['refresh_token'])
        now = _utc_now()

        legacy_payload = {
            '_users_by_id': self.service._users_by_id,
            '_user_id_by_email': self.service._user_id_by_email,
            '_provider_subject_to_user_id': self.service._provider_subject_to_user_id,
            '_profiles_by_user_id': self.service._profiles_by_user_id,
            '_allergies_by_user_id': self.service._allergies_by_user_id,
            '_settings_by_user_id': self.service._settings_by_user_id,
            '_history_by_user_id': self.service._history_by_user_id,
            '_history_idempotency_by_user_id': self.service._history_idempotency_by_user_id,
            '_media_assets_by_id': self.service._media_assets_by_id,
            '_sessions': self.service._sessions,
            '_session_ids_by_family': self.service._session_ids_by_family,
            '_access_tokens': {
                access_token: AccessTokenRecord(
                    token=access_token,
                    user_id=user_id,
                    session_id=session.session_id,
                    expires_at=now + timedelta(seconds=self.service.access_ttl_seconds),
                )
            },
            '_refresh_tokens': {
                refresh_token: RefreshTokenRecord(
                    token=refresh_token,
                    user_id=user_id,
                    session_id=session.session_id,
                    family_id=session.family_id,
                    expires_at=now + timedelta(seconds=self.service.refresh_ttl_seconds),
                )
            },
            '_access_tokens_by_session': {session.session_id: {access_token}},
            '_refresh_tokens_by_session': {session.session_id: {refresh_token}},
            '_email_verifications_by_user_id': self.service._email_verifications_by_user_id,
            '_password_resets_by_user_id': self.service._password_resets_by_user_id,
        }
        legacy_snapshot = {
            'version': 1,
            'saved_at': _to_iso8601(now),
            'payload': json.dumps(
                legacy_payload,
                default=self.service._snapshot_json_default,
                ensure_ascii=False,
                separators=(',', ':'),
            ),
        }
        state_store = MemoryAuthStateStore(legacy_snapshot)

        restored = InMemoryAuthSessionService(
            email_verification_required=False,
            state_store=state_store,
            token_hash_secret='test-token-hash-secret',
        )

        restored.authenticate_access_token(access_token=access_token)
        rotated = restored.refresh(refresh_token=refresh_token)
        self.assertNotEqual(rotated['refresh_token'], refresh_token)

        saved_snapshot = str(state_store.payload)
        self.assertNotIn(access_token, saved_snapshot)
        self.assertNotIn(refresh_token, saved_snapshot)
        self.assertNotIn('atk_', saved_snapshot)
        self.assertNotIn('rtk_', saved_snapshot)

    def test_signup_locale_uses_accept_language_and_en_us_fallback(self):
        from_accept_language = self.service.signup_email(
            email='accept-language-user@example.com',
            password='Passw0rd!',
            display_name='Accept Language User',
            locale=None,
            accept_language='ja-JP,ja;q=0.9,en-US;q=0.8',
            device_id='ios-locale-header',
        )
        self.assertEqual(from_accept_language['user']['locale'], 'ja-JP')

        with_fallback = self.service.signup_email(
            email='fallback-user@example.com',
            password='Passw0rd!',
            display_name='Fallback User',
            locale=None,
            accept_language=None,
            device_id='ios-locale-fallback',
        )
        self.assertEqual(with_fallback['user']['locale'], 'en-US')


if __name__ == '__main__':
    unittest.main()
