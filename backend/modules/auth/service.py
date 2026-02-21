from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Literal
from uuid import uuid4
from .email_sender import (
    EmailVerificationDeliveryError,
    EmailVerificationSender,
    LoggingEmailVerificationSender,
    build_email_verification_sender_from_env,
)

RefreshStatus = Literal["active", "used", "revoked", "expired"]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso8601(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _random_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _random_token(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(32)}"


def _parse_csv(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {part.strip() for part in raw.split(",") if part.strip()}


class AuthServiceError(Exception):
    def __init__(self, *, code: str, message: str, status_code: int, user_id: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.user_id = user_id


@dataclass(slots=True)
class AuthUser:
    user_id: str
    email: str
    display_name: str | None
    provider: str
    provider_subject: str | None
    locale: str
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)
    password_salt: str | None = None
    password_hash: str | None = None
    email_verified_at: datetime | None = None


@dataclass(slots=True)
class UserProfile:
    user_id: str
    email: str
    display_name: str | None
    locale: str
    timezone: str
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)


@dataclass(slots=True)
class SessionRecord:
    session_id: str
    family_id: str
    user_id: str
    provider: str
    device_id: str | None
    created_at: datetime = field(default_factory=_utc_now)
    revoked_at: datetime | None = None
    revoked_reason: str | None = None


@dataclass(slots=True)
class AccessTokenRecord:
    token: str
    user_id: str
    session_id: str
    expires_at: datetime
    created_at: datetime = field(default_factory=_utc_now)
    revoked: bool = False


@dataclass(slots=True)
class RefreshTokenRecord:
    token: str
    user_id: str
    session_id: str
    family_id: str
    expires_at: datetime
    created_at: datetime = field(default_factory=_utc_now)
    status: RefreshStatus = "active"
    used_at: datetime | None = None
    replaced_by: str | None = None


@dataclass(slots=True)
class EmailVerificationRecord:
    verification_id: str
    user_id: str
    email: str
    code_hash: str
    expires_at: datetime
    created_at: datetime = field(default_factory=_utc_now)
    consumed_at: datetime | None = None
    failed_attempts: int = 0


@dataclass(slots=True)
class PasswordResetRecord:
    reset_id: str
    user_id: str
    email: str
    code_hash: str
    expires_at: datetime
    created_at: datetime = field(default_factory=_utc_now)
    consumed_at: datetime | None = None
    failed_attempts: int = 0


class InMemoryAuthSessionService:
    def __init__(
        self,
        *,
        access_ttl_seconds: int = 900,
        refresh_ttl_days: int = 30,
        password_iterations: int = 390_000,
        email_verification_required: bool = True,
        email_verification_code_ttl_seconds: int = 600,
        email_verification_max_attempts: int = 5,
        email_verification_debug_code_enabled: bool = False,
        password_reset_code_ttl_seconds: int = 600,
        password_reset_max_attempts: int = 5,
        password_reset_debug_code_enabled: bool = False,
        email_verification_sender: EmailVerificationSender | None = None,
        allowed_redirects_by_provider: dict[str, set[str]] | None = None,
    ):
        self.access_ttl_seconds = max(60, access_ttl_seconds)
        self.refresh_ttl_seconds = max(24 * 60 * 60, refresh_ttl_days * 24 * 60 * 60)
        self.password_iterations = max(120_000, password_iterations)
        self.email_verification_required = email_verification_required
        self.email_verification_code_ttl_seconds = max(60, email_verification_code_ttl_seconds)
        self.email_verification_max_attempts = max(1, email_verification_max_attempts)
        self.email_verification_debug_code_enabled = email_verification_debug_code_enabled
        self.password_reset_code_ttl_seconds = max(60, password_reset_code_ttl_seconds)
        self.password_reset_max_attempts = max(1, password_reset_max_attempts)
        self.password_reset_debug_code_enabled = password_reset_debug_code_enabled
        self._email_verification_sender = email_verification_sender or LoggingEmailVerificationSender()
        self.allowed_redirects_by_provider = {
            key: set(value)
            for key, value in (allowed_redirects_by_provider or {}).items()
        }

        self._users_by_id: dict[str, AuthUser] = {}
        self._user_id_by_email: dict[str, str] = {}
        self._provider_subject_to_user_id: dict[str, str] = {}
        self._profiles_by_user_id: dict[str, UserProfile] = {}

        self._sessions: dict[str, SessionRecord] = {}
        self._session_ids_by_family: dict[str, set[str]] = {}
        self._access_tokens: dict[str, AccessTokenRecord] = {}
        self._refresh_tokens: dict[str, RefreshTokenRecord] = {}
        self._access_tokens_by_session: dict[str, set[str]] = {}
        self._refresh_tokens_by_session: dict[str, set[str]] = {}
        self._email_verifications_by_user_id: dict[str, EmailVerificationRecord] = {}
        self._password_resets_by_user_id: dict[str, PasswordResetRecord] = {}

        self._lock = RLock()

    @classmethod
    def from_env(cls, get_env: Callable[[str, str | None], str | None] = os.environ.get) -> "InMemoryAuthSessionService":
        access_ttl_seconds = int((get_env("AUTH_ACCESS_TOKEN_TTL_SECONDS", "900") or "900").strip())
        refresh_ttl_days = int((get_env("AUTH_REFRESH_TOKEN_TTL_DAYS", "30") or "30").strip())
        password_iterations = int((get_env("AUTH_PASSWORD_ITERATIONS", "390000") or "390000").strip())
        email_verification_required = (get_env("AUTH_EMAIL_VERIFICATION_REQUIRED", "1") or "1").strip() != "0"
        email_verification_code_ttl_seconds = int(
            (get_env("AUTH_EMAIL_VERIFICATION_CODE_TTL_SECONDS", "600") or "600").strip()
        )
        email_verification_max_attempts = int(
            (get_env("AUTH_EMAIL_VERIFICATION_MAX_ATTEMPTS", "5") or "5").strip()
        )
        email_verification_debug_code_enabled = (
            get_env("AUTH_EMAIL_VERIFICATION_DEBUG_CODE_ENABLED", "0") or "0"
        ).strip() == "1"
        password_reset_code_ttl_seconds = int(
            (get_env("AUTH_PASSWORD_RESET_CODE_TTL_SECONDS", "600") or "600").strip()
        )
        password_reset_max_attempts = int(
            (get_env("AUTH_PASSWORD_RESET_MAX_ATTEMPTS", "5") or "5").strip()
        )
        password_reset_debug_code_enabled = (
            get_env("AUTH_PASSWORD_RESET_DEBUG_CODE_ENABLED", "0") or "0"
        ).strip() == "1"
        email_verification_sender, email_delivery_mode = build_email_verification_sender_from_env(get_env=get_env)
        if email_delivery_mode == "smtp" and email_verification_debug_code_enabled:
            email_verification_debug_code_enabled = False
        if email_delivery_mode == "smtp" and password_reset_debug_code_enabled:
            password_reset_debug_code_enabled = False
        allowed_redirects_by_provider = {
            "google": _parse_csv(get_env("AUTH_GOOGLE_ALLOWED_REDIRECT_URIS", None)),
            "kakao": _parse_csv(get_env("AUTH_KAKAO_ALLOWED_REDIRECT_URIS", None)),
        }
        return cls(
            access_ttl_seconds=access_ttl_seconds,
            refresh_ttl_days=refresh_ttl_days,
            password_iterations=password_iterations,
            email_verification_required=email_verification_required,
            email_verification_code_ttl_seconds=email_verification_code_ttl_seconds,
            email_verification_max_attempts=email_verification_max_attempts,
            email_verification_debug_code_enabled=email_verification_debug_code_enabled,
            password_reset_code_ttl_seconds=password_reset_code_ttl_seconds,
            password_reset_max_attempts=password_reset_max_attempts,
            password_reset_debug_code_enabled=password_reset_debug_code_enabled,
            email_verification_sender=email_verification_sender,
            allowed_redirects_by_provider=allowed_redirects_by_provider,
        )

    def signup_email(
        self,
        *,
        email: str,
        password: str,
        display_name: str | None,
        locale: str,
        device_id: str | None,
    ) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        self._validate_email(normalized_email)
        self._validate_password(password)

        with self._lock:
            if normalized_email in self._user_id_by_email:
                raise AuthServiceError(
                    code="AUTH_EMAIL_ALREADY_EXISTS",
                    message="Email is already registered.",
                    status_code=409,
                )

            user = self._create_user(
                email=normalized_email,
                display_name=display_name,
                provider="email",
                provider_subject=None,
                locale=locale,
                password=password,
                email_verified_at=None if self.email_verification_required else _utc_now(),
            )
            if not self.email_verification_required:
                return self._create_session_bundle(user=user, provider="email", device_id=device_id)

            verification_record, verification_code = self._issue_email_verification(user=user)
            challenge_payload = self._serialize_email_verification_challenge(
                user=user,
                record=verification_record,
            )
            if self.email_verification_debug_code_enabled:
                challenge_payload["verification_debug_code"] = verification_code

        try:
            self._email_verification_sender.send_verification_code(
                email=user.email,
                code=verification_code,
                expires_in_seconds=max(1, int((verification_record.expires_at - _utc_now()).total_seconds())),
                user_id=user.user_id,
            )
        except EmailVerificationDeliveryError as error:
            with self._lock:
                pending_user = self._users_by_id.get(user.user_id)
                if pending_user and pending_user.email_verified_at is None:
                    self._rollback_unverified_user(pending_user)
            raise AuthServiceError(
                code="AUTH_EMAIL_VERIFICATION_DELIVERY_FAILED",
                message="Failed to deliver verification email.",
                status_code=503,
                user_id=user.user_id,
            ) from error

        return challenge_payload

    def login_email(self, *, email: str, password: str, device_id: str | None) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        with self._lock:
            user_id = self._user_id_by_email.get(normalized_email)
            if not user_id:
                raise AuthServiceError(
                    code="AUTH_INVALID_CREDENTIALS",
                    message="Invalid email or password.",
                    status_code=401,
                )

            user = self._users_by_id[user_id]
            if not user.password_hash or not user.password_salt:
                raise AuthServiceError(
                    code="AUTH_INVALID_CREDENTIALS",
                    message="Invalid email or password.",
                    status_code=401,
                    user_id=user.user_id,
                )
            if not self._verify_password(password, user.password_salt, user.password_hash):
                raise AuthServiceError(
                    code="AUTH_INVALID_CREDENTIALS",
                    message="Invalid email or password.",
                    status_code=401,
                    user_id=user.user_id,
                )
            if self.email_verification_required and user.email_verified_at is None:
                raise AuthServiceError(
                    code="AUTH_EMAIL_NOT_VERIFIED",
                    message="Email verification is required before login.",
                    status_code=403,
                    user_id=user.user_id,
                )

            return self._create_session_bundle(user=user, provider="email", device_id=device_id)

    def verify_email(
        self,
        *,
        email: str,
        code: str,
        device_id: str | None,
    ) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        normalized_code = code.strip()
        if not normalized_code:
            raise AuthServiceError(
                code="AUTH_EMAIL_VERIFICATION_INVALID",
                message="Invalid verification code.",
                status_code=400,
            )

        now = _utc_now()
        with self._lock:
            user_id = self._user_id_by_email.get(normalized_email)
            if not user_id:
                raise AuthServiceError(
                    code="AUTH_EMAIL_VERIFICATION_NOT_FOUND",
                    message="Verification request not found.",
                    status_code=404,
                )

            user = self._users_by_id[user_id]
            if user.provider != "email":
                raise AuthServiceError(
                    code="AUTH_PROVIDER_UNSUPPORTED",
                    message="Unsupported provider.",
                    status_code=400,
                    user_id=user.user_id,
                )

            if user.email_verified_at is not None:
                raise AuthServiceError(
                    code="AUTH_EMAIL_ALREADY_VERIFIED",
                    message="Email is already verified.",
                    status_code=409,
                    user_id=user.user_id,
                )

            record = self._email_verifications_by_user_id.get(user.user_id)
            if record is None or record.consumed_at is not None or record.expires_at <= now:
                raise AuthServiceError(
                    code="AUTH_EMAIL_VERIFICATION_EXPIRED",
                    message="Verification code expired. Please sign up again.",
                    status_code=400,
                    user_id=user.user_id,
                )

            expected_hash = self._hash_email_verification_code(
                user_id=user.user_id,
                code=normalized_code,
            )
            if not hmac.compare_digest(record.code_hash, expected_hash):
                record.failed_attempts += 1
                if record.failed_attempts >= self.email_verification_max_attempts:
                    record.consumed_at = now
                    raise AuthServiceError(
                        code="AUTH_EMAIL_VERIFICATION_LOCKED",
                        message="Too many invalid verification attempts.",
                        status_code=429,
                        user_id=user.user_id,
                    )
                raise AuthServiceError(
                    code="AUTH_EMAIL_VERIFICATION_INVALID",
                    message="Invalid verification code.",
                    status_code=400,
                    user_id=user.user_id,
                )

            record.consumed_at = now
            user.email_verified_at = now
            user.updated_at = now
            return self._create_session_bundle(user=user, provider="email", device_id=device_id)

    def request_password_reset(self, *, email: str) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        self._validate_email(normalized_email)

        with self._lock:
            user_id = self._user_id_by_email.get(normalized_email)
            if not user_id:
                return self._serialize_password_reset_challenge(record=None)

            user = self._users_by_id[user_id]
            if user.provider != "email" or not user.password_hash or not user.password_salt:
                return self._serialize_password_reset_challenge(record=None)

            record, reset_code = self._issue_password_reset(user=user)
            payload = self._serialize_password_reset_challenge(record=record)
            if self.password_reset_debug_code_enabled:
                payload["reset_debug_code"] = reset_code

        try:
            self._email_verification_sender.send_password_reset_code(
                email=user.email,
                code=reset_code,
                expires_in_seconds=max(1, int((record.expires_at - _utc_now()).total_seconds())),
                user_id=user.user_id,
            )
        except EmailVerificationDeliveryError as error:
            with self._lock:
                pending_reset = self._password_resets_by_user_id.get(user.user_id)
                if pending_reset and pending_reset.reset_id == record.reset_id and pending_reset.consumed_at is None:
                    self._password_resets_by_user_id.pop(user.user_id, None)
            raise AuthServiceError(
                code="AUTH_PASSWORD_RESET_DELIVERY_FAILED",
                message="Failed to deliver password reset email.",
                status_code=503,
                user_id=user.user_id,
            ) from error

        return payload

    def confirm_password_reset(
        self,
        *,
        email: str,
        code: str,
        new_password: str,
    ) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        normalized_code = code.strip()
        self._validate_email(normalized_email)
        self._validate_password(new_password)
        if not normalized_code:
            raise AuthServiceError(
                code="AUTH_PASSWORD_RESET_INVALID",
                message="Invalid password reset code.",
                status_code=400,
            )

        now = _utc_now()
        with self._lock:
            user_id = self._user_id_by_email.get(normalized_email)
            if not user_id:
                raise AuthServiceError(
                    code="AUTH_PASSWORD_RESET_INVALID",
                    message="Invalid password reset code.",
                    status_code=400,
                )

            user = self._users_by_id[user_id]
            if user.provider != "email" or not user.password_hash or not user.password_salt:
                raise AuthServiceError(
                    code="AUTH_PASSWORD_RESET_INVALID",
                    message="Invalid password reset code.",
                    status_code=400,
                    user_id=user.user_id,
                )

            record = self._password_resets_by_user_id.get(user.user_id)
            if record is None or record.consumed_at is not None or record.expires_at <= now:
                raise AuthServiceError(
                    code="AUTH_PASSWORD_RESET_EXPIRED",
                    message="Password reset code expired.",
                    status_code=400,
                    user_id=user.user_id,
                )

            expected_hash = self._hash_password_reset_code(
                user_id=user.user_id,
                code=normalized_code,
            )
            if not hmac.compare_digest(record.code_hash, expected_hash):
                record.failed_attempts += 1
                if record.failed_attempts >= self.password_reset_max_attempts:
                    record.consumed_at = now
                    raise AuthServiceError(
                        code="AUTH_PASSWORD_RESET_LOCKED",
                        message="Too many invalid password reset attempts.",
                        status_code=429,
                        user_id=user.user_id,
                    )
                raise AuthServiceError(
                    code="AUTH_PASSWORD_RESET_INVALID",
                    message="Invalid password reset code.",
                    status_code=400,
                    user_id=user.user_id,
                )

            record.consumed_at = now
            user.password_salt, user.password_hash = self._create_password_credentials(new_password)
            user.updated_at = now
            revoked_sessions = self._revoke_sessions_for_user(user.user_id, reason="password_reset")

            return {
                "password_reset": True,
                "sessions_revoked": revoked_sessions,
            }

    def oauth_login(
        self,
        *,
        provider: str,
        code: str | None,
        state: str | None,
        redirect_uri: str | None,
        error: str | None,
        provider_user_id: str | None,
        email: str | None,
        device_id: str | None,
    ) -> dict[str, object]:
        provider_normalized = provider.strip().lower()
        if provider_normalized not in {"google", "kakao"}:
            raise AuthServiceError(
                code="AUTH_PROVIDER_UNSUPPORTED",
                message="Unsupported provider.",
                status_code=400,
            )

        if error:
            lowered = error.strip().lower()
            if lowered in {"access_denied", "cancelled", "user_cancelled", "canceled"}:
                raise AuthServiceError(
                    code="AUTH_PROVIDER_CANCELLED",
                    message="Provider login was cancelled.",
                    status_code=400,
                )
            raise AuthServiceError(
                code="AUTH_PROVIDER_REJECTED",
                message="Provider login failed.",
                status_code=400,
            )

        if not code or not code.strip():
            raise AuthServiceError(
                code="AUTH_PROVIDER_INVALID_CODE",
                message="Missing or invalid authorization code.",
                status_code=400,
            )

        if not state or not state.strip():
            raise AuthServiceError(
                code="AUTH_PROVIDER_INVALID_STATE",
                message="Missing or invalid state value.",
                status_code=400,
            )

        self._validate_redirect_uri(provider_normalized, redirect_uri)
        subject = (provider_user_id or "").strip() or self._derive_provider_subject(
            provider_normalized,
            code.strip(),
            state.strip(),
        )
        provider_key = f"{provider_normalized}:{subject}"

        with self._lock:
            user_id = self._provider_subject_to_user_id.get(provider_key)
            user: AuthUser
            if user_id:
                user = self._users_by_id[user_id]
            else:
                normalized_email = self._normalize_email(email or f"{provider_normalized}_{subject}@foodlens.local")
                existing_by_email = self._user_id_by_email.get(normalized_email)
                if existing_by_email:
                    user = self._users_by_id[existing_by_email]
                    user.provider = provider_normalized
                    user.provider_subject = subject
                    user.updated_at = _utc_now()
                else:
                    user = self._create_user(
                        email=normalized_email,
                        display_name=None,
                        provider=provider_normalized,
                        provider_subject=subject,
                        locale="ko-KR",
                        password=None,
                        email_verified_at=_utc_now(),
                    )
                self._provider_subject_to_user_id[provider_key] = user.user_id

            if user.email_verified_at is None:
                user.email_verified_at = _utc_now()

            return self._create_session_bundle(user=user, provider=provider_normalized, device_id=device_id)

    def refresh(self, *, refresh_token: str) -> dict[str, object]:
        now = _utc_now()
        with self._lock:
            record = self._refresh_tokens.get(refresh_token)
            if record is None:
                raise AuthServiceError(
                    code="AUTH_REFRESH_INVALID",
                    message="Invalid refresh token.",
                    status_code=401,
                )

            session = self._sessions.get(record.session_id)
            if session is None or session.revoked_at is not None:
                raise AuthServiceError(
                    code="AUTH_SESSION_REVOKED",
                    message="Session has been revoked.",
                    status_code=401,
                    user_id=record.user_id,
                )

            if record.expires_at <= now:
                record.status = "expired"
                raise AuthServiceError(
                    code="AUTH_REFRESH_EXPIRED",
                    message="Refresh token has expired.",
                    status_code=401,
                    user_id=record.user_id,
                )

            if record.status != "active":
                self._revoke_family(record.family_id, reason="refresh_reuse_detected")
                raise AuthServiceError(
                    code="AUTH_REFRESH_REUSED",
                    message="Refresh token reuse detected. Session family was revoked.",
                    status_code=401,
                    user_id=record.user_id,
                )

            record.status = "used"
            record.used_at = now
            user = self._users_by_id.get(record.user_id)
            if user is None:
                raise AuthServiceError(
                    code="AUTH_USER_NOT_FOUND",
                    message="User not found.",
                    status_code=404,
                )

            bundle = self._issue_tokens(user=user, session=session)
            record.replaced_by = bundle["refresh_token"]
            return bundle

    def logout(self, *, access_token: str | None, refresh_token: str | None) -> int:
        with self._lock:
            session_ids: set[str] = set()
            if access_token:
                access_record = self._access_tokens.get(access_token)
                if access_record is not None:
                    session_ids.add(access_record.session_id)
            if refresh_token:
                refresh_record = self._refresh_tokens.get(refresh_token)
                if refresh_record is not None:
                    session_ids.add(refresh_record.session_id)

            if not session_ids:
                raise AuthServiceError(
                    code="AUTH_SESSION_NOT_FOUND",
                    message="Session not found.",
                    status_code=401,
                )

            revoked_count = 0
            for session_id in session_ids:
                session = self._sessions.get(session_id)
                if session and session.revoked_at is None:
                    session.revoked_at = _utc_now()
                    session.revoked_reason = "logout"
                    revoked_count += 1
                self._revoke_tokens_for_session(session_id)

            return revoked_count

    def authenticate_access_token(self, *, access_token: str) -> AuthUser:
        now = _utc_now()
        with self._lock:
            record = self._access_tokens.get(access_token)
            if record is None or record.revoked:
                raise AuthServiceError(
                    code="AUTH_TOKEN_INVALID",
                    message="Invalid access token.",
                    status_code=401,
                )

            if record.expires_at <= now:
                raise AuthServiceError(
                    code="AUTH_TOKEN_EXPIRED",
                    message="Access token has expired.",
                    status_code=401,
                    user_id=record.user_id,
                )

            session = self._sessions.get(record.session_id)
            if session is None or session.revoked_at is not None:
                raise AuthServiceError(
                    code="AUTH_SESSION_REVOKED",
                    message="Session has been revoked.",
                    status_code=401,
                    user_id=record.user_id,
                )

            user = self._users_by_id.get(record.user_id)
            if user is None:
                raise AuthServiceError(
                    code="AUTH_USER_NOT_FOUND",
                    message="User not found.",
                    status_code=404,
                    user_id=record.user_id,
                )
            return user

    def get_profile(self, *, user_id: str) -> dict[str, object]:
        with self._lock:
            profile = self._profiles_by_user_id.get(user_id)
            if profile is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )
            return self._serialize_profile(profile)

    def update_profile(
        self,
        *,
        user_id: str,
        display_name: str | None,
        locale: str | None,
        timezone_name: str | None,
    ) -> dict[str, object]:
        with self._lock:
            profile = self._profiles_by_user_id.get(user_id)
            if profile is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )

            if display_name is not None:
                profile.display_name = display_name.strip() or None
            if locale is not None:
                profile.locale = locale.strip() or profile.locale
            if timezone_name is not None:
                profile.timezone = timezone_name.strip() or profile.timezone
            profile.updated_at = _utc_now()

            user = self._users_by_id[user_id]
            user.display_name = profile.display_name
            user.locale = profile.locale
            user.updated_at = profile.updated_at

            return self._serialize_profile(profile)

    def _create_user(
        self,
        *,
        email: str,
        display_name: str | None,
        provider: str,
        provider_subject: str | None,
        locale: str,
        password: str | None,
        email_verified_at: datetime | None,
    ) -> AuthUser:
        password_salt: str | None = None
        password_hash: str | None = None
        if password is not None:
            password_salt, password_hash = self._create_password_credentials(password)

        user = AuthUser(
            user_id=_random_id("usr"),
            email=email,
            display_name=display_name.strip() if display_name else None,
            provider=provider,
            provider_subject=provider_subject,
            locale=locale or "ko-KR",
            password_salt=password_salt,
            password_hash=password_hash,
            email_verified_at=email_verified_at,
        )
        self._users_by_id[user.user_id] = user
        self._user_id_by_email[email] = user.user_id

        self._profiles_by_user_id[user.user_id] = UserProfile(
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
            locale=user.locale,
            timezone="UTC",
        )
        return user

    def _create_session_bundle(self, *, user: AuthUser, provider: str, device_id: str | None) -> dict[str, object]:
        family_id = _random_id("family")
        session = SessionRecord(
            session_id=_random_id("sess"),
            family_id=family_id,
            user_id=user.user_id,
            provider=provider,
            device_id=device_id,
        )
        self._sessions[session.session_id] = session
        self._session_ids_by_family.setdefault(family_id, set()).add(session.session_id)
        return self._issue_tokens(user=user, session=session)

    def _rollback_unverified_user(self, user: AuthUser) -> None:
        self._email_verifications_by_user_id.pop(user.user_id, None)
        self._password_resets_by_user_id.pop(user.user_id, None)
        self._profiles_by_user_id.pop(user.user_id, None)
        self._users_by_id.pop(user.user_id, None)
        if self._user_id_by_email.get(user.email) == user.user_id:
            self._user_id_by_email.pop(user.email, None)

    def _issue_tokens(self, *, user: AuthUser, session: SessionRecord) -> dict[str, object]:
        now = _utc_now()

        access_token = _random_token("atk")
        access_record = AccessTokenRecord(
            token=access_token,
            user_id=user.user_id,
            session_id=session.session_id,
            expires_at=now + timedelta(seconds=self.access_ttl_seconds),
        )
        self._access_tokens[access_token] = access_record
        self._access_tokens_by_session.setdefault(session.session_id, set()).add(access_token)

        refresh_token = _random_token("rtk")
        refresh_record = RefreshTokenRecord(
            token=refresh_token,
            user_id=user.user_id,
            session_id=session.session_id,
            family_id=session.family_id,
            expires_at=now + timedelta(seconds=self.refresh_ttl_seconds),
        )
        self._refresh_tokens[refresh_token] = refresh_record
        self._refresh_tokens_by_session.setdefault(session.session_id, set()).add(refresh_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": self.access_ttl_seconds,
            "user": self._serialize_user(user),
        }

    def _revoke_family(self, family_id: str, *, reason: str) -> None:
        now = _utc_now()
        for session_id in self._session_ids_by_family.get(family_id, set()):
            session = self._sessions.get(session_id)
            if session and session.revoked_at is None:
                session.revoked_at = now
                session.revoked_reason = reason
            self._revoke_tokens_for_session(session_id)

    def _revoke_tokens_for_session(self, session_id: str) -> None:
        for access_token in self._access_tokens_by_session.get(session_id, set()):
            access_record = self._access_tokens.get(access_token)
            if access_record:
                access_record.revoked = True

        for refresh_token in self._refresh_tokens_by_session.get(session_id, set()):
            refresh_record = self._refresh_tokens.get(refresh_token)
            if refresh_record and refresh_record.status == "active":
                refresh_record.status = "revoked"

    def _revoke_sessions_for_user(self, user_id: str, *, reason: str) -> int:
        now = _utc_now()
        revoked_count = 0
        for session in self._sessions.values():
            if session.user_id != user_id:
                continue
            if session.revoked_at is None:
                session.revoked_at = now
                session.revoked_reason = reason
                revoked_count += 1
            self._revoke_tokens_for_session(session.session_id)
        return revoked_count

    def _serialize_user(self, user: AuthUser) -> dict[str, object]:
        return {
            "id": user.user_id,
            "email": user.email,
            "name": user.display_name,
            "locale": user.locale,
            "provider": user.provider,
            "email_verified": user.email_verified_at is not None,
            "email_verified_at": _to_iso8601(user.email_verified_at) if user.email_verified_at else None,
        }

    def _issue_email_verification(self, *, user: AuthUser) -> tuple[EmailVerificationRecord, str]:
        verification_code = f"{secrets.randbelow(1_000_000):06d}"
        now = _utc_now()
        record = EmailVerificationRecord(
            verification_id=_random_id("evr"),
            user_id=user.user_id,
            email=user.email,
            code_hash=self._hash_email_verification_code(user_id=user.user_id, code=verification_code),
            expires_at=now + timedelta(seconds=self.email_verification_code_ttl_seconds),
        )
        self._email_verifications_by_user_id[user.user_id] = record
        return record, verification_code

    def _issue_password_reset(self, *, user: AuthUser) -> tuple[PasswordResetRecord, str]:
        reset_code = f"{secrets.randbelow(1_000_000):06d}"
        now = _utc_now()
        record = PasswordResetRecord(
            reset_id=_random_id("prs"),
            user_id=user.user_id,
            email=user.email,
            code_hash=self._hash_password_reset_code(user_id=user.user_id, code=reset_code),
            expires_at=now + timedelta(seconds=self.password_reset_code_ttl_seconds),
        )
        self._password_resets_by_user_id[user.user_id] = record
        return record, reset_code

    def _serialize_email_verification_challenge(
        self,
        *,
        user: AuthUser,
        record: EmailVerificationRecord,
    ) -> dict[str, object]:
        now = _utc_now()
        expires_in = max(0, int((record.expires_at - now).total_seconds()))
        return {
            "verification_required": True,
            "verification_method": "email_code",
            "verification_channel": "email",
            "verification_expires_in": expires_in,
            "verification_id": record.verification_id,
            "user": self._serialize_user(user),
        }

    def _serialize_password_reset_challenge(
        self,
        *,
        record: PasswordResetRecord | None,
    ) -> dict[str, object]:
        if record is None:
            expires_in = self.password_reset_code_ttl_seconds
        else:
            expires_in = max(0, int((record.expires_at - _utc_now()).total_seconds()))
        return {
            "reset_requested": True,
            "reset_method": "email_code",
            "reset_channel": "email",
            "reset_expires_in": expires_in,
            "reset_id": record.reset_id if record else None,
        }

    def _serialize_profile(self, profile: UserProfile) -> dict[str, object]:
        return {
            "user_id": profile.user_id,
            "email": profile.email,
            "display_name": profile.display_name,
            "locale": profile.locale,
            "timezone": profile.timezone,
            "created_at": _to_iso8601(profile.created_at),
            "updated_at": _to_iso8601(profile.updated_at),
        }

    def _validate_password(self, password: str) -> None:
        if len(password) < 8:
            raise AuthServiceError(
                code="AUTH_WEAK_PASSWORD",
                message="Password must be at least 8 characters.",
                status_code=400,
            )

    def _validate_email(self, email: str) -> None:
        if "@" not in email:
            raise AuthServiceError(
                code="AUTH_INVALID_EMAIL",
                message="Invalid email format.",
                status_code=400,
            )

    def _normalize_email(self, email: str) -> str:
        return email.strip().lower()

    def _hash_email_verification_code(self, *, user_id: str, code: str) -> str:
        payload = f"{user_id}:{code}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def _hash_password_reset_code(self, *, user_id: str, code: str) -> str:
        payload = f"{user_id}:{code}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def _create_password_credentials(self, password: str) -> tuple[str, str]:
        salt = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("ascii").rstrip("=")
        password_hash = self._hash_password(password, salt)
        return salt, password_hash

    def _hash_password(self, password: str, salt: str) -> str:
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            self.password_iterations,
        )
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    def _verify_password(self, password: str, salt: str, stored_hash: str) -> bool:
        candidate = self._hash_password(password, salt)
        return hmac.compare_digest(candidate, stored_hash)

    def _derive_provider_subject(self, provider: str, code: str, state: str) -> str:
        seed = f"{provider}:{code}:{state}".encode("utf-8")
        return hashlib.sha256(seed).hexdigest()[:24]

    def _validate_redirect_uri(self, provider: str, redirect_uri: str | None) -> None:
        allowed = self.allowed_redirects_by_provider.get(provider, set())
        if not allowed:
            return
        candidate = (redirect_uri or "").strip()
        if candidate not in allowed:
            raise AuthServiceError(
                code="AUTH_REDIRECT_URI_MISMATCH",
                message="Redirect URI mismatch.",
                status_code=400,
            )
