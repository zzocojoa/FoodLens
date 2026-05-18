from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
from dataclasses import asdict, is_dataclass
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Literal
from uuid import uuid4
from .email_sender import (
    EmailVerificationDeliveryError,
    EmailVerificationSender,
    build_email_verification_sender_from_env,
)
from .email_sender import LoggingEmailVerificationSender
from .state_store import (
    AuthProjectionStore,
    AuthStateStore,
    AuthStateStoreError,
    PostgresAuthProjectionStore,
    PostgresAuthStateStore,
)

RefreshStatus = Literal["active", "used", "revoked", "expired"]
logger = logging.getLogger("foodlens.auth.state")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso8601(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _random_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex}"


def _random_token(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(32)}"


def _is_token_digest(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdef" for character in value)


def _parse_csv(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {part.strip() for part in raw.split(",") if part.strip()}


def _from_iso8601(raw: str) -> datetime:
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def _to_resolved_locale(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().replace("_", "-").lower()
    if not normalized or normalized == "auto":
        return None

    if normalized.startswith("ko"):
        return "ko-KR"
    if normalized.startswith("en"):
        return "en-US"
    if normalized.startswith("ja"):
        return "ja-JP"
    if normalized.startswith("zh"):
        return "zh-Hans"
    if normalized.startswith("th"):
        return "th-TH"
    if normalized.startswith("vi"):
        return "vi-VN"
    return None


_LEGACY_LOCALE_ALIAS = {
    "kr": "ko-KR",
    "us": "en-US",
    "jp": "ja-JP",
    "cn": "zh-Hans",
    "th": "th-TH",
    "vn": "vi-VN",
}


def _to_canonical_locale(value: str | None) -> str | None:
    if not value:
        return None

    raw = value.strip()
    if not raw:
        return None

    alias = _LEGACY_LOCALE_ALIAS.get(raw.lower())
    if alias:
        return alias

    return _to_resolved_locale(raw)


def _to_canonical_settings_language(value: str | None) -> str | None:
    if not value:
        return None

    raw = value.strip()
    if not raw:
        return None

    lowered = raw.lower()
    if lowered in {"auto", "gps"}:
        return "auto"

    return _to_canonical_locale(raw)


def _to_canonical_target_language(value: str | None) -> str | None:
    if value is None:
        return None

    raw = value.strip()
    if not raw:
        return None

    lowered = raw.lower()
    if lowered in {"auto", "gps"}:
        return None

    return _to_canonical_locale(raw)


def _locale_from_accept_language(accept_language: str | None) -> str | None:
    if not accept_language:
        return None
    for token in accept_language.split(","):
        part = token.split(";")[0].strip()
        resolved = _to_resolved_locale(part)
        if resolved:
            return resolved
    return None


def _normalize_resolved_locale(
    locale: str | None,
    accept_language: str | None = None,
    fallback: str = "en-US",
) -> str:
    explicit = _to_resolved_locale(locale)
    if explicit:
        return explicit

    header_locale = _locale_from_accept_language(accept_language)
    if header_locale:
        return header_locale

    fallback_locale = _to_resolved_locale(fallback)
    return fallback_locale or "en-US"


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _normalize_client_state(value: dict[str, object] | None) -> dict[str, object]:
    if not value:
        return {}

    payload: dict[str, object] = {}

    raw_onboarding = value.get("onboarding")
    if isinstance(raw_onboarding, dict):
        onboarding: dict[str, object] = {}
        if "completed_at" in raw_onboarding:
            completed_at = raw_onboarding.get("completed_at")
            if completed_at is None:
                onboarding["completed_at"] = None
            elif isinstance(completed_at, str):
                normalized_completed_at = completed_at.strip()
                onboarding["completed_at"] = normalized_completed_at or None
            else:
                raise AuthServiceError(
                    code="AUTH_SETTINGS_CLIENT_STATE_INVALID",
                    message="client_state.onboarding.completed_at must be a string or null.",
                    status_code=400,
                )
        if onboarding:
            payload["onboarding"] = onboarding

    raw_home = value.get("home")
    if isinstance(raw_home, dict):
        home: dict[str, object] = {}
        if "selected_date" in raw_home:
            selected_date = raw_home.get("selected_date")
            if selected_date is None:
                home["selected_date"] = None
            elif isinstance(selected_date, str):
                normalized_selected_date = selected_date.strip()
                home["selected_date"] = normalized_selected_date or None
            else:
                raise AuthServiceError(
                    code="AUTH_SETTINGS_CLIENT_STATE_INVALID",
                    message="client_state.home.selected_date must be a string or null.",
                    status_code=400,
                )
        if home:
            payload["home"] = home

    raw_history = value.get("history")
    if isinstance(raw_history, dict):
        history: dict[str, object] = {}
        if "archive_mode" in raw_history:
            archive_mode = raw_history.get("archive_mode")
            if archive_mode is None:
                history["archive_mode"] = None
            elif isinstance(archive_mode, str) and archive_mode in {"list", "map"}:
                history["archive_mode"] = archive_mode
            else:
                raise AuthServiceError(
                    code="AUTH_SETTINGS_CLIENT_STATE_INVALID",
                    message="client_state.history.archive_mode must be 'list', 'map', or null.",
                    status_code=400,
                )
        if "filter" in raw_history:
            raw_filter = raw_history.get("filter")
            if raw_filter is None:
                history["filter"] = None
            elif isinstance(raw_filter, str) and raw_filter in {"all", "ok", "avoid", "ask"}:
                history["filter"] = raw_filter
            else:
                raise AuthServiceError(
                    code="AUTH_SETTINGS_CLIENT_STATE_INVALID",
                    message="client_state.history.filter must be one of all|ok|avoid|ask or null.",
                    status_code=400,
                )
        if "map_region" in raw_history:
            map_region = raw_history.get("map_region")
            if map_region is None:
                history["map_region"] = None
            elif isinstance(map_region, dict):
                latitude = map_region.get("latitude")
                longitude = map_region.get("longitude")
                latitude_delta = map_region.get("latitudeDelta")
                longitude_delta = map_region.get("longitudeDelta")
                if (
                    not _is_finite_number(latitude)
                    or not _is_finite_number(longitude)
                    or not _is_finite_number(latitude_delta)
                    or not _is_finite_number(longitude_delta)
                ):
                    raise AuthServiceError(
                        code="AUTH_SETTINGS_CLIENT_STATE_INVALID",
                        message="client_state.history.map_region must include numeric coordinates and deltas.",
                        status_code=400,
                    )
                history["map_region"] = {
                    "latitude": float(latitude),
                    "longitude": float(longitude),
                    "latitudeDelta": float(latitude_delta),
                    "longitudeDelta": float(longitude_delta),
                }
            else:
                raise AuthServiceError(
                    code="AUTH_SETTINGS_CLIENT_STATE_INVALID",
                    message="client_state.history.map_region must be an object or null.",
                    status_code=400,
                )
        if history:
            payload["history"] = history

    return payload


def _merge_client_state(
    current: dict[str, object],
    patch: dict[str, object],
) -> dict[str, object]:
    if not patch:
        return _normalize_client_state(current)

    merged = _normalize_client_state(current)
    normalized_patch = _normalize_client_state(patch)
    for section in ("onboarding", "home", "history"):
        patch_section = normalized_patch.get(section)
        if not isinstance(patch_section, dict):
            continue
        current_section = merged.get(section)
        next_section = dict(current_section) if isinstance(current_section, dict) else {}
        next_section.update(patch_section)
        merged[section] = next_section
    return _normalize_client_state(merged)


class AuthServiceError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        user_id: str | None = None,
        details: dict[str, object] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.user_id = user_id
        self.details = details or {}


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
    profile_image_url: str | None = None
    profile_image_asset_id: str | None = None
    gender: str | None = None
    birth_year: int | None = None
    disliked_ingredients: list[str] = field(default_factory=list)
    current_trip_start: str | None = None
    current_trip_location: str | None = None
    current_trip_coordinates: dict[str, float] | None = None
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)


@dataclass(slots=True)
class UserAllergiesProfile:
    user_id: str
    allergies: list[str] = field(default_factory=list)
    dietary_restrictions: list[str] = field(default_factory=list)
    severity_map: dict[str, str] = field(default_factory=dict)
    updated_at: datetime = field(default_factory=_utc_now)


@dataclass(slots=True)
class UserSettingsProfile:
    user_id: str
    language: str = "auto"
    target_language: str | None = None
    auto_play_audio: bool = False
    selected_emoji: str | None = None
    client_state: dict[str, object] = field(default_factory=dict)
    updated_at: datetime = field(default_factory=_utc_now)


@dataclass(slots=True)
class UserHistoryRecord:
    history_id: str
    user_id: str
    entry: dict[str, object]
    idempotency_key: str | None
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)


@dataclass(slots=True)
class UserMediaAsset:
    asset_id: str
    user_id: str
    scope: str
    mime_type: str
    size_bytes: int
    sha256: str
    object_key: str
    object_generation: int | None = None
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)
    last_accessed_at: datetime = field(default_factory=_utc_now)


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
    user_id: str
    session_id: str
    expires_at: datetime
    token_digest: str = ""
    token: str | None = None
    created_at: datetime = field(default_factory=_utc_now)
    revoked: bool = False


