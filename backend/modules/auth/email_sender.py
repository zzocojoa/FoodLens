from __future__ import annotations

import logging
import os
import smtplib
import ssl
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Callable, Literal

logger = logging.getLogger("foodlens.auth.email")

EmailDeliveryMode = Literal["disabled", "log", "smtp"]

DEFAULT_EMAIL_TIMEOUT_SECONDS = 15.0
MAX_EMAIL_SEND_ATTEMPTS = 3


class EmailVerificationDeliveryError(Exception):
    pass


class EmailVerificationSender:
    mode: EmailDeliveryMode = "disabled"

    def send_verification_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        raise NotImplementedError

    def send_password_reset_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        self.send_verification_code(
            email=email,
            code=code,
            expires_in_seconds=expires_in_seconds,
            user_id=user_id,
        )


@dataclass(slots=True)
class DisabledEmailVerificationSender(EmailVerificationSender):
    reason: str = "Email verification delivery is disabled."
    mode: EmailDeliveryMode = "disabled"

    def send_verification_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        raise EmailVerificationDeliveryError(self.reason)


@dataclass(slots=True)
class LoggingEmailVerificationSender(EmailVerificationSender):
    include_code_in_logs: bool = False
    mode: EmailDeliveryMode = "log"

    def send_verification_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        masked_email = _mask_email(email)
        if self.include_code_in_logs:
            logger.info(
                "[AuthEmail] verification code prepared mode=%s user_id=%s email=%s expires_in=%s code=%s",
                self.mode,
                user_id,
                masked_email,
                expires_in_seconds,
                code,
            )
            return
        logger.info(
            "[AuthEmail] verification delivery bypassed mode=%s user_id=%s email=%s expires_in=%s",
            self.mode,
            user_id,
            masked_email,
            expires_in_seconds,
        )

    def send_password_reset_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        masked_email = _mask_email(email)
        if self.include_code_in_logs:
            logger.info(
                "[AuthEmail] password reset code prepared mode=%s user_id=%s email=%s expires_in=%s code=%s",
                self.mode,
                user_id,
                masked_email,
                expires_in_seconds,
                code,
            )
            return
        logger.info(
            "[AuthEmail] password reset delivery bypassed mode=%s user_id=%s email=%s expires_in=%s",
            self.mode,
            user_id,
            masked_email,
            expires_in_seconds,
        )


@dataclass(slots=True)
class SmtpEmailVerificationSender(EmailVerificationSender):
    host: str
    port: int
    from_email: str
    username: str | None = None
    password: str | None = None
    from_name: str = "FoodLens"
    timeout_seconds: float = DEFAULT_EMAIL_TIMEOUT_SECONDS
    max_attempts: int = MAX_EMAIL_SEND_ATTEMPTS
    use_starttls: bool = True
    use_ssl: bool = False
    subject: str = "FoodLens verification code"
    password_reset_subject: str = "FoodLens password reset code"
    mode: EmailDeliveryMode = "smtp"

    def send_verification_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        message = self._build_message(
            email=email,
            code=code,
            expires_in_seconds=expires_in_seconds,
            subject=self.subject,
            purpose_line="Your FoodLens verification code is:",
            fallback_line="If you did not request this code, you can ignore this email.",
        )
        self._deliver_message(message=message, user_id=user_id, email=email, event_name="verification email")

    def send_password_reset_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        message = self._build_message(
            email=email,
            code=code,
            expires_in_seconds=expires_in_seconds,
            subject=self.password_reset_subject,
            purpose_line="Your FoodLens password reset code is:",
            fallback_line="If you did not request this reset, you can ignore this email.",
        )
        self._deliver_message(message=message, user_id=user_id, email=email, event_name="password reset email")

    def _deliver_message(
        self,
        *,
        message: EmailMessage,
        user_id: str,
        email: str,
        event_name: str,
    ) -> None:
        last_error: Exception | None = None

        max_attempts = max(1, int(self.max_attempts))
        for attempt in range(1, max_attempts + 1):
            try:
                self._send_message_with_timeout(message)
                logger.info(
                    "[AuthEmail] %s delivered mode=%s user_id=%s email=%s attempt=%s",
                    event_name,
                    self.mode,
                    user_id,
                    _mask_email(email),
                    attempt,
                )
                return
            except (smtplib.SMTPException, OSError, TimeoutError) as error:
                last_error = error
                if attempt >= max_attempts:
                    break
                time.sleep(0.2 * (2 ** (attempt - 1)))

        raise EmailVerificationDeliveryError(
            "Failed to deliver verification email."
        ) from last_error

    def _build_message(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        subject: str,
        purpose_line: str,
        fallback_line: str,
    ) -> EmailMessage:
        ttl_minutes = max(1, int((expires_in_seconds + 59) / 60))
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = self._formatted_from()
        message["To"] = email
        message.set_content(
            (
                f"{purpose_line}\n\n"
                f"{code}\n\n"
                f"This code expires in {ttl_minutes} minute(s).\n"
                f"{fallback_line}"
            )
        )
        return message

    def _formatted_from(self) -> str:
        from_name = self.from_name.strip()
        from_email = self.from_email.strip()
        if not from_name:
            return from_email
        return f"{from_name} <{from_email}>"

    def _send_message(self, message: EmailMessage) -> None:
        if self.use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(self.host, self.port, timeout=self.timeout_seconds, context=context) as smtp:
                self._authenticate(smtp)
                smtp.send_message(message)
            return

        with smtplib.SMTP(self.host, self.port, timeout=self.timeout_seconds) as smtp:
            smtp.ehlo()
            if self.use_starttls:
                context = ssl.create_default_context()
                smtp.starttls(context=context)
                smtp.ehlo()
            self._authenticate(smtp)
            smtp.send_message(message)

    def _send_message_with_timeout(self, message: EmailMessage) -> None:
        # Guard against DNS/connect stalls that can exceed smtplib socket timeout.
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="foodlens-auth-email")
        future = executor.submit(self._send_message, message)
        try:
            future.result(timeout=max(1.0, float(self.timeout_seconds) + 0.5))
        except FutureTimeoutError as error:
            future.cancel()
            raise TimeoutError("SMTP send operation timed out.") from error
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    def _authenticate(self, smtp: smtplib.SMTP) -> None:
        if not self.username:
            return
        smtp.login(self.username, self.password or "")


