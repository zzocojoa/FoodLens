from __future__ import annotations

import logging
import os
import smtplib
import ssl
import time
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


@dataclass(slots=True)
class SmtpEmailVerificationSender(EmailVerificationSender):
    host: str
    port: int
    from_email: str
    username: str | None = None
    password: str | None = None
    from_name: str = "FoodLens"
    timeout_seconds: float = DEFAULT_EMAIL_TIMEOUT_SECONDS
    use_starttls: bool = True
    use_ssl: bool = False
    subject: str = "FoodLens verification code"
    mode: EmailDeliveryMode = "smtp"

    def send_verification_code(
        self,
        *,
        email: str,
        code: str,
        expires_in_seconds: int,
        user_id: str,
    ) -> None:
        message = self._build_message(email=email, code=code, expires_in_seconds=expires_in_seconds)
        last_error: Exception | None = None

        for attempt in range(1, MAX_EMAIL_SEND_ATTEMPTS + 1):
            try:
                self._send_message(message)
                logger.info(
                    "[AuthEmail] verification email delivered mode=%s user_id=%s email=%s attempt=%s",
                    self.mode,
                    user_id,
                    _mask_email(email),
                    attempt,
                )
                return
            except (smtplib.SMTPException, OSError) as error:
                last_error = error
                if attempt >= MAX_EMAIL_SEND_ATTEMPTS:
                    break
                time.sleep(0.2 * (2 ** (attempt - 1)))

        raise EmailVerificationDeliveryError(
            "Failed to deliver verification email."
        ) from last_error

    def _build_message(self, *, email: str, code: str, expires_in_seconds: int) -> EmailMessage:
        ttl_minutes = max(1, int((expires_in_seconds + 59) / 60))
        message = EmailMessage()
        message["Subject"] = self.subject
        message["From"] = self._formatted_from()
        message["To"] = email
        message.set_content(
            (
                "Your FoodLens verification code is:\n\n"
                f"{code}\n\n"
                f"This code expires in {ttl_minutes} minute(s).\n"
                "If you did not request this code, you can ignore this email."
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
    use_starttls = (get_env("AUTH_EMAIL_SMTP_STARTTLS", "1") or "1").strip() != "0"
    use_ssl = (get_env("AUTH_EMAIL_SMTP_SSL", "0") or "0").strip() == "1"
    username = (get_env("AUTH_EMAIL_SMTP_USERNAME", "") or "").strip() or None
    password = get_env("AUTH_EMAIL_SMTP_PASSWORD", None)
    from_name = (get_env("AUTH_EMAIL_SENDER_NAME", "FoodLens") or "FoodLens").strip()
    subject = (get_env("AUTH_EMAIL_VERIFICATION_SUBJECT", "FoodLens verification code") or "FoodLens verification code").strip()

    sender = SmtpEmailVerificationSender(
        host=host,
        port=port,
        from_email=from_email,
        username=username,
        password=password,
        from_name=from_name,
        timeout_seconds=max(1.0, timeout_seconds),
        use_starttls=use_starttls,
        use_ssl=use_ssl,
        subject=subject,
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
