import threading
import unittest

from backend.modules.auth import AuthServiceError, InMemoryAuthSessionService


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


if __name__ == '__main__':
    unittest.main()
