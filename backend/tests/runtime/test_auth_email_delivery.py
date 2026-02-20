import unittest

from backend.modules.auth import AuthServiceError, InMemoryAuthSessionService
from backend.modules.auth.email_sender import (
    EmailVerificationDeliveryError,
    LoggingEmailVerificationSender,
)


class _FailingVerificationSender:
    mode = "smtp"

    def send_verification_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        raise EmailVerificationDeliveryError("forced delivery failure")


class AuthEmailDeliveryTests(unittest.TestCase):
    def test_signup_rolls_back_user_when_delivery_fails(self) -> None:
        service = InMemoryAuthSessionService(
            email_verification_required=True,
            email_verification_debug_code_enabled=False,
            email_verification_sender=_FailingVerificationSender(),  # type: ignore[arg-type]
        )

        with self.assertRaises(AuthServiceError) as context:
            service.signup_email(
                email="delivery@example.com",
                password="Passw0rd!",
                display_name="Delivery",
                locale="ko-KR",
                device_id="ios-delivery",
            )

        self.assertEqual(context.exception.code, "AUTH_EMAIL_VERIFICATION_DELIVERY_FAILED")
        self.assertNotIn("delivery@example.com", service._user_id_by_email)
        self.assertEqual(len(service._users_by_id), 0)

        service._email_verification_sender = LoggingEmailVerificationSender()  # type: ignore[attr-defined]
        retry_result = service.signup_email(
            email="delivery@example.com",
            password="Passw0rd!",
            display_name="Delivery",
            locale="ko-KR",
            device_id="ios-delivery",
        )
        self.assertTrue(retry_result.get("verification_required"))

    def test_from_env_disables_debug_code_for_smtp_mode(self) -> None:
        env = {
            "AUTH_EMAIL_VERIFICATION_REQUIRED": "1",
            "AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED": "1",
            "AUTH_EMAIL_VERIFICATION_DELIVERY_MODE": "smtp",
            "AUTH_EMAIL_SMTP_HOST": "smtp.example.com",
            "AUTH_EMAIL_SENDER_FROM": "no-reply@example.com",
        }
        service = InMemoryAuthSessionService.from_env(env.get)
        self.assertFalse(service.email_verification_debug_code_enabled)

    def test_from_env_smtp_without_required_config_fails_signup(self) -> None:
        env = {
            "AUTH_EMAIL_VERIFICATION_REQUIRED": "1",
            "AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED": "0",
            "AUTH_EMAIL_VERIFICATION_DELIVERY_MODE": "smtp",
        }
        service = InMemoryAuthSessionService.from_env(env.get)

        with self.assertRaises(AuthServiceError) as context:
            service.signup_email(
                email="missing-smtp@example.com",
                password="Passw0rd!",
                display_name="SMTP Missing",
                locale="ko-KR",
                device_id=None,
            )
        self.assertEqual(context.exception.code, "AUTH_EMAIL_VERIFICATION_DELIVERY_FAILED")


if __name__ == "__main__":
    unittest.main()
