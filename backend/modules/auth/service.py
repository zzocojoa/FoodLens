from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Callable, Literal
from uuid import uuid4

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


class InMemoryAuthSessionService:
    def __init__(
        self,
        *,
        access_ttl_seconds: int = 900,
        refresh_ttl_days: int = 30,
        password_iterations: int = 390_000,
        allowed_redirects_by_provider: dict[str, set[str]] | None = None,
    ):
        self.access_ttl_seconds = max(60, access_ttl_seconds)
        self.refresh_ttl_seconds = max(24 * 60 * 60, refresh_ttl_days * 24 * 60 * 60)
        self.password_iterations = max(120_000, password_iterations)
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

        self._lock = RLock()

    @classmethod
    def from_env(cls, get_env: Callable[[str, str | None], str | None] = os.environ.get) -> "InMemoryAuthSessionService":
        access_ttl_seconds = int((get_env("AUTH_ACCESS_TOKEN_TTL_SECONDS", "900") or "900").strip())
        refresh_ttl_days = int((get_env("AUTH_REFRESH_TOKEN_TTL_DAYS", "30") or "30").strip())
        password_iterations = int((get_env("AUTH_PASSWORD_ITERATIONS", "390000") or "390000").strip())
        allowed_redirects_by_provider = {
            "google": _parse_csv(get_env("AUTH_GOOGLE_ALLOWED_REDIRECT_URIS", None)),
            "kakao": _parse_csv(get_env("AUTH_KAKAO_ALLOWED_REDIRECT_URIS", None)),
        }
        return cls(
            access_ttl_seconds=access_ttl_seconds,
            refresh_ttl_days=refresh_ttl_days,
            password_iterations=password_iterations,
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
            )
            return self._create_session_bundle(user=user, provider="email", device_id=device_id)

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

            return self._create_session_bundle(user=user, provider="email", device_id=device_id)

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
                    )
                self._provider_subject_to_user_id[provider_key] = user.user_id

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
    ) -> AuthUser:
        password_salt: str | None = None
        password_hash: str | None = None
        if password is not None:
            password_salt = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("ascii").rstrip("=")
            password_hash = self._hash_password(password, password_salt)

        user = AuthUser(
            user_id=_random_id("usr"),
            email=email,
            display_name=display_name.strip() if display_name else None,
            provider=provider,
            provider_subject=provider_subject,
            locale=locale or "ko-KR",
            password_salt=password_salt,
            password_hash=password_hash,
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

    def _serialize_user(self, user: AuthUser) -> dict[str, object]:
        return {
            "id": user.user_id,
            "email": user.email,
            "name": user.display_name,
            "locale": user.locale,
            "provider": user.provider,
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