def build_email_verification_sender_from_env(
    get_env: Callable[[str, str | None], str | None] = os.environ.get,
) -> tuple[EmailVerificationSender, EmailDeliveryMode]:
    raw_mode = (get_env("AUTH_EMAIL_VERIFICATION_DELIVERY_MODE", "log") or "log").strip().lower()
    mode: EmailDeliveryMode
    if raw_mode in {"disabled", "log", "smtp"}:
        mode = raw_mode  # type: ignore[assignment]
    else:
        logger.warning("[AuthEmail] unknown delivery mode=%s, fallback=log", raw_mode)
        mode = "log"

    if mode == "disabled":
        return DisabledEmailVerificationSender(), mode

    if mode == "log":
        include_code_in_logs = (get_env("AUTH_EMAIL_VERIFICATION_LOG_CODE_ENABLED", "0") or "0").strip() == "1"
        return LoggingEmailVerificationSender(include_code_in_logs=include_code_in_logs), mode

    host = (get_env("AUTH_EMAIL_SMTP_HOST", "") or "").strip()
    from_email = (get_env("AUTH_EMAIL_SENDER_FROM", "") or "").strip()
    if not host or not from_email:
        logger.error(
            "[AuthEmail] smtp delivery misconfigured host_set=%s from_set=%s",
            bool(host),
            bool(from_email),
        )
        return DisabledEmailVerificationSender(
            reason="Email verification SMTP is misconfigured.",
            mode="smtp",
        ), mode

    port = _safe_int(get_env("AUTH_EMAIL_SMTP_PORT", "587"), 587)
    timeout_seconds = _safe_float(
        get_env("AUTH_EMAIL_SMTP_TIMEOUT_SECONDS", str(DEFAULT_EMAIL_TIMEOUT_SECONDS)),
        DEFAULT_EMAIL_TIMEOUT_SECONDS,
    )
    max_attempts = _safe_int(get_env("AUTH_EMAIL_SMTP_MAX_ATTEMPTS", str(MAX_EMAIL_SEND_ATTEMPTS)), MAX_EMAIL_SEND_ATTEMPTS)
    use_starttls = (get_env("AUTH_EMAIL_SMTP_STARTTLS", "1") or "1").strip() != "0"
    use_ssl = (get_env("AUTH_EMAIL_SMTP_SSL", "0") or "0").strip() == "1"
    username = (get_env("AUTH_EMAIL_SMTP_USERNAME", "") or "").strip() or None
    password = get_env("AUTH_EMAIL_SMTP_PASSWORD", None)
    from_name = (get_env("AUTH_EMAIL_SENDER_NAME", "FoodLens") or "FoodLens").strip()
    subject = (get_env("AUTH_EMAIL_VERIFICATION_SUBJECT", "FoodLens verification code") or "FoodLens verification code").strip()
    password_reset_subject = (
        get_env("AUTH_EMAIL_PASSWORD_RESET_SUBJECT", "FoodLens password reset code") or "FoodLens password reset code"
    ).strip()

    sender = SmtpEmailVerificationSender(
        host=host,
        port=port,
        from_email=from_email,
        username=username,
        password=password,
        from_name=from_name,
        timeout_seconds=max(1.0, timeout_seconds),
        max_attempts=max(1, max_attempts),
        use_starttls=use_starttls,
        use_ssl=use_ssl,
        subject=subject,
        password_reset_subject=password_reset_subject,
    )
    return sender, mode


def _safe_int(raw_value: str | None, fallback: int) -> int:
    try:
        if raw_value is None:
            return fallback
        return int(raw_value.strip())
    except (TypeError, ValueError):
        return fallback


def _safe_float(raw_value: str | None, fallback: float) -> float:
    try:
        if raw_value is None:
            return fallback
        return float(raw_value.strip())
    except (TypeError, ValueError):
        return fallback


def _mask_email(email: str) -> str:
    local_part, _, domain = email.partition("@")
    if not domain:
        return "***"
    if len(local_part) <= 2:
        masked_local = local_part[:1] + "*"
    else:
        masked_local = local_part[:2] + "***"
    return f"{masked_local}@{domain}"