@dataclass(slots=True)
class RefreshTokenRecord:
    user_id: str
    session_id: str
    family_id: str
    expires_at: datetime
    token_digest: str = ""
    token: str | None = None
    created_at: datetime = field(default_factory=_utc_now)
    status: RefreshStatus = "active"
    used_at: datetime | None = None
    replaced_by_digest: str | None = None
    replaced_by: str | None = None
    replacement_access_token: str | None = None
    grace_redeemed: bool = False


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


AUTH_STATE_SNAPSHOT_VERSION = 2
SUPPORTED_AUTH_STATE_SNAPSHOT_VERSIONS = frozenset({1, AUTH_STATE_SNAPSHOT_VERSION})
AUTH_STATE_DATACLASSES = {
    "AuthUser": AuthUser,
    "UserProfile": UserProfile,
    "UserAllergiesProfile": UserAllergiesProfile,
    "UserSettingsProfile": UserSettingsProfile,
    "UserHistoryRecord": UserHistoryRecord,
    "UserMediaAsset": UserMediaAsset,
    "SessionRecord": SessionRecord,
    "AccessTokenRecord": AccessTokenRecord,
    "RefreshTokenRecord": RefreshTokenRecord,
    "EmailVerificationRecord": EmailVerificationRecord,
    "PasswordResetRecord": PasswordResetRecord,
}


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
        refresh_reuse_grace_seconds: int = 0,
        token_hash_secret: str | None = None,
        email_verification_sender: EmailVerificationSender | None = None,
        allowed_redirects_by_provider: dict[str, set[str]] | None = None,
        state_store: AuthStateStore | None = None,
        projection_store: AuthProjectionStore | None = None,
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
        self.refresh_reuse_grace_seconds = max(0, refresh_reuse_grace_seconds)
        self._token_hash_secret = self._resolve_token_hash_secret_for_constructor(
            token_hash_secret=token_hash_secret,
            state_store=state_store,
        )
        self._email_verification_sender = email_verification_sender or LoggingEmailVerificationSender()
        self.allowed_redirects_by_provider = {
            key: set(value)
            for key, value in (allowed_redirects_by_provider or {}).items()
        }
        self._state_store = state_store
        self._projection_store = projection_store

        self._users_by_id: dict[str, AuthUser] = {}
        self._user_id_by_email: dict[str, str] = {}
        self._provider_subject_to_user_id: dict[str, str] = {}
        self._profiles_by_user_id: dict[str, UserProfile] = {}
        self._allergies_by_user_id: dict[str, UserAllergiesProfile] = {}
        self._settings_by_user_id: dict[str, UserSettingsProfile] = {}
        self._history_by_user_id: dict[str, list[UserHistoryRecord]] = {}
        self._history_idempotency_by_user_id: dict[str, dict[str, str]] = {}
        self._media_assets_by_id: dict[str, UserMediaAsset] = {}

        self._sessions: dict[str, SessionRecord] = {}
        self._session_ids_by_family: dict[str, set[str]] = {}
        self._access_tokens: dict[str, AccessTokenRecord] = {}
        self._refresh_tokens: dict[str, RefreshTokenRecord] = {}
        self._access_tokens_by_session: dict[str, set[str]] = {}
        self._refresh_tokens_by_session: dict[str, set[str]] = {}
        self._refresh_grace_bundles_by_digest: dict[str, dict[str, object]] = {}
        self._email_verifications_by_user_id: dict[str, EmailVerificationRecord] = {}
        self._password_resets_by_user_id: dict[str, PasswordResetRecord] = {}

        self._lock = RLock()
        if self._state_store is not None:
            self._hydrate_from_state_store()

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
        refresh_reuse_grace_seconds = int(
            (get_env("AUTH_REFRESH_REUSE_GRACE_SECONDS", "0") or "0").strip()
        )
        email_verification_sender, email_delivery_mode = build_email_verification_sender_from_env(get_env=get_env)
        if email_delivery_mode == "smtp" and email_verification_debug_code_enabled:
            email_verification_debug_code_enabled = False
        if email_delivery_mode == "smtp" and password_reset_debug_code_enabled:
            password_reset_debug_code_enabled = False
        allowed_redirects_by_provider = {
            "google": _parse_csv(get_env("AUTH_GOOGLE_ALLOWED_REDIRECT_URIS", None)),
            "kakao": _parse_csv(get_env("AUTH_KAKAO_ALLOWED_REDIRECT_URIS", None)),
        }
        database_url = (get_env("DATABASE_URL", "") or "").strip()
        requested_state_backend = (get_env("AUTH_STATE_BACKEND", "") or "").strip().lower()
        resolved_state_backend = requested_state_backend or ("postgres" if database_url else "memory")
        state_store: AuthStateStore | None = None
        projection_store: AuthProjectionStore | None = None
        if resolved_state_backend == "postgres":
            if not database_url:
                raise ValueError("DATABASE_URL is required when AUTH_STATE_BACKEND=postgres.")
            state_store = PostgresAuthStateStore(
                database_url=database_url,
                table_name=(get_env("AUTH_STATE_TABLE", "auth_runtime_state") or "auth_runtime_state").strip(),
                state_key=(get_env("AUTH_STATE_KEY", "default") or "default").strip(),
            )
        elif resolved_state_backend != "memory":
            raise ValueError("AUTH_STATE_BACKEND must be one of: memory, postgres.")

        projection_enabled = (get_env("AUTH_NORMALIZED_PROJECTION_ENABLED", "0") or "0").strip() == "1"
        if projection_enabled:
            if not database_url:
                raise ValueError("DATABASE_URL is required when AUTH_NORMALIZED_PROJECTION_ENABLED=1.")
            projection_store = PostgresAuthProjectionStore(
                database_url=database_url,
                table_prefix=(
                    get_env("AUTH_PROJECTION_TABLE_PREFIX", "auth_projection") or "auth_projection"
                ).strip(),
            )

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
            refresh_reuse_grace_seconds=refresh_reuse_grace_seconds,
            token_hash_secret=cls._resolve_token_hash_secret_from_env(
                get_env=get_env,
                state_store=state_store,
            ),
            email_verification_sender=email_verification_sender,
            allowed_redirects_by_provider=allowed_redirects_by_provider,
            state_store=state_store,
            projection_store=projection_store,
        )

    @property
    def state_backend(self) -> str:
        return "postgres" if self._state_store is not None else "memory"

    @classmethod
    def _resolve_token_hash_secret_from_env(
        cls,
        *,
        get_env: Callable[[str, str | None], str | None],
        state_store: AuthStateStore | None,
    ) -> str:
        explicit_secret = (get_env("AUTH_TOKEN_HASH_SECRET", None) or "").strip()
        if explicit_secret:
            return explicit_secret

        if state_store is not None:
            raise ValueError("AUTH_TOKEN_HASH_SECRET is required for persisted auth token digests.")

        return "foodlens-local-memory-token-hash-secret"

    @staticmethod
    def _resolve_token_hash_secret_for_constructor(
        *,
        token_hash_secret: str | None,
        state_store: AuthStateStore | None,
    ) -> str:
        explicit_secret = (token_hash_secret or "").strip()
        if explicit_secret:
            return explicit_secret

        env_secret = (os.environ.get("AUTH_TOKEN_HASH_SECRET") or "").strip()
        if env_secret:
            return env_secret

        if state_store is not None:
            raise ValueError("AUTH_TOKEN_HASH_SECRET is required for persisted auth token digests.")

        return "foodlens-local-memory-token-hash-secret"

    def _token_digest(self, *, token: str, purpose: str) -> str:
        payload = f"{purpose}:{token}".encode("utf-8")
        return hmac.new(self._token_hash_secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    def _access_token_digest(self, access_token: str) -> str:
        return self._token_digest(token=access_token, purpose="access")

    def _refresh_token_digest(self, refresh_token: str) -> str:
        return self._token_digest(token=refresh_token, purpose="refresh")

    def _hydrate_from_state_store(self) -> None:
        if self._state_store is None:
            return
        snapshot = self._state_store.load()
        if not snapshot:
            return
        migrated = self._restore_runtime_snapshot(snapshot)
        if migrated:
            self._persist_state_unlocked()

    def _persist_state_unlocked(self) -> None:
        if self._state_store is not None:
            snapshot = self._build_runtime_snapshot()
            self._state_store.save(snapshot)
        if self._projection_store is not None:
            try:
                projection_snapshot = self._build_projection_snapshot()
                self._projection_store.save_projection(projection_snapshot)
            except Exception as error:  # pragma: no cover - defensive integration guard
                logger.warning("[Auth] normalized projection save failed: %s", error)

    def _build_projection_snapshot(self) -> dict[str, object]:
        users = sorted(self._users_by_id.values(), key=lambda item: item.user_id)
        profiles = sorted(self._profiles_by_user_id.values(), key=lambda item: item.user_id)
        allergies = sorted(self._allergies_by_user_id.values(), key=lambda item: item.user_id)
        settings = sorted(self._settings_by_user_id.values(), key=lambda item: item.user_id)
        history: list[UserHistoryRecord] = []
        for records in self._history_by_user_id.values():
            history.extend(records)
        history = sorted(history, key=lambda item: item.history_id)
        media_assets = sorted(self._media_assets_by_id.values(), key=lambda item: item.asset_id)
        return {
            "users": [
                {
                    "user_id": user.user_id,
                    "email": user.email,
                    "display_name": user.display_name,
                    "provider": user.provider,
                    "provider_subject": user.provider_subject,
                    "locale": user.locale,
                    "email_verified_at": _to_iso8601(user.email_verified_at) if user.email_verified_at else None,
                    "created_at": _to_iso8601(user.created_at),
                    "updated_at": _to_iso8601(user.updated_at),
                }
                for user in users
            ],
            "profiles": [self._serialize_profile(profile) for profile in profiles],
            "allergies": [self._serialize_allergies(profile) for profile in allergies],
            "settings": [self._serialize_settings(item) for item in settings],
            "history": [self._serialize_history_item(item) for item in history],
            "media_assets": [self._serialize_media_asset(item) for item in media_assets],
        }

    def _build_runtime_snapshot(self) -> dict[str, object]:
        payload = {
            "_users_by_id": self._users_by_id,
            "_user_id_by_email": self._user_id_by_email,
            "_provider_subject_to_user_id": self._provider_subject_to_user_id,
            "_profiles_by_user_id": self._profiles_by_user_id,
            "_allergies_by_user_id": self._allergies_by_user_id,
            "_settings_by_user_id": self._settings_by_user_id,
            "_history_by_user_id": self._history_by_user_id,
            "_history_idempotency_by_user_id": self._history_idempotency_by_user_id,
            "_media_assets_by_id": self._media_assets_by_id,
            "_sessions": self._sessions,
            "_session_ids_by_family": self._session_ids_by_family,
            "_access_tokens": self._access_tokens,
            "_refresh_tokens": self._refresh_tokens,
            "_access_tokens_by_session": self._access_tokens_by_session,
            "_refresh_tokens_by_session": self._refresh_tokens_by_session,
            "_email_verifications_by_user_id": self._email_verifications_by_user_id,
            "_password_resets_by_user_id": self._password_resets_by_user_id,
        }
        return {
            "version": AUTH_STATE_SNAPSHOT_VERSION,
            "saved_at": _to_iso8601(_utc_now()),
            "payload": json.dumps(payload, default=self._snapshot_json_default, ensure_ascii=False, separators=(",", ":")),
        }

    def _restore_runtime_snapshot(self, snapshot: dict[str, object]) -> bool:
        version = int(snapshot.get("version", 0))
        if version not in SUPPORTED_AUTH_STATE_SNAPSHOT_VERSIONS:
            raise AuthStateStoreError(f"Unsupported auth state snapshot version: {version}")

        raw_payload = snapshot.get("payload")
        if not isinstance(raw_payload, str) or not raw_payload.strip():
            raise AuthStateStoreError("Auth state snapshot payload is missing.")

        state = json.loads(raw_payload, object_hook=self._snapshot_json_object_hook)
        if not isinstance(state, dict):
            raise AuthStateStoreError("Auth state snapshot payload has invalid format.")

        self._users_by_id = dict(state.get("_users_by_id", {}))
        self._user_id_by_email = dict(state.get("_user_id_by_email", {}))
        self._provider_subject_to_user_id = dict(state.get("_provider_subject_to_user_id", {}))
        self._profiles_by_user_id = dict(state.get("_profiles_by_user_id", {}))
        self._allergies_by_user_id = dict(state.get("_allergies_by_user_id", {}))
        self._settings_by_user_id = dict(state.get("_settings_by_user_id", {}))
        self._history_by_user_id = dict(state.get("_history_by_user_id", {}))
        self._history_idempotency_by_user_id = dict(state.get("_history_idempotency_by_user_id", {}))
        self._media_assets_by_id = dict(state.get("_media_assets_by_id", {}))
        self._sessions = dict(state.get("_sessions", {}))
        self._session_ids_by_family = dict(state.get("_session_ids_by_family", {}))
        self._access_tokens = dict(state.get("_access_tokens", {}))
        self._refresh_tokens = dict(state.get("_refresh_tokens", {}))
        self._access_tokens_by_session = dict(state.get("_access_tokens_by_session", {}))
        self._refresh_tokens_by_session = dict(state.get("_refresh_tokens_by_session", {}))
        self._email_verifications_by_user_id = dict(state.get("_email_verifications_by_user_id", {}))
        self._password_resets_by_user_id = dict(state.get("_password_resets_by_user_id", {}))
        token_storage_migrated = self._migrate_token_storage_unlocked()
        logger.info("[Auth] restored state snapshot from backend=%s users=%s", self.state_backend, len(self._users_by_id))
        return token_storage_migrated

    def _migrate_token_storage_unlocked(self) -> bool:
        access_migrated, access_key_map = self._migrate_access_token_records_unlocked()
        refresh_migrated, refresh_key_map = self._migrate_refresh_token_records_unlocked()

        index_migrated = False
        self._access_tokens_by_session, access_index_migrated = self._migrate_token_session_index(
            index=self._access_tokens_by_session,
            key_map=access_key_map,
            purpose="access",
        )
        self._refresh_tokens_by_session, refresh_index_migrated = self._migrate_token_session_index(
            index=self._refresh_tokens_by_session,
            key_map=refresh_key_map,
            purpose="refresh",
        )
        index_migrated = access_index_migrated or refresh_index_migrated
        return access_migrated or refresh_migrated or index_migrated

    def _migrate_access_token_records_unlocked(self) -> tuple[bool, dict[str, str]]:
        migrated = False
        key_map: dict[str, str] = {}
        migrated_records: dict[str, AccessTokenRecord] = {}
        for key, record in self._access_tokens.items():
            raw_key = str(key)
            token_digest = record.token_digest
            if not token_digest:
                raw_token = record.token
                if raw_token:
                    token_digest = self._access_token_digest(raw_token)
                elif _is_token_digest(raw_key):
                    token_digest = raw_key
                else:
                    token_digest = self._access_token_digest(raw_key)
                record.token_digest = token_digest
                migrated = True
            if record.token is not None:
                record.token = None
                migrated = True
            key_map[raw_key] = token_digest
            migrated_records[token_digest] = record
            if raw_key != token_digest:
                migrated = True
        self._access_tokens = migrated_records
        return migrated, key_map

    def _migrate_refresh_token_records_unlocked(self) -> tuple[bool, dict[str, str]]:
        migrated = False
        key_map: dict[str, str] = {}
        migrated_records: dict[str, RefreshTokenRecord] = {}
        for key, record in self._refresh_tokens.items():
            raw_key = str(key)
            token_digest = record.token_digest
            if not token_digest:
                raw_token = record.token
                if raw_token:
                    token_digest = self._refresh_token_digest(raw_token)
                elif _is_token_digest(raw_key):
                    token_digest = raw_key
                else:
                    token_digest = self._refresh_token_digest(raw_key)
                record.token_digest = token_digest
                migrated = True
            key_map[raw_key] = token_digest
            migrated_records[token_digest] = record
            if raw_key != token_digest:
                migrated = True

        for record in migrated_records.values():
            if record.replaced_by and not record.replaced_by_digest:
                record.replaced_by_digest = key_map.get(record.replaced_by) or self._refresh_token_digest(record.replaced_by)
                migrated = True
            if record.token is not None:
                record.token = None
                migrated = True
            if record.replaced_by is not None:
                record.replaced_by = None
                migrated = True
            if record.replacement_access_token is not None:
                record.replacement_access_token = None
                migrated = True

        self._refresh_tokens = migrated_records
        return migrated, key_map

    def _migrate_token_session_index(
        self,
        *,
        index: dict[str, set[str]],
        key_map: dict[str, str],
        purpose: str,
    ) -> tuple[dict[str, set[str]], bool]:
        migrated = False
        migrated_index: dict[str, set[str]] = {}
        for session_id, values in index.items():
            migrated_values: set[str] = set()
            for value in values:
                raw_value = str(value)
                token_digest = key_map.get(raw_value)
                if token_digest is None:
                    if _is_token_digest(raw_value):
                        token_digest = raw_value
                    elif purpose == "access":
                        token_digest = self._access_token_digest(raw_value)
                    else:
                        token_digest = self._refresh_token_digest(raw_value)
                    migrated = True
                if token_digest != raw_value:
                    migrated = True
                migrated_values.add(token_digest)
            migrated_index[session_id] = migrated_values
        return migrated_index, migrated

    @staticmethod
    def _snapshot_json_default(value: object) -> object:
        if isinstance(value, datetime):
            return {"__fl_datetime__": _to_iso8601(value)}
        if isinstance(value, set):
            return {"__fl_set__": sorted(str(item) for item in value)}
        if is_dataclass(value):
            payload = asdict(value)
            payload["__fl_dataclass__"] = value.__class__.__name__
            return payload
        raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")

    @staticmethod
    def _snapshot_json_object_hook(raw: dict[str, object]) -> object:
        if "__fl_datetime__" in raw:
            value = raw.get("__fl_datetime__")
            if isinstance(value, str):
                return _from_iso8601(value)
            raise AuthStateStoreError("Invalid datetime value in auth state snapshot.")
        if "__fl_set__" in raw:
            value = raw.get("__fl_set__")
            if isinstance(value, list):
                return set(str(item) for item in value)
            raise AuthStateStoreError("Invalid set value in auth state snapshot.")
        data_class_name = raw.get("__fl_dataclass__")
        if isinstance(data_class_name, str):
            payload = dict(raw)
            payload.pop("__fl_dataclass__", None)
            klass = AUTH_STATE_DATACLASSES.get(data_class_name)
            if klass is None:
                raise AuthStateStoreError(f"Unknown dataclass marker in auth state snapshot: {data_class_name}")
            return klass(**payload)
        return raw

    def signup_email(
        self,
        *,
        email: str,
        password: str,
        display_name: str | None,
        locale: str | None,
        accept_language: str | None = None,
        device_id: str | None = None,
    ) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        self._validate_email(normalized_email)
        self._validate_password(password)
        normalized_display_name = display_name.strip() if display_name else None
        normalized_locale = _normalize_resolved_locale(
            locale,
            accept_language,
            fallback="en-US",
        )
        created_new_user = False
        verification_record: EmailVerificationRecord | None = None
        verification_code = ""
        user: AuthUser

        with self._lock:
            user_id = self._user_id_by_email.get(normalized_email)
            if user_id:
                existing_user = self._users_by_id[user_id]
                can_reissue_verification = (
                    self.email_verification_required
                    and existing_user.provider == "email"
                    and existing_user.email_verified_at is None
                )
                if not can_reissue_verification:
                    raise AuthServiceError(
                        code="AUTH_EMAIL_ALREADY_EXISTS",
                        message="Email is already registered.",
                        status_code=409,
                        user_id=existing_user.user_id,
                    )

                existing_user.password_salt, existing_user.password_hash = self._create_password_credentials(password)
                if normalized_display_name is not None:
                    existing_user.display_name = normalized_display_name
                existing_user.locale = normalized_locale
                existing_user.updated_at = _utc_now()
                profile = self._profiles_by_user_id.get(existing_user.user_id)
                if profile is not None:
                    profile.display_name = existing_user.display_name
                    profile.locale = existing_user.locale
                    profile.updated_at = existing_user.updated_at
                user = existing_user
            else:
                user = self._create_user(
                    email=normalized_email,
                    display_name=normalized_display_name,
                    provider="email",
                    provider_subject=None,
                    locale=normalized_locale,
                    password=password,
                    email_verified_at=None if self.email_verification_required else _utc_now(),
                )
                created_new_user = True

            if not self.email_verification_required:
                bundle = self._create_session_bundle(user=user, provider="email", device_id=device_id)
                self._persist_state_unlocked()
                return bundle

            verification_record, verification_code = self._issue_email_verification(user=user)
            challenge_payload = self._serialize_email_verification_challenge(
                user=user,
                record=verification_record,
            )
            if self.email_verification_debug_code_enabled:
                challenge_payload["verification_debug_code"] = verification_code
            self._persist_state_unlocked()

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
                if created_new_user and pending_user and pending_user.email_verified_at is None:
                    self._rollback_unverified_user(pending_user)
                    self._persist_state_unlocked()
                elif (
                    not created_new_user
                    and pending_user
                    and pending_user.email_verified_at is None
                    and verification_record is not None
                ):
                    pending_record = self._email_verifications_by_user_id.get(pending_user.user_id)
                    if pending_record and pending_record.verification_id == verification_record.verification_id:
                        self._email_verifications_by_user_id.pop(pending_user.user_id, None)
                        self._persist_state_unlocked()
            raise AuthServiceError(
                code="AUTH_EMAIL_VERIFICATION_DELIVERY_FAILED",
                message="Failed to deliver verification email.",
                status_code=503,
                user_id=user.user_id,
            ) from error

        return challenge_payload

    def request_email_verification(self, *, email: str) -> dict[str, object]:
        normalized_email = self._normalize_email(email)
        self._validate_email(normalized_email)
        verification_record: EmailVerificationRecord | None = None
        verification_code = ""
        user: AuthUser

        with self._lock:
            user_id = self._user_id_by_email.get(normalized_email)
            if not user_id:
                raise AuthServiceError(
                    code="AUTH_EMAIL_VERIFICATION_NOT_FOUND",
                    message="No pending email verification was found.",
                    status_code=404,
                )

            user = self._users_by_id[user_id]
            if user.provider != "email":
                raise AuthServiceError(
                    code="AUTH_PROVIDER_UNSUPPORTED",
                    message="Email verification is not available for this account.",
                    status_code=409,
                    user_id=user.user_id,
                )

            if user.email_verified_at is not None:
                raise AuthServiceError(
                    code="AUTH_EMAIL_ALREADY_VERIFIED",
                    message="Email is already verified.",
                    status_code=409,
                    user_id=user.user_id,
                )

            verification_record, verification_code = self._issue_email_verification(user=user)
            challenge_payload = self._serialize_email_verification_challenge(
                user=user,
                record=verification_record,
            )
            if self.email_verification_debug_code_enabled:
                challenge_payload["verification_debug_code"] = verification_code
            self._persist_state_unlocked()

        try:
            self._email_verification_sender.send_verification_code(
                email=user.email,
                code=verification_code,
                expires_in_seconds=max(1, int((verification_record.expires_at - _utc_now()).total_seconds())),
                user_id=user.user_id,
            )
        except EmailVerificationDeliveryError as error:
            with self._lock:
                pending_record = self._email_verifications_by_user_id.get(user.user_id)
                if pending_record and pending_record.verification_id == verification_record.verification_id:
                    self._email_verifications_by_user_id.pop(user.user_id, None)
                    self._persist_state_unlocked()
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

            bundle = self._create_session_bundle(user=user, provider="email", device_id=device_id)
            self._persist_state_unlocked()
            return bundle

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
                    self._persist_state_unlocked()
                    raise AuthServiceError(
                        code="AUTH_EMAIL_VERIFICATION_LOCKED",
                        message="Too many invalid verification attempts.",
                        status_code=429,
                        user_id=user.user_id,
                    )
                self._persist_state_unlocked()
                raise AuthServiceError(
                    code="AUTH_EMAIL_VERIFICATION_INVALID",
                    message="Invalid verification code.",
                    status_code=400,
                    user_id=user.user_id,
                )

            record.consumed_at = now
            user.email_verified_at = now
            user.updated_at = now
            bundle = self._create_session_bundle(user=user, provider="email", device_id=device_id)
            self._persist_state_unlocked()
            return bundle

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
            self._persist_state_unlocked()

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
                    self._persist_state_unlocked()
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
                    self._persist_state_unlocked()
                    raise AuthServiceError(
                        code="AUTH_PASSWORD_RESET_LOCKED",
                        message="Too many invalid password reset attempts.",
                        status_code=429,
                        user_id=user.user_id,
                    )
                self._persist_state_unlocked()
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
            self._persist_state_unlocked()

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
        locale: str | None = None,
        accept_language: str | None = None,
        device_id: str | None = None,
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
        subject = (provider_user_id or "").strip()
        normalized_email = self._normalize_email(email) if email else None
        if not subject:
            if normalized_email:
                subject = f"email:{normalized_email}"
            else:
                raise AuthServiceError(
                    code="AUTH_PROVIDER_IDENTITY_MISSING",
                    message="Provider identity could not be verified.",
                    status_code=400,
                )
        provider_key = f"{provider_normalized}:{subject}"
        resolved_locale = _normalize_resolved_locale(
            locale,
            accept_language,
            fallback="en-US",
        )

        with self._lock:
            user_id = self._provider_subject_to_user_id.get(provider_key)
            user: AuthUser
            if user_id:
                user = self._users_by_id[user_id]
            else:
                normalized_email = normalized_email or self._normalize_email(
                    f"{provider_normalized}_{subject}@foodlens.local"
                )
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
                        locale=resolved_locale,
                        password=None,
                        email_verified_at=_utc_now(),
                    )
                self._provider_subject_to_user_id[provider_key] = user.user_id

            if user.email_verified_at is None:
                user.email_verified_at = _utc_now()

            bundle = self._create_session_bundle(user=user, provider=provider_normalized, device_id=device_id)
            self._persist_state_unlocked()
            return bundle

    def refresh(self, *, refresh_token: str) -> dict[str, object]:
        now = _utc_now()
        with self._lock:
            self._purge_expired_refresh_grace_bundles_unlocked(now=now)
            refresh_token_digest = self._refresh_token_digest(refresh_token)
            record = self._refresh_tokens.get(refresh_token_digest)
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
                self._persist_state_unlocked()
                raise AuthServiceError(
                    code="AUTH_REFRESH_EXPIRED",
                    message="Refresh token has expired.",
                    status_code=401,
                    user_id=record.user_id,
                )

            if record.status != "active":
                grace_bundle = self._build_grace_refresh_bundle(
                    record=record,
                    refresh_token_digest=refresh_token_digest,
                    now=now,
                )
                if grace_bundle is not None:
                    record.grace_redeemed = True
                    self._refresh_grace_bundles_by_digest.pop(refresh_token_digest, None)
                    self._persist_state_unlocked()
                    return grace_bundle
                if self._refresh_retry_is_within_grace_window(record=record, now=now):
                    raise AuthServiceError(
                        code="AUTH_REFRESH_REUSED",
                        message="Refresh token retry is unavailable. Please use the latest refresh token.",
                        status_code=401,
                        user_id=record.user_id,
                    )
                self._revoke_family(record.family_id, reason="refresh_reuse_detected")
                self._persist_state_unlocked()
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
            record.replaced_by_digest = self._refresh_token_digest(str(bundle["refresh_token"]))
            record.replaced_by = None
            record.replacement_access_token = None
            record.grace_redeemed = False
            if self.refresh_reuse_grace_seconds > 0:
                self._refresh_grace_bundles_by_digest[refresh_token_digest] = dict(bundle)
            self._persist_state_unlocked()
            return bundle

    def logout(self, *, access_token: str | None, refresh_token: str | None) -> int:
        with self._lock:
            session_ids: set[str] = set()
            if access_token:
                access_record = self._access_tokens.get(self._access_token_digest(access_token))
                if access_record is not None:
                    session_ids.add(access_record.session_id)
            if refresh_token:
                refresh_record = self._refresh_tokens.get(self._refresh_token_digest(refresh_token))
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

            self._persist_state_unlocked()
            return revoked_count

    def authenticate_access_token(self, *, access_token: str) -> AuthUser:
        now = _utc_now()
        with self._lock:
            record = self._access_tokens.get(self._access_token_digest(access_token))
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
        display_name: str | None = None,
        profile_image_url: str | None = None,
        profile_image_asset_id: str | None = None,
        gender: str | None = None,
        birth_year: int | None = None,
        disliked_ingredients: list[str] | None = None,
        locale: str | None = None,
        accept_language: str | None = None,
        timezone_name: str | None = None,
        current_trip_start: str | None = None,
        current_trip_location: str | None = None,
        current_trip_coordinates: dict[str, float] | None = None,
        expected_updated_at: str | None = None,
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

            self._assert_expected_updated_at(
                user_id=user_id,
                entity="profile",
                expected_updated_at=expected_updated_at,
                server_payload=self._serialize_profile(profile),
            )

            if display_name is not None:
                profile.display_name = display_name.strip() or None
            if profile_image_url is not None:
                profile.profile_image_url = profile_image_url.strip() or None
            if profile_image_asset_id is not None:
                profile.profile_image_asset_id = profile_image_asset_id.strip() or None
                if profile.profile_image_asset_id:
                    # Asset-backed image takes precedence over raw URL.
                    profile.profile_image_url = None
            if gender is not None:
                normalized_gender = gender.strip().lower()
                profile.gender = normalized_gender or None
            if birth_year is not None:
                profile.birth_year = int(birth_year)
            if disliked_ingredients is not None:
                profile.disliked_ingredients = [
                    value.strip()
                    for value in disliked_ingredients
                    if isinstance(value, str) and value.strip()
                ]
            if locale is not None:
                profile.locale = _normalize_resolved_locale(
                    locale,
                    accept_language,
                    fallback=profile.locale,
                )
            if timezone_name is not None:
                profile.timezone = timezone_name.strip() or profile.timezone
            if current_trip_start is not None:
                profile.current_trip_start = current_trip_start.strip() or None
            if current_trip_location is not None:
                profile.current_trip_location = current_trip_location.strip() or None
            if current_trip_coordinates is not None:
                profile.current_trip_coordinates = {
                    "latitude": float(current_trip_coordinates["latitude"]),
                    "longitude": float(current_trip_coordinates["longitude"]),
                }
            profile.updated_at = _utc_now()

            user = self._users_by_id[user_id]
            user.display_name = profile.display_name
            user.locale = profile.locale
            user.updated_at = profile.updated_at

            payload = self._serialize_profile(profile)
            self._persist_state_unlocked()
            return payload

    def get_allergies(self, *, user_id: str) -> dict[str, object]:
        with self._lock:
            profile = self._allergies_by_user_id.get(user_id)
            if profile is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )
            return self._serialize_allergies(profile)

    def update_allergies(
        self,
        *,
        user_id: str,
        allergies: list[str] | None,
        dietary_restrictions: list[str] | None,
        severity_map: dict[str, str] | None,
        expected_updated_at: str | None = None,
    ) -> dict[str, object]:
        with self._lock:
            profile = self._allergies_by_user_id.get(user_id)
            if profile is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )

            self._assert_expected_updated_at(
                user_id=user_id,
                entity="allergies",
                expected_updated_at=expected_updated_at,
                server_payload=self._serialize_allergies(profile),
            )

            if allergies is not None:
                profile.allergies = [item.strip() for item in allergies if isinstance(item, str) and item.strip()]
            if dietary_restrictions is not None:
                profile.dietary_restrictions = [
                    item.strip()
                    for item in dietary_restrictions
                    if isinstance(item, str) and item.strip()
                ]
            if severity_map is not None:
                profile.severity_map = {
                    str(key).strip(): str(value).strip()
                    for key, value in severity_map.items()
                    if str(key).strip() and str(value).strip()
                }
            profile.updated_at = _utc_now()
            payload = self._serialize_allergies(profile)
            self._persist_state_unlocked()
            return payload

    def get_settings(self, *, user_id: str) -> dict[str, object]:
        with self._lock:
            settings = self._settings_by_user_id.get(user_id)
            if settings is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )
            return self._serialize_settings(settings)

    def update_settings(
        self,
        *,
        user_id: str,
        language: str | None,
        target_language: str | None,
        auto_play_audio: bool | None,
        selected_emoji: str | None,
        client_state: dict[str, object] | None,
        expected_updated_at: str | None = None,
    ) -> dict[str, object]:
        with self._lock:
            settings = self._settings_by_user_id.get(user_id)
            if settings is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )

            self._assert_expected_updated_at(
                user_id=user_id,
                entity="settings",
                expected_updated_at=expected_updated_at,
                server_payload=self._serialize_settings(settings),
            )

            if language is not None:
                normalized_language = _to_canonical_settings_language(language)
                if normalized_language:
                    settings.language = normalized_language
            if target_language is not None:
                normalized_target = _to_canonical_target_language(target_language)
                if target_language.strip():
                    if normalized_target is not None:
                        settings.target_language = normalized_target
                    elif target_language.strip().lower() in {"auto", "gps"}:
                        settings.target_language = None
                else:
                    settings.target_language = None
            if auto_play_audio is not None:
                settings.auto_play_audio = bool(auto_play_audio)
            if selected_emoji is not None:
                normalized_emoji = selected_emoji.strip()
                settings.selected_emoji = normalized_emoji or None
            if client_state is not None:
                settings.client_state = _merge_client_state(settings.client_state, client_state)
            settings.updated_at = _utc_now()
            payload = self._serialize_settings(settings)
            self._persist_state_unlocked()
            return payload

    def get_history(self, *, user_id: str, limit: int | None = None) -> list[dict[str, object]]:
        with self._lock:
            records = self._history_by_user_id.get(user_id)
            if records is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )
            if limit is None or limit <= 0:
                selected = records
            else:
                selected = records[:limit]
            return [self._serialize_history_item(record) for record in selected]

    def append_history(
        self,
        *,
        user_id: str,
        entry: dict[str, object],
        idempotency_key: str | None,
    ) -> dict[str, object]:
        with self._lock:
            records = self._history_by_user_id.get(user_id)
            if records is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )

            normalized_key = (idempotency_key or "").strip() or None
            if normalized_key:
                user_map = self._history_idempotency_by_user_id.setdefault(user_id, {})
                existing_history_id = user_map.get(normalized_key)
                if existing_history_id:
                    for record in records:
                        if record.history_id == existing_history_id:
                            return self._serialize_history_item(record)

            history_record = UserHistoryRecord(
                history_id=_random_id("his"),
                user_id=user_id,
                entry={**entry},
                idempotency_key=normalized_key,
            )
            records.insert(0, history_record)
            if normalized_key:
                self._history_idempotency_by_user_id.setdefault(user_id, {})[normalized_key] = history_record.history_id
            payload = self._serialize_history_item(history_record)
            self._persist_state_unlocked()
            return payload

    def delete_history_item(self, *, user_id: str, history_item_id: str) -> bool:
        with self._lock:
            records = self._history_by_user_id.get(user_id)
            if records is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )

            normalized_history_id = history_item_id.strip()
            if not normalized_history_id:
                return False

            target_index = -1
            for index, record in enumerate(records):
                entry_id = record.entry.get("id") if isinstance(record.entry, dict) else None
                if record.history_id == normalized_history_id or entry_id == normalized_history_id:
                    target_index = index
                    break

            if target_index < 0:
                return False

            deleted = records.pop(target_index)
            user_map = self._history_idempotency_by_user_id.get(user_id)
            if user_map:
                # Clear the direct key first, then defensive cleanup by value.
                if deleted.idempotency_key:
                    user_map.pop(deleted.idempotency_key, None)
                stale_keys = [key for key, value in user_map.items() if value == deleted.history_id]
                for key in stale_keys:
                    user_map.pop(key, None)

            self._persist_state_unlocked()
            return True

    def patch_history_timestamp(
        self,
        *,
        user_id: str,
        history_item_id: str,
        timestamp: str,
        expected_updated_at: str | None = None,
    ) -> dict[str, object]:
        with self._lock:
            records = self._history_by_user_id.get(user_id)
            if records is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )

            normalized_history_id = history_item_id.strip()
            normalized_timestamp = timestamp.strip()
            if not normalized_history_id or not normalized_timestamp:
                raise AuthServiceError(
                    code="AUTH_HISTORY_INVALID_REQUEST",
                    message="history_item_id and timestamp are required.",
                    status_code=400,
                    user_id=user_id,
                )

            target: UserHistoryRecord | None = None
            for item in records:
                entry_id = item.entry.get("id") if isinstance(item.entry, dict) else None
                if item.history_id == normalized_history_id or entry_id == normalized_history_id:
                    target = item
                    break

            if target is None:
                raise AuthServiceError(
                    code="AUTH_HISTORY_NOT_FOUND",
                    message="History item not found.",
                    status_code=404,
                    user_id=user_id,
                )

            try:
                normalized_timestamp = _to_iso8601(_from_iso8601(normalized_timestamp))
            except Exception as exc:
                raise AuthServiceError(
                    code="AUTH_HISTORY_INVALID_TIMESTAMP",
                    message="timestamp must be an ISO-8601 UTC timestamp.",
                    status_code=400,
                    user_id=user_id,
                ) from exc

            self._assert_expected_updated_at(
                user_id=user_id,
                entity="history",
                expected_updated_at=expected_updated_at,
                server_payload=self._serialize_history_item(target),
            )

            next_entry = dict(target.entry)
            next_entry["timestamp"] = normalized_timestamp
            target.entry = next_entry
            target.updated_at = _utc_now()
            payload = self._serialize_history_item(target)
            self._persist_state_unlocked()
            return payload

    def register_media_asset(
        self,
        *,
        user_id: str,
        scope: str,
        mime_type: str,
        size_bytes: int,
        sha256: str,
        object_key: str,
        asset_id: str,
        object_generation: int | None = None,
    ) -> dict[str, object]:
        with self._lock:
            if user_id not in self._users_by_id:
                raise AuthServiceError(
                    code="AUTH_USER_NOT_FOUND",
                    message="User not found.",
                    status_code=404,
                    user_id=user_id,
                )
            now = _utc_now()
            record = UserMediaAsset(
                asset_id=asset_id,
                user_id=user_id,
                scope=scope.strip().lower(),
                mime_type=mime_type.strip().lower(),
                size_bytes=int(size_bytes),
                sha256=sha256.strip().lower(),
                object_key=object_key.strip(),
                object_generation=object_generation,
                created_at=now,
                updated_at=now,
                last_accessed_at=now,
            )
            self._media_assets_by_id[record.asset_id] = record
            payload = self._serialize_media_asset(record)
            self._persist_state_unlocked()
            return payload

    def get_media_asset(
        self,
        *,
        asset_id: str,
        user_id: str | None = None,
    ) -> dict[str, object]:
        with self._lock:
            record = self._media_assets_by_id.get(asset_id.strip())
            if record is None:
                raise AuthServiceError(
                    code="AUTH_MEDIA_NOT_FOUND",
                    message="Media asset not found.",
                    status_code=404,
                    user_id=user_id,
                )
            if user_id and record.user_id != user_id:
                raise AuthServiceError(
                    code="AUTH_MEDIA_FORBIDDEN",
                    message="Media asset access is forbidden.",
                    status_code=403,
                    user_id=user_id,
                )
            return self._serialize_media_asset(record)

    def assert_media_asset_owner(
        self,
        *,
        user_id: str,
        asset_id: str,
    ) -> None:
        self.get_media_asset(asset_id=asset_id, user_id=user_id)

    def touch_media_asset(self, *, asset_id: str) -> dict[str, object]:
        with self._lock:
            record = self._media_assets_by_id.get(asset_id.strip())
            if record is None:
                raise AuthServiceError(
                    code="AUTH_MEDIA_NOT_FOUND",
                    message="Media asset not found.",
                    status_code=404,
                )
            now = _utc_now()
            record.updated_at = now
            record.last_accessed_at = now
            payload = self._serialize_media_asset(record)
            self._persist_state_unlocked()
            return payload

    def update_media_asset_generation(self, *, asset_id: str, object_generation: int) -> dict[str, object]:
        with self._lock:
            record = self._media_assets_by_id.get(asset_id.strip())
            if record is None:
                raise AuthServiceError(
                    code="AUTH_MEDIA_NOT_FOUND",
                    message="Media asset not found.",
                    status_code=404,
                )
            record.object_generation = int(object_generation)
            record.updated_at = _utc_now()
            payload = self._serialize_media_asset(record)
            self._persist_state_unlocked()
            return payload

    def list_media_assets_for_user(self, *, user_id: str) -> list[dict[str, object]]:
        with self._lock:
            if user_id not in self._users_by_id:
                raise AuthServiceError(
                    code="AUTH_USER_NOT_FOUND",
                    message="User not found.",
                    status_code=404,
                    user_id=user_id,
                )
            assets = [item for item in self._media_assets_by_id.values() if item.user_id == user_id]
            assets.sort(key=lambda item: item.created_at)
            return [self._serialize_media_asset(item) for item in assets]

    def list_media_assets(self) -> list[dict[str, object]]:
        with self._lock:
            assets = sorted(self._media_assets_by_id.values(), key=lambda item: item.asset_id)
            return [self._serialize_media_asset(item) for item in assets]

    def delete_media_asset(self, *, asset_id: str) -> bool:
        with self._lock:
            deleted = self._delete_media_asset_unlocked(asset_id.strip())
            if deleted:
                self._persist_state_unlocked()
            return deleted

    def reset_user_data(self, *, user_id: str) -> dict[str, int]:
        with self._lock:
            if user_id not in self._users_by_id:
                raise AuthServiceError(
                    code="AUTH_USER_NOT_FOUND",
                    message="User not found.",
                    status_code=404,
                    user_id=user_id,
                )

            media_asset_ids = [asset.asset_id for asset in self._media_assets_by_id.values() if asset.user_id == user_id]
            deleted_media = 0
            for asset_id in media_asset_ids:
                if self._delete_media_asset_unlocked(asset_id):
                    deleted_media += 1

            history_records = self._history_by_user_id.get(user_id, [])
            deleted_history = len(history_records)
            self._history_by_user_id[user_id] = []
            self._history_idempotency_by_user_id[user_id] = {}

            user = self._users_by_id[user_id]
            user.display_name = None
            user.updated_at = _utc_now()

            profile = self._profiles_by_user_id.get(user_id)
            if profile is not None:
                profile.display_name = None
                profile.profile_image_url = None
                profile.profile_image_asset_id = None
                profile.gender = None
                profile.birth_year = None
                profile.disliked_ingredients = []
                profile.current_trip_start = None
                profile.current_trip_location = None
                profile.current_trip_coordinates = None
                profile.updated_at = user.updated_at

            allergies = self._allergies_by_user_id.get(user_id)
            if allergies is not None:
                allergies.allergies = []
                allergies.dietary_restrictions = []
                allergies.severity_map = {}
                allergies.updated_at = _utc_now()

            settings = self._settings_by_user_id.get(user_id)
            if settings is not None:
                settings.language = "auto"
                settings.target_language = None
                settings.auto_play_audio = False
                settings.selected_emoji = None
                settings.client_state = {}
                settings.updated_at = _utc_now()

            revoked_sessions = self._purge_user_sessions_unlocked(user_id=user_id)
            self._persist_state_unlocked()
            return {
                "deleted_history_count": deleted_history,
                "deleted_media_count": deleted_media,
                "revoked_sessions_count": revoked_sessions,
            }

    def delete_user_account(self, *, user_id: str) -> dict[str, int]:
        with self._lock:
            user = self._users_by_id.get(user_id)
            if user is None:
                raise AuthServiceError(
                    code="AUTH_USER_NOT_FOUND",
                    message="User not found.",
                    status_code=404,
                    user_id=user_id,
                )

            media_asset_ids = [asset.asset_id for asset in self._media_assets_by_id.values() if asset.user_id == user_id]
            deleted_media = 0
            for asset_id in media_asset_ids:
                if self._delete_media_asset_unlocked(asset_id):
                    deleted_media += 1

            deleted_history = len(self._history_by_user_id.get(user_id, []))
            self._history_by_user_id.pop(user_id, None)
            self._history_idempotency_by_user_id.pop(user_id, None)
            self._profiles_by_user_id.pop(user_id, None)
            self._allergies_by_user_id.pop(user_id, None)
            self._settings_by_user_id.pop(user_id, None)
            self._email_verifications_by_user_id.pop(user_id, None)
            self._password_resets_by_user_id.pop(user_id, None)

            revoked_sessions = self._purge_user_sessions_unlocked(user_id=user_id)
            self._users_by_id.pop(user_id, None)
            if self._user_id_by_email.get(user.email) == user_id:
                self._user_id_by_email.pop(user.email, None)
            if user.provider_subject:
                self._provider_subject_to_user_id.pop(f"{user.provider}:{user.provider_subject}", None)

            self._persist_state_unlocked()
            return {
                "deleted_history_count": deleted_history,
                "deleted_media_count": deleted_media,
                "revoked_sessions_count": revoked_sessions,
            }

    def patch_history_image(
        self,
        *,
        user_id: str,
        history_item_id: str,
        image_asset_id: str,
    ) -> dict[str, object]:
        with self._lock:
            records = self._history_by_user_id.get(user_id)
            if records is None:
                raise AuthServiceError(
                    code="AUTH_PROFILE_NOT_FOUND",
                    message="Profile not found.",
                    status_code=404,
                    user_id=user_id,
                )
            normalized_history_id = history_item_id.strip()
            normalized_asset_id = image_asset_id.strip()
            if not normalized_history_id or not normalized_asset_id:
                raise AuthServiceError(
                    code="AUTH_HISTORY_INVALID_REQUEST",
                    message="history_item_id and image_asset_id are required.",
                    status_code=400,
                    user_id=user_id,
                )

            record = self._media_assets_by_id.get(normalized_asset_id)
            if record is None:
                raise AuthServiceError(
                    code="AUTH_MEDIA_NOT_FOUND",
                    message="Media asset not found.",
                    status_code=404,
                    user_id=user_id,
                )
            if record.user_id != user_id:
                raise AuthServiceError(
                    code="AUTH_MEDIA_FORBIDDEN",
                    message="Media asset access is forbidden.",
                    status_code=403,
                    user_id=user_id,
                )

            target: UserHistoryRecord | None = None
            for item in records:
                entry_id = item.entry.get("id") if isinstance(item.entry, dict) else None
                if item.history_id == normalized_history_id or entry_id == normalized_history_id:
                    target = item
                    break

            if target is None:
                raise AuthServiceError(
                    code="AUTH_HISTORY_NOT_FOUND",
                    message="History item not found.",
                    status_code=404,
                    user_id=user_id,
                )

            entry = dict(target.entry)
            entry["image_asset_id"] = normalized_asset_id
            entry.pop("imageUri", None)
            entry.pop("image_render_url", None)
            target.entry = entry
            target.updated_at = _utc_now()
            payload = self._serialize_history_item(target)
            self._persist_state_unlocked()
            return payload

    def _delete_media_asset_unlocked(self, asset_id: str) -> bool:
        record = self._media_assets_by_id.pop(asset_id, None)
        if record is None:
            return False

        profile = self._profiles_by_user_id.get(record.user_id)
        if profile is not None and profile.profile_image_asset_id == asset_id:
            profile.profile_image_asset_id = None
            profile.profile_image_url = None
            profile.updated_at = _utc_now()

        records = self._history_by_user_id.get(record.user_id, [])
        for history in records:
            entry = dict(history.entry)
            if entry.get("image_asset_id") != asset_id:
                continue
            entry.pop("image_asset_id", None)
            entry.pop("imageUri", None)
            entry.pop("image_render_url", None)
            history.entry = entry
            history.updated_at = _utc_now()

        return True

    def _purge_user_sessions_unlocked(self, *, user_id: str) -> int:
        session_ids = [session_id for session_id, session in self._sessions.items() if session.user_id == user_id]
        revoked_count = len(session_ids)
        for session_id in session_ids:
            self._purge_session_unlocked(session_id=session_id)
        return revoked_count

    def _purge_session_unlocked(self, *, session_id: str) -> None:
        session = self._sessions.pop(session_id, None)
        family_id = session.family_id if session is not None else None
        if family_id is not None:
            family_sessions = self._session_ids_by_family.get(family_id)
            if family_sessions is not None:
                family_sessions.discard(session_id)
                if not family_sessions:
                    self._session_ids_by_family.pop(family_id, None)

        access_token_digests = set(self._access_tokens_by_session.pop(session_id, set()))
        for token_digest in access_token_digests:
            self._access_tokens.pop(token_digest, None)

        refresh_token_digests = set(self._refresh_tokens_by_session.pop(session_id, set()))
        for token_digest in refresh_token_digests:
            self._refresh_grace_bundles_by_digest.pop(token_digest, None)
            self._refresh_tokens.pop(token_digest, None)

    def _create_user(
        self,
        *,
        email: str,
        display_name: str | None,
        provider: str,
        provider_subject: str | None,
        locale: str | None,
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
            locale=_normalize_resolved_locale(locale, fallback="en-US"),
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
        self._allergies_by_user_id[user.user_id] = UserAllergiesProfile(user_id=user.user_id)
        self._settings_by_user_id[user.user_id] = UserSettingsProfile(user_id=user.user_id, language="auto")
        self._history_by_user_id[user.user_id] = []
        self._history_idempotency_by_user_id[user.user_id] = {}
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
        self._allergies_by_user_id.pop(user.user_id, None)
        self._settings_by_user_id.pop(user.user_id, None)
        self._history_by_user_id.pop(user.user_id, None)
        self._history_idempotency_by_user_id.pop(user.user_id, None)
        stale_asset_ids = [
            asset_id
            for asset_id, record in self._media_assets_by_id.items()
            if record.user_id == user.user_id
        ]
        for asset_id in stale_asset_ids:
            self._media_assets_by_id.pop(asset_id, None)
        self._users_by_id.pop(user.user_id, None)
        if self._user_id_by_email.get(user.email) == user.user_id:
            self._user_id_by_email.pop(user.email, None)

    def _issue_tokens(self, *, user: AuthUser, session: SessionRecord) -> dict[str, object]:
        now = _utc_now()

        access_token = _random_token("atk")
        access_token_digest = self._access_token_digest(access_token)
        access_record = AccessTokenRecord(
            user_id=user.user_id,
            session_id=session.session_id,
            expires_at=now + timedelta(seconds=self.access_ttl_seconds),
            token_digest=access_token_digest,
        )
        self._access_tokens[access_token_digest] = access_record
        self._access_tokens_by_session.setdefault(session.session_id, set()).add(access_token_digest)

        refresh_token = _random_token("rtk")
        refresh_token_digest = self._refresh_token_digest(refresh_token)
        refresh_record = RefreshTokenRecord(
            user_id=user.user_id,
            session_id=session.session_id,
            family_id=session.family_id,
            expires_at=now + timedelta(seconds=self.refresh_ttl_seconds),
            token_digest=refresh_token_digest,
        )
        self._refresh_tokens[refresh_token_digest] = refresh_record
        self._refresh_tokens_by_session.setdefault(session.session_id, set()).add(refresh_token_digest)

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
        for access_token_digest in self._access_tokens_by_session.get(session_id, set()):
            access_record = self._access_tokens.get(access_token_digest)
            if access_record:
                access_record.revoked = True

        for refresh_token_digest in self._refresh_tokens_by_session.get(session_id, set()):
            self._refresh_grace_bundles_by_digest.pop(refresh_token_digest, None)
            refresh_record = self._refresh_tokens.get(refresh_token_digest)
            if refresh_record and refresh_record.status == "active":
                refresh_record.status = "revoked"

    def _build_grace_refresh_bundle(
        self,
        *,
        record: RefreshTokenRecord,
        refresh_token_digest: str,
        now: datetime,
    ) -> dict[str, object] | None:
        if self.refresh_reuse_grace_seconds <= 0:
            return None
        if record.grace_redeemed:
            return None
        if record.used_at is None or record.replaced_by_digest is None:
            return None
        if now > record.used_at + timedelta(seconds=self.refresh_reuse_grace_seconds):
            return None
        replacement_bundle = self._refresh_grace_bundles_by_digest.get(refresh_token_digest)
        if not replacement_bundle:
            return None
        replacement_refresh_token = replacement_bundle.get("refresh_token")
        replacement_access_token = replacement_bundle.get("access_token")
        if not isinstance(replacement_refresh_token, str) or not isinstance(replacement_access_token, str):
            return None

        session = self._sessions.get(record.session_id)
        if session is None or session.revoked_at is not None:
            return None

        user = self._users_by_id.get(record.user_id)
        if user is None:
            return None

        replacement_refresh_digest = self._refresh_token_digest(replacement_refresh_token)
        if replacement_refresh_digest != record.replaced_by_digest:
            return None
        replacement_refresh = self._refresh_tokens.get(replacement_refresh_digest)
        if replacement_refresh is None:
            return None
        if replacement_refresh.session_id != record.session_id:
            return None
        if replacement_refresh.status != "active":
            return None
        if replacement_refresh.expires_at <= now:
            return None

        replacement_access = self._access_tokens.get(self._access_token_digest(replacement_access_token))
        if replacement_access is None:
            return None
        if replacement_access.session_id != record.session_id:
            return None
        if replacement_access.revoked:
            return None
        if replacement_access.expires_at <= now:
            return None

        expires_in = max(1, int((replacement_access.expires_at - now).total_seconds()))
        return {
            "access_token": replacement_access_token,
            "refresh_token": replacement_refresh_token,
            "expires_in": expires_in,
            "user": self._serialize_user(user),
        }

    def _purge_expired_refresh_grace_bundles_unlocked(self, *, now: datetime) -> None:
        if not self._refresh_grace_bundles_by_digest:
            return
        if self.refresh_reuse_grace_seconds <= 0:
            self._refresh_grace_bundles_by_digest.clear()
            return

        expired_digests: list[str] = []
        for refresh_token_digest in self._refresh_grace_bundles_by_digest:
            record = self._refresh_tokens.get(refresh_token_digest)
            if record is None or record.used_at is None:
                expired_digests.append(refresh_token_digest)
                continue
            expires_at = record.used_at + timedelta(seconds=self.refresh_reuse_grace_seconds)
            if now > expires_at:
                expired_digests.append(refresh_token_digest)

        for refresh_token_digest in expired_digests:
            self._refresh_grace_bundles_by_digest.pop(refresh_token_digest, None)

    def _refresh_retry_is_within_grace_window(self, *, record: RefreshTokenRecord, now: datetime) -> bool:
        if record.status != "used":
            return False
        if self.refresh_reuse_grace_seconds <= 0:
            return False
        if record.grace_redeemed:
            return False
        if record.used_at is None or record.replaced_by_digest is None:
            return False
        return now <= record.used_at + timedelta(seconds=self.refresh_reuse_grace_seconds)

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
            "profile_image_url": profile.profile_image_url,
            "profile_image_asset_id": profile.profile_image_asset_id,
            "gender": profile.gender,
            "birth_year": profile.birth_year,
            "disliked_ingredients": [*profile.disliked_ingredients],
            "locale": profile.locale,
            "timezone": profile.timezone,
            "current_trip_start": profile.current_trip_start,
            "current_trip_location": profile.current_trip_location,
            "current_trip_coordinates": (
                {**profile.current_trip_coordinates}
                if isinstance(profile.current_trip_coordinates, dict)
                else None
            ),
            "created_at": _to_iso8601(profile.created_at),
            "updated_at": _to_iso8601(profile.updated_at),
        }

    def _serialize_allergies(self, profile: UserAllergiesProfile) -> dict[str, object]:
        return {
            "user_id": profile.user_id,
            "allergies": [*profile.allergies],
            "dietary_restrictions": [*profile.dietary_restrictions],
            "severity_map": {**profile.severity_map},
            "updated_at": _to_iso8601(profile.updated_at),
        }

    def _serialize_settings(self, settings: UserSettingsProfile) -> dict[str, object]:
        return {
            "user_id": settings.user_id,
            "language": settings.language,
            "target_language": settings.target_language,
            "auto_play_audio": settings.auto_play_audio,
            "selected_emoji": settings.selected_emoji,
            "client_state": _normalize_client_state(settings.client_state),
            "updated_at": _to_iso8601(settings.updated_at),
        }

    def _serialize_history_item(self, item: UserHistoryRecord) -> dict[str, object]:
        return {
            "id": item.history_id,
            "user_id": item.user_id,
            "entry": {**item.entry},
            "idempotency_key": item.idempotency_key,
            "created_at": _to_iso8601(item.created_at),
            "updated_at": _to_iso8601(item.updated_at),
        }

    def _serialize_media_asset(self, record: UserMediaAsset) -> dict[str, object]:
        return {
            "asset_id": record.asset_id,
            "user_id": record.user_id,
            "scope": record.scope,
            "mime_type": record.mime_type,
            "size_bytes": record.size_bytes,
            "sha256": record.sha256,
            "object_key": record.object_key,
            "object_generation": record.object_generation,
            "created_at": _to_iso8601(record.created_at),
            "updated_at": _to_iso8601(record.updated_at),
            "last_accessed_at": _to_iso8601(record.last_accessed_at),
        }

    def _assert_expected_updated_at(
        self,
        *,
        user_id: str,
        entity: str,
        expected_updated_at: str | None,
        server_payload: dict[str, object],
    ) -> None:
        raw_expected = (expected_updated_at or "").strip()
        if not raw_expected:
            return

        try:
            normalized_expected = _to_iso8601(_from_iso8601(raw_expected))
        except Exception as exc:  # pragma: no cover - defensive parse guard
            raise AuthServiceError(
                code="PHASE2_EXPECTED_VERSION_INVALID",
                message="expected_updated_at must be an ISO-8601 UTC timestamp.",
                status_code=400,
                user_id=user_id,
            ) from exc

        server_updated_at = str(server_payload.get("updated_at") or "").strip()
        if not server_updated_at:
            return
        if normalized_expected == server_updated_at:
            return

        raise AuthServiceError(
            code="PHASE2_CONFLICT",
            message=f"{entity} was updated on another device.",
            status_code=409,
            user_id=user_id,
            details={
                "entity": entity,
                "expected_updated_at": normalized_expected,
                "server_updated_at": server_updated_at,
                "server_payload": server_payload,
            },
        )

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
