from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
# Build Trigger: 2026-02-10 12:40 (After Pipeline Credits Increase)
import base64
import logging
import os
import time
from urllib.parse import urlencode
from typing import Any
import requests
from pydantic import BaseModel

from backend.modules.server_bootstrap import (
    decode_upload_to_image,
    initialize_services,
    load_environment,
    log_environment_debug,
)
from backend.modules.analyst_core.prompts import LABEL_2PASS_PROMPT_VERSION
from backend.modules.analyst_core.response_utils import get_safe_fallback_response
from backend.modules.ops.cost_guardrail import (
    CostGuardrailAction,
    CostGuardrailService,
    InMemoryMonthlyUsageStorage,
)
from backend.modules.ops.data_retention import (
    InMemoryRetentionStore,
    JsonFileRetentionStore,
    LocalFileRetentionCleanupAdapter,
    NoOpRetentionCleanupAdapter,
    RetentionCleanupJob,
    RetentionPolicyConfig,
)
from backend.modules.ops.deletion_queue import (
    DeletionQueueConsumer,
    DeletionQueueProducer,
    InMemoryDeletionQueueStorage,
    JsonFileDeletionQueueStorage,
    NoOpDeletionHandler,
)
from backend.modules.ops.rollout_control import (
    InMemoryRolloutStateStore,
    JsonFileRolloutStateStore,
    KpiThresholds,
    LabelRolloutAutoManager,
    LabelRolloutController,
    RolloutConfig,
    evaluate_kpi_gate,
    load_kpi_input_from_env,
)
from backend.modules.quality.label_quality_gate import evaluate_label_image_quality
from backend.modules.runtime_guardrails import (
    EndpointErrorPolicy,
    ErrorCode,
    raise_service_unavailable,
    run_in_threadpool,
    run_with_error_policy,
)
from backend.modules.contracts.analysis_response import AnalysisResponseContract
from backend.modules.contracts.barcode_response import BarcodeLookupResponseContract
from backend.modules.auth import AuthServiceError, InMemoryAuthSessionService

load_environment()
log_environment_debug()

app = FastAPI()

logger = logging.getLogger("foodlens.api")
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")


def _is_openapi_export_mode() -> bool:
    return os.environ.get("OPENAPI_EXPORT_ONLY") == "1"


def _is_label_cost_guardrail_enabled() -> bool:
    return os.environ.get("LABEL_COST_GUARDRAIL_ENABLED", "0").strip() == "1"


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_str(name: str, default: str) -> str:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip() or default


def _is_label_rollout_auto_enabled() -> bool:
    return os.environ.get("LABEL_ROLLOUT_AUTO_ENABLED", "0").strip() == "1"


def _is_label_429_returns_503_enabled() -> bool:
    return os.environ.get("LABEL_429_RETURNS_503_ENABLED", "0").strip() == "1"


@app.on_event("startup")
async def _startup() -> None:
    app.state.auth_service = InMemoryAuthSessionService.from_env(os.environ.get)

    if _is_openapi_export_mode():
        app.state.analyst = None
        app.state.barcode_service = None
        app.state.smart_router = None
        logger.info("[Startup] OPENAPI_EXPORT_ONLY=1, runtime service initialization skipped.")
        return

    analyst, barcode_service, smart_router = initialize_services()
    app.state.analyst = analyst
    app.state.barcode_service = barcode_service
    app.state.smart_router = smart_router
    app.state.label_cost_guardrail = CostGuardrailService(
        InMemoryMonthlyUsageStorage(),
        monthly_budget_usd=_env_float("LABEL_MONTHLY_BUDGET_USD", 10.0),
    )
    app.state.label_rollout_controller = LabelRolloutController(RolloutConfig.from_env())
    if _is_label_rollout_auto_enabled():
        rollout_state_backend = _env_str("LABEL_ROLLOUT_STATE_BACKEND", "file").lower()
        if rollout_state_backend == "memory":
            rollout_state_store = InMemoryRolloutStateStore()
        else:
            rollout_state_store = JsonFileRolloutStateStore(
                _env_str("LABEL_ROLLOUT_STATE_PATH", "/tmp/foodlens_rollout_state.json")
            )
        app.state.label_rollout_auto_manager = LabelRolloutAutoManager(
            rollout_state_store,
            promote_after_passes=max(1, _env_int("LABEL_ROLLOUT_PROMOTE_AFTER_PASSES", 3)),
            rollback_stage=_env_str("LABEL_ROLLOUT_ROLLBACK_STAGE", "rollback-0"),
        )
    else:
        app.state.label_rollout_auto_manager = None
    app.state.label_rollout_kpi_thresholds = KpiThresholds()
    app.state.retention_policy = RetentionPolicyConfig.from_env(os.environ.get)
    retention_store_backend = _env_str("RETENTION_STORE_BACKEND", "memory").lower()
    if retention_store_backend == "file":
        retention_store = JsonFileRetentionStore(_env_str("RETENTION_STORE_PATH", "/tmp/foodlens_retention_store.json"))
    else:
        retention_store = InMemoryRetentionStore()

    retention_delete_backend = _env_str("RETENTION_DELETE_BACKEND", "noop").lower()
    if retention_delete_backend == "local_file":
        delete_roots = [part.strip() for part in _env_str("RETENTION_DELETE_ROOTS", "").split(",") if part.strip()]
        cleanup_adapter = LocalFileRetentionCleanupAdapter(delete_roots)
    else:
        cleanup_adapter = NoOpRetentionCleanupAdapter()

    app.state.retention_cleanup_job = RetentionCleanupJob(
        store=retention_store,
        policy=app.state.retention_policy,
        adapter=cleanup_adapter,
    )
    deletion_queue_backend = _env_str("DELETION_QUEUE_BACKEND", "memory").lower()
    if deletion_queue_backend == "file":
        deletion_storage = JsonFileDeletionQueueStorage(_env_str("DELETION_QUEUE_PATH", "/tmp/foodlens_deletion_queue.json"))
    else:
        deletion_storage = InMemoryDeletionQueueStorage()
    app.state.deletion_queue_producer = DeletionQueueProducer(deletion_storage)
    app.state.deletion_queue_consumer = DeletionQueueConsumer(deletion_storage, NoOpDeletionHandler())


def _service(name: str) -> Any:
    service = getattr(app.state, name, None)
    if service is None:
        raise raise_service_unavailable(name)
    return service

LOCALE_TO_ISO = {
    "ko-kr": "KR",
    "en-us": "US",
    "ja-jp": "JP",
    "zh-hans": "CN",
    "th-th": "TH",
    "vi-vn": "VN",
}

OAUTH_PROVIDER_CONFIG = {
    "google": {
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "client_id_env": "AUTH_GOOGLE_CLIENT_ID",
        "scope_env": "AUTH_GOOGLE_OAUTH_SCOPE",
        "scope_default": "openid email profile",
        "default_app_redirect_uri": "foodlens://oauth/google-callback",
        "callback_path": "/auth/google/callback",
    },
    "kakao": {
        "authorize_url": "https://kauth.kakao.com/oauth/authorize",
        "client_id_env": "AUTH_KAKAO_CLIENT_ID",
        "scope_env": "AUTH_KAKAO_OAUTH_SCOPE",
        "scope_default": "",
        "default_app_redirect_uri": "foodlens://oauth/kakao-callback",
        "callback_path": "/auth/kakao/callback",
    },
}

DEFAULT_APP_LOGOUT_REDIRECT_URI = "foodlens://oauth/logout-complete"
DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS = 15.0


def _oauth_provider_config(provider: str) -> dict[str, str]:
    config = OAUTH_PROVIDER_CONFIG.get(provider)
    if not config:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNSUPPORTED",
            message="Unsupported provider.",
            status_code=400,
        )
    return config


def _parse_csv(raw: str | None) -> set[str]:
    if not raw:
        return set()
    return {part.strip() for part in raw.split(",") if part.strip()}


def _allowed_app_redirect_uris() -> set[str]:
    configured = _parse_csv(os.environ.get("AUTH_APP_ALLOWED_REDIRECT_URIS"))
    if configured:
        return configured
    return {
        str(config["default_app_redirect_uri"])
        for config in OAUTH_PROVIDER_CONFIG.values()
    }


def _resolve_app_redirect_uri(*, provider: str, requested_uri: str | None) -> str:
    config = _oauth_provider_config(provider)
    candidate = (requested_uri or "").strip() or str(config["default_app_redirect_uri"])
    allowed = _allowed_app_redirect_uris()
    if candidate not in allowed:
        raise AuthServiceError(
            code="AUTH_REDIRECT_URI_MISMATCH",
            message="Redirect URI mismatch.",
            status_code=400,
        )
    return candidate


def _allowed_app_logout_redirect_uris() -> set[str]:
    configured = _parse_csv(os.environ.get("AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS"))
    if configured:
        return configured
    return {DEFAULT_APP_LOGOUT_REDIRECT_URI}


def _resolve_app_logout_redirect_uri(*, requested_uri: str | None) -> str:
    candidate = (requested_uri or "").strip() or DEFAULT_APP_LOGOUT_REDIRECT_URI
    allowed = _allowed_app_logout_redirect_uris()
    if candidate not in allowed:
        raise AuthServiceError(
            code="AUTH_REDIRECT_URI_MISMATCH",
            message="Redirect URI mismatch.",
            status_code=400,
        )
    return candidate


def _resolve_public_base_url(request: Request) -> str:
    configured = os.environ.get("AUTH_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    return str(request.base_url).rstrip("/")


def _resolve_provider_callback_uri(*, request: Request, provider: str) -> str:
    config = _oauth_provider_config(provider)
    base_url = _resolve_public_base_url(request)
    return f"{base_url}{config['callback_path']}"


def _resolve_provider_logout_callback_uri(
    *,
    request: Request,
    provider: str,
    app_redirect_uri: str,
) -> str:
    base_url = _resolve_public_base_url(request)
    callback_path = f"/auth/{provider}/logout/callback"
    callback_uri = f"{base_url}{callback_path}"
    return _append_query_params(callback_uri, {"app_redirect_uri": app_redirect_uri})


def _pack_oauth_state(*, state: str, app_redirect_uri: str) -> str:
    encoded = base64.urlsafe_b64encode(app_redirect_uri.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{state}.{encoded}"


def _extract_app_redirect_uri_from_state(state: str | None) -> str | None:
    if not state or "." not in state:
        return None

    encoded = state.rsplit(".", 1)[1]
    padding = "=" * (-len(encoded) % 4)
    try:
        decoded = base64.urlsafe_b64decode(f"{encoded}{padding}").decode("utf-8").strip()
    except Exception:
        return None
    return decoded or None


def _build_oauth_authorize_url(
    *,
    provider: str,
    callback_uri: str,
    packed_state: str,
) -> str:
    config = _oauth_provider_config(provider)
    client_id_env = str(config["client_id_env"])
    client_id = os.environ.get(client_id_env, "").strip()
    if not client_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_MISCONFIGURED",
            message=f"{provider} OAuth client is not configured.",
            status_code=500,
        )

    params: dict[str, str] = {
        "client_id": client_id,
        "redirect_uri": callback_uri,
        "response_type": "code",
        "state": packed_state,
    }

    scope = os.environ.get(str(config["scope_env"]), str(config["scope_default"])).strip()
    if scope:
        params["scope"] = scope

    if provider == "google":
        params["access_type"] = "offline"
        params["include_granted_scopes"] = "true"
        prompt = os.environ.get("AUTH_GOOGLE_OAUTH_PROMPT", "consent").strip()
        if prompt:
            params["prompt"] = prompt

    return f"{config['authorize_url']}?{urlencode(params)}"


def _append_query_params(base_url: str, params: dict[str, str]) -> str:
    delimiter = "&" if "?" in base_url else "?"
    return f"{base_url}{delimiter}{urlencode(params)}"


def _build_provider_logout_url(*, provider: str, provider_logout_callback_uri: str) -> str:
    if provider == "google":
        # Google does not provide a first-party OAuth logout redirect endpoint,
        # so we use the common logout+continue pattern.
        appengine_continue = _append_query_params(
            "https://appengine.google.com/_ah/logout",
            {"continue": provider_logout_callback_uri},
        )
        return _append_query_params(
            "https://accounts.google.com/Logout",
            {"continue": appengine_continue},
        )

    if provider == "kakao":
        client_id = os.environ.get("AUTH_KAKAO_CLIENT_ID", "").strip()
        if not client_id:
            raise AuthServiceError(
                code="AUTH_PROVIDER_MISCONFIGURED",
                message="kakao OAuth client is not configured.",
                status_code=500,
            )
        return _append_query_params(
            "https://kauth.kakao.com/oauth/logout",
            {
                "client_id": client_id,
                "logout_redirect_uri": provider_logout_callback_uri,
            },
        )

    raise AuthServiceError(
        code="AUTH_PROVIDER_UNSUPPORTED",
        message="Unsupported provider.",
        status_code=400,
    )


def _is_kakao_code_verification_enabled() -> bool:
    return os.environ.get("AUTH_KAKAO_CODE_VERIFY_ENABLED", "0").strip() == "1"


def _provider_timeout_seconds() -> float:
    raw_value = (os.environ.get("AUTH_PROVIDER_TIMEOUT_SECONDS") or "").strip()
    if not raw_value:
        return DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS
    try:
        parsed = float(raw_value)
    except ValueError:
        return DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS
    return parsed if parsed > 0 else DEFAULT_AUTH_PROVIDER_TIMEOUT_SECONDS


def _verify_kakao_identity(*, request: Request, code: str) -> tuple[str, str | None]:
    client_id = os.environ.get("AUTH_KAKAO_CLIENT_ID", "").strip()
    if not client_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_MISCONFIGURED",
            message="kakao OAuth client is not configured.",
            status_code=500,
        )

    token_request_data = {
        "grant_type": "authorization_code",
        "client_id": client_id,
        "redirect_uri": _resolve_provider_callback_uri(request=request, provider="kakao"),
        "code": code.strip(),
    }
    client_secret = os.environ.get("AUTH_KAKAO_CLIENT_SECRET", "").strip()
    if client_secret:
        token_request_data["client_secret"] = client_secret

    timeout_seconds = _provider_timeout_seconds()
    try:
        token_response = requests.post(
            "https://kauth.kakao.com/oauth/token",
            data=token_request_data,
            timeout=timeout_seconds,
        )
    except requests.Timeout as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_TIMEOUT",
            message="Provider request timed out.",
            status_code=504,
        ) from error
    except requests.RequestException as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNAVAILABLE",
            message="Provider request failed.",
            status_code=502,
        ) from error

    try:
        token_payload = token_response.json()
    except ValueError as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        ) from error

    if token_response.status_code >= 400:
        provider_error = str(token_payload.get("error", "")).strip().lower()
        if provider_error in {"invalid_grant", "invalid_request"}:
            raise AuthServiceError(
                code="AUTH_PROVIDER_INVALID_CODE",
                message="Missing or invalid authorization code.",
                status_code=400,
            )
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    access_token = str(token_payload.get("access_token", "")).strip()
    if not access_token:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    try:
        profile_response = requests.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=timeout_seconds,
        )
    except requests.Timeout as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_TIMEOUT",
            message="Provider request timed out.",
            status_code=504,
        ) from error
    except requests.RequestException as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_UNAVAILABLE",
            message="Provider request failed.",
            status_code=502,
        ) from error

    try:
        profile_payload = profile_response.json()
    except ValueError as error:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        ) from error

    if profile_response.status_code >= 400:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    provider_user_id = str(profile_payload.get("id", "")).strip()
    if not provider_user_id:
        raise AuthServiceError(
            code="AUTH_PROVIDER_REJECTED",
            message="Provider login failed.",
            status_code=400,
        )

    email: str | None = None
    kakao_account = profile_payload.get("kakao_account")
    if isinstance(kakao_account, dict):
        raw_email = kakao_account.get("email")
        if isinstance(raw_email, str):
            email = raw_email.strip() or None

    return provider_user_id, email


def resolve_prompt_country_code(iso_country_code: str, locale: str | None) -> str:
    """
    Resolve language/country code used by AI prompt.
    Priority: app UI locale override > request iso country code > US fallback.
    """
    if locale:
        mapped = LOCALE_TO_ISO.get(locale.strip().lower())
        if mapped:
            return mapped

    if iso_country_code:
        normalized = iso_country_code.strip().upper()
        if normalized:
            return normalized

    return "US"


class EmailSignupRequest(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    locale: str = "ko-KR"
    device_id: str | None = None


class EmailLoginRequest(BaseModel):
    email: str
    password: str
    device_id: str | None = None


class EmailVerifyRequest(BaseModel):
    email: str
    code: str
    device_id: str | None = None


class OAuthProviderRequest(BaseModel):
    code: str | None = None
    state: str | None = None
    redirect_uri: str | None = None
    error: str | None = None
    provider_user_id: str | None = None
    email: str | None = None
    device_id: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    locale: str | None = None
    timezone: str | None = None


def _request_id(request: Request) -> str:
    return request.headers.get("X-Request-Id") or os.urandom(6).hex()


def _auth_error_to_http_exception(error: AuthServiceError, request_id: str) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail={
            "message": error.message,
            "code": error.code,
            "request_id": request_id,
        },
    )


def _log_auth_failure(
    *,
    request_id: str,
    user_id: str | None,
    provider: str | None,
    code: str,
) -> None:
    logger.warning(
        "[Auth] request failed request_id=%s user_id=%s provider=%s code=%s",
        request_id,
        user_id or "unknown",
        provider or "none",
        code,
    )


def _extract_bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization")
    if not header:
        return None
    prefix = "Bearer "
    if not header.startswith(prefix):
        return None
    token = header[len(prefix) :].strip()
    return token or None


def _resolve_authenticated_user(request: Request, request_id: str):
    auth_service = _service("auth_service")
    access_token = _extract_bearer_token(request)
    if not access_token:
        _log_auth_failure(
            request_id=request_id,
            user_id=None,
            provider=None,
            code="AUTH_TOKEN_MISSING",
        )
        raise HTTPException(
            status_code=401,
            detail={
                "message": "Missing bearer token.",
                "code": "AUTH_TOKEN_MISSING",
                "request_id": request_id,
            },
        )

    try:
        return auth_service.authenticate_access_token(access_token=access_token)
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Food Lens API is running"}

@app.get("/debug/models")
async def debug_models():
    """Trigger model listing debug."""
    analyst = _service("analyst")
    await analyst.debug_list_models()
    return {"status": "triggered", "message": "Check server logs for model list"}


@app.post("/auth/email/signup")
async def auth_email_signup(payload: EmailSignupRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        result = await run_in_threadpool(
            auth_service.signup_email,
            email=payload.email,
            password=payload.password,
            display_name=payload.display_name,
            locale=payload.locale,
            device_id=payload.device_id,
        )
        if result.get("verification_required") is True:
            user = result.get("user") if isinstance(result.get("user"), dict) else {}
            logger.info(
                "[Auth] email verification issued request_id=%s user_id=%s email=%s verification_id=%s",
                request_id,
                user.get("id", "unknown"),
                user.get("email", "unknown"),
                result.get("verification_id", "unknown"),
            )
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="email",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.post("/auth/email/login")
async def auth_email_login(payload: EmailLoginRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        result = auth_service.login_email(
            email=payload.email,
            password=payload.password,
            device_id=payload.device_id,
        )
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="email",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.post("/auth/email/verify")
async def auth_email_verify(payload: EmailVerifyRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        result = auth_service.verify_email(
            email=payload.email,
            code=payload.code,
            device_id=payload.device_id,
        )
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="email",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/auth/google/start")
async def auth_google_start(
    request: Request,
    redirect_uri: str | None = None,
    state: str | None = None,
):
    request_id = _request_id(request)
    try:
        app_redirect_uri = _resolve_app_redirect_uri(provider="google", requested_uri=redirect_uri)
        packed_state = _pack_oauth_state(
            state=(state or os.urandom(8).hex()).strip(),
            app_redirect_uri=app_redirect_uri,
        )
        provider_callback_uri = _resolve_provider_callback_uri(request=request, provider="google")
        authorize_url = _build_oauth_authorize_url(
            provider="google",
            callback_uri=provider_callback_uri,
            packed_state=packed_state,
        )
        return RedirectResponse(url=authorize_url, status_code=302)
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="google",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/auth/google/callback")
async def auth_google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    redirect_uri: str | None = None,
):
    request_id = _request_id(request)
    try:
        requested_redirect = _extract_app_redirect_uri_from_state(state) or redirect_uri
        app_redirect_uri = _resolve_app_redirect_uri(provider="google", requested_uri=requested_redirect)
        params: dict[str, str] = {"request_id": request_id}
        if code:
            params["code"] = code
        if state:
            params["state"] = state
        if error:
            params["error"] = error
        if error_description:
            params["error_description"] = error_description

        return RedirectResponse(url=_append_query_params(app_redirect_uri, params), status_code=302)
    except AuthServiceError as auth_error:
        _log_auth_failure(
            request_id=request_id,
            user_id=auth_error.user_id,
            provider="google",
            code=auth_error.code,
        )
        raise _auth_error_to_http_exception(auth_error, request_id) from auth_error


@app.get("/auth/kakao/start")
async def auth_kakao_start(
    request: Request,
    redirect_uri: str | None = None,
    state: str | None = None,
):
    request_id = _request_id(request)
    try:
        app_redirect_uri = _resolve_app_redirect_uri(provider="kakao", requested_uri=redirect_uri)
        packed_state = _pack_oauth_state(
            state=(state or os.urandom(8).hex()).strip(),
            app_redirect_uri=app_redirect_uri,
        )
        provider_callback_uri = _resolve_provider_callback_uri(request=request, provider="kakao")
        authorize_url = _build_oauth_authorize_url(
            provider="kakao",
            callback_uri=provider_callback_uri,
            packed_state=packed_state,
        )
        return RedirectResponse(url=authorize_url, status_code=302)
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="kakao",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/auth/kakao/callback")
async def auth_kakao_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    redirect_uri: str | None = None,
):
    request_id = _request_id(request)
    try:
        requested_redirect = _extract_app_redirect_uri_from_state(state) or redirect_uri
        app_redirect_uri = _resolve_app_redirect_uri(provider="kakao", requested_uri=requested_redirect)
        params: dict[str, str] = {"request_id": request_id}
        if code:
            params["code"] = code
        if state:
            params["state"] = state
        if error:
            params["error"] = error
        if error_description:
            params["error_description"] = error_description

        return RedirectResponse(url=_append_query_params(app_redirect_uri, params), status_code=302)
    except AuthServiceError as auth_error:
        _log_auth_failure(
            request_id=request_id,
            user_id=auth_error.user_id,
            provider="kakao",
            code=auth_error.code,
        )
        raise _auth_error_to_http_exception(auth_error, request_id) from auth_error


@app.get("/auth/google/logout/start")
async def auth_google_logout_start(
    request: Request,
    redirect_uri: str | None = None,
):
    request_id = _request_id(request)
    try:
        app_redirect_uri = _resolve_app_logout_redirect_uri(requested_uri=redirect_uri)
        provider_logout_callback_uri = _resolve_provider_logout_callback_uri(
            request=request,
            provider="google",
            app_redirect_uri=app_redirect_uri,
        )
        provider_logout_url = _build_provider_logout_url(
            provider="google",
            provider_logout_callback_uri=provider_logout_callback_uri,
        )
        return RedirectResponse(url=provider_logout_url, status_code=302)
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="google",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/auth/google/logout/callback")
async def auth_google_logout_callback(
    request: Request,
    app_redirect_uri: str | None = None,
):
    request_id = _request_id(request)
    try:
        redirect_target = _resolve_app_logout_redirect_uri(requested_uri=app_redirect_uri)
        return RedirectResponse(
            url=_append_query_params(
                redirect_target,
                {
                    "request_id": request_id,
                    "provider": "google",
                    "logout": "ok",
                },
            ),
            status_code=302,
        )
    except AuthServiceError as auth_error:
        _log_auth_failure(
            request_id=request_id,
            user_id=auth_error.user_id,
            provider="google",
            code=auth_error.code,
        )
        raise _auth_error_to_http_exception(auth_error, request_id) from auth_error


@app.get("/auth/kakao/logout/start")
async def auth_kakao_logout_start(
    request: Request,
    redirect_uri: str | None = None,
):
    request_id = _request_id(request)
    try:
        app_redirect_uri = _resolve_app_logout_redirect_uri(requested_uri=redirect_uri)
        provider_logout_callback_uri = _resolve_provider_logout_callback_uri(
            request=request,
            provider="kakao",
            app_redirect_uri=app_redirect_uri,
        )
        provider_logout_url = _build_provider_logout_url(
            provider="kakao",
            provider_logout_callback_uri=provider_logout_callback_uri,
        )
        return RedirectResponse(url=provider_logout_url, status_code=302)
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="kakao",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/auth/kakao/logout/callback")
async def auth_kakao_logout_callback(
    request: Request,
    app_redirect_uri: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    request_id = _request_id(request)
    try:
        redirect_target = _resolve_app_logout_redirect_uri(requested_uri=app_redirect_uri)
        params: dict[str, str] = {
            "request_id": request_id,
            "provider": "kakao",
        }
        if error:
            params["error"] = error
            if error_description:
                params["error_description"] = error_description
        else:
            params["logout"] = "ok"

        return RedirectResponse(
            url=_append_query_params(redirect_target, params),
            status_code=302,
        )
    except AuthServiceError as auth_error:
        _log_auth_failure(
            request_id=request_id,
            user_id=auth_error.user_id,
            provider="kakao",
            code=auth_error.code,
        )
        raise _auth_error_to_http_exception(auth_error, request_id) from auth_error


@app.post("/auth/google")
async def auth_google(payload: OAuthProviderRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        result = auth_service.oauth_login(
            provider="google",
            code=payload.code,
            state=payload.state,
            redirect_uri=payload.redirect_uri,
            error=payload.error,
            provider_user_id=payload.provider_user_id,
            email=payload.email,
            device_id=payload.device_id,
        )
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="google",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.post("/auth/kakao")
async def auth_kakao(payload: OAuthProviderRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        provider_user_id = payload.provider_user_id
        email = payload.email
        if _is_kakao_code_verification_enabled() and payload.code and not payload.error:
            provider_user_id, verified_email = _verify_kakao_identity(request=request, code=payload.code)
            if verified_email:
                email = verified_email

        result = auth_service.oauth_login(
            provider="kakao",
            code=payload.code,
            state=payload.state,
            redirect_uri=payload.redirect_uri,
            error=payload.error,
            provider_user_id=provider_user_id,
            email=email,
            device_id=payload.device_id,
        )
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider="kakao",
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.post("/auth/refresh")
async def auth_refresh(payload: RefreshRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        result = auth_service.refresh(refresh_token=payload.refresh_token)
        result["request_id"] = request_id
        return result
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.post("/auth/logout")
async def auth_logout(payload: LogoutRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    try:
        revoked_count = auth_service.logout(
            access_token=_extract_bearer_token(request),
            refresh_token=payload.refresh_token,
        )
        return {
            "ok": True,
            "revoked_sessions": revoked_count,
            "request_id": request_id,
        }
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=error.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.get("/me/profile")
async def get_me_profile(request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    user = _resolve_authenticated_user(request, request_id)
    try:
        profile = auth_service.get_profile(user_id=user.user_id)
        return {"profile": profile, "request_id": request_id}
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=user.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error


@app.put("/me/profile")
async def put_me_profile(payload: ProfileUpdateRequest, request: Request):
    request_id = _request_id(request)
    auth_service = _service("auth_service")
    user = _resolve_authenticated_user(request, request_id)
    try:
        profile = auth_service.update_profile(
            user_id=user.user_id,
            display_name=payload.display_name,
            locale=payload.locale,
            timezone_name=payload.timezone,
        )
        return {"profile": profile, "request_id": request_id}
    except AuthServiceError as error:
        _log_auth_failure(
            request_id=request_id,
            user_id=user.user_id,
            provider=None,
            code=error.code,
        )
        raise _auth_error_to_http_exception(error, request_id) from error

@app.post("/analyze", response_model=AnalysisResponseContract)
async def analyze_food(
    file: UploadFile = File(...), 
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    async def _operation():
        analyst = _service("analyst")
        contents = await file.read()
        image = await run_in_threadpool(decode_upload_to_image, contents)

        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
        return await run_in_threadpool(
            analyst.analyze_food_json,
            image,
            allergy_info,
            prompt_country_code,
        )

    return await run_with_error_policy(
        endpoint="/analyze",
        policy=EndpointErrorPolicy(code=ErrorCode.ANALYZE_FAILED, status_code=500, user_message="Analyze failed"),
        operation=_operation,
    )

@app.post("/analyze/label", response_model=AnalysisResponseContract)
async def analyze_label(
    request: Request,
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    """
    Perform OCR nutrition analysis on a label image.
    """
    request_id = request.headers.get("X-Request-Id") or os.urandom(4).hex()
    total_started_at = time.perf_counter()

    async def _operation():
        analyst = _service("analyst")
        cost_guardrail = getattr(app.state, "label_cost_guardrail", None)
        rollout_controller = getattr(app.state, "label_rollout_controller", None)
        rollout_auto_manager = getattr(app.state, "label_rollout_auto_manager", None)
        kpi_thresholds = getattr(app.state, "label_rollout_kpi_thresholds", KpiThresholds())
        logger.info(
            "[Server] Label analysis request received request_id=%s locale=%s",
            request_id,
            locale,
        )
        preprocess_started_at = time.perf_counter()
        contents = await file.read()
        image = await run_in_threadpool(decode_upload_to_image, contents)
        preprocess_elapsed_ms = int((time.perf_counter() - preprocess_started_at) * 1000)

        quality = evaluate_label_image_quality(image)
        logger.info(
            "[Server] Label quality gate request_id=%s passed=%s failed_checks=%s metrics={blur:%.2f,contrast:%.2f,text_density:%.4f,glare:%.4f}",
            request_id,
            quality.passed,
            quality.failed_checks,
            quality.metrics.blur_score,
            quality.metrics.contrast_score,
            quality.metrics.text_density_score,
            quality.metrics.glare_ratio,
        )

        if not quality.passed:
            total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
            fallback = get_safe_fallback_response(
                "라벨 사진 품질이 낮아 분석할 수 없습니다. 초점을 맞추고 반사를 줄여 다시 촬영해주세요."
            )
            fallback["request_id"] = request_id
            fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
            fallback["used_model"] = analyst.label_model_name
            logger.info(
                "[Server] Label analysis quality-rejected request_id=%s prompt_version=%s used_model=%s elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
                request_id,
                fallback.get("prompt_version"),
                fallback.get("used_model"),
                preprocess_elapsed_ms,
                0,
                0,
                total_elapsed_ms,
            )
            return fallback

        kpi_input = load_kpi_input_from_env()
        kpi_gate_passed = evaluate_kpi_gate(kpi_input, kpi_thresholds)
        if rollout_controller and rollout_auto_manager:
            auto_config = rollout_auto_manager.reconcile(rollout_controller.config, kpi_gate_passed=kpi_gate_passed)
            rollout_controller = LabelRolloutController(auto_config)
            app.state.label_rollout_controller = rollout_controller
        rollout_decision = (
            rollout_controller.decide(request_id, kpi_gate_passed=kpi_gate_passed)
            if rollout_controller
            else None
        )
        assess_enabled = rollout_decision.route_to_new if rollout_decision else True
        if rollout_decision:
            logger.info(
                "[Server] Label rollout decision request_id=%s stage=%s percentage=%d bucket=%d kpi_gate_passed=%s route_to_new=%s",
                request_id,
                rollout_decision.stage,
                rollout_decision.percentage,
                rollout_decision.bucket,
                rollout_decision.kpi_gate_passed,
                rollout_decision.route_to_new,
            )

        estimated_cost = _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST", 0.02)
        estimated_tokens = _env_int("LABEL_ESTIMATED_TOKENS_PER_REQUEST", 1500)
        if _is_label_cost_guardrail_enabled() and cost_guardrail:
            decision = cost_guardrail.evaluate(projected_cost_usd=estimated_cost)
            logger.info(
                "[Server] Label cost guardrail request_id=%s action=%s ratio=%.3f projected_total_cost_usd=%.4f",
                request_id,
                decision.action,
                decision.ratio,
                decision.projected_total_cost_usd,
            )
            if decision.action == CostGuardrailAction.WARN:
                logger.warning(
                    "[Server] Label cost guardrail warn request_id=%s ratio=%.3f threshold=0.70",
                    request_id,
                    decision.ratio,
                )
            elif decision.action == CostGuardrailAction.DEGRADE:
                assess_enabled = False
                estimated_cost = _env_float("LABEL_ESTIMATED_COST_USD_PER_REQUEST_DEGRADE", 0.012)
                estimated_tokens = _env_int("LABEL_ESTIMATED_TOKENS_PER_REQUEST_DEGRADE", 900)
            elif decision.action == CostGuardrailAction.FALLBACK:
                total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
                fallback = get_safe_fallback_response(
                    "이번 달 라벨 분석 예산 한도에 도달했습니다. 잠시 후 다시 시도해주세요."
                )
                fallback["request_id"] = request_id
                fallback["prompt_version"] = LABEL_2PASS_PROMPT_VERSION
                fallback["used_model"] = analyst.label_model_name
                logger.warning(
                    "[Server] Label analysis budget-fallback request_id=%s prompt_version=%s used_model=%s elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
                    request_id,
                    fallback.get("prompt_version"),
                    fallback.get("used_model"),
                    preprocess_elapsed_ms,
                    0,
                    0,
                    total_elapsed_ms,
                )
                return fallback

        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
        result = await run_in_threadpool(
            analyst.analyze_label_json,
            image,
            allergy_info,
            prompt_country_code,
            locale,
            assess_enabled,
        )
        label_error_type = result.pop("_label_error_type", None) if isinstance(result, dict) else None
        label_chargeable = bool(result.pop("_label_chargeable", True)) if isinstance(result, dict) else True
        label_timings = result.pop("_label_timings", {}) if isinstance(result, dict) else {}
        extract_elapsed_ms = int(label_timings.get("extract_ms", 0))
        assess_elapsed_ms = int(label_timings.get("assess_ms", 0))
        total_elapsed_ms = int((time.perf_counter() - total_started_at) * 1000)
        result["request_id"] = request_id

        if label_error_type == "quota_exhausted_429" and _is_label_429_returns_503_enabled():
            logger.warning(
                "[Server] Label analysis quota-429 request_id=%s returning=503 elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
                request_id,
                preprocess_elapsed_ms,
                extract_elapsed_ms,
                assess_elapsed_ms,
                total_elapsed_ms,
            )
            raise HTTPException(
                status_code=503,
                detail={
                    "message": "Label analysis is temporarily rate-limited. Please retry shortly.",
                    "code": ErrorCode.ANALYZE_LABEL_FAILED,
                    "request_id": request_id,
                },
            )

        logger.info(
            "[Server] Label analysis completed request_id=%s prompt_version=%s used_model=%s elapsed_ms={preprocess:%d,extract:%d,assess:%d,total:%d}",
            request_id,
            result.get("prompt_version"),
            result.get("used_model"),
            preprocess_elapsed_ms,
            extract_elapsed_ms,
            assess_elapsed_ms,
            total_elapsed_ms,
        )
        if _is_label_cost_guardrail_enabled() and cost_guardrail and label_chargeable:
            usage = cost_guardrail.record(cost_usd=estimated_cost, tokens=estimated_tokens)
            logger.info(
                "[Server] Label cost usage updated request_id=%s month=%s total_cost_usd=%.4f total_tokens=%d",
                request_id,
                usage.period_key,
                usage.total_cost_usd,
                usage.total_tokens,
            )
        elif _is_label_cost_guardrail_enabled() and cost_guardrail:
            logger.info(
                "[Server] Label cost usage skipped request_id=%s reason=non_chargeable_result",
                request_id,
            )
        return result

    return await run_with_error_policy(
        endpoint="/analyze/label",
        policy=EndpointErrorPolicy(
            code=ErrorCode.ANALYZE_LABEL_FAILED,
            status_code=500,
            user_message="Label analysis failed",
        ),
        operation=_operation,
    )

@app.post("/analyze/smart", response_model=AnalysisResponseContract)
async def analyze_smart(
    file: UploadFile = File(...),
    allergy_info: str = Form("None"),
    iso_country_code: str = Form("US"),
    locale: str | None = Form(None),
):
    """
    Smart routing endpoint for Gallery uploads.
    Classifies image (Food vs Label) and routes to specific analysis.
    """
    async def _operation():
        smart_router = _service("smart_router")
        logger.info("[Server] Smart analysis request received.")
        contents = await file.read()
        image = await run_in_threadpool(decode_upload_to_image, contents)

        prompt_country_code = resolve_prompt_country_code(iso_country_code, locale)
        return await smart_router.route_analysis(
            image=image,
            allergy_info=allergy_info,
            iso_country_code=prompt_country_code,
            locale=locale,
        )

    return await run_with_error_policy(
        endpoint="/analyze/smart",
        policy=EndpointErrorPolicy(
            code=ErrorCode.ANALYZE_SMART_FAILED,
            status_code=500,
            user_message="Smart analysis failed",
        ),
        operation=_operation,
    )

@app.post("/lookup/barcode", response_model=BarcodeLookupResponseContract)
async def lookup_barcode(
    request: Request,
    barcode: str = Form(...),
    allergy_info: str = Form("None"),
    locale: str | None = Form(None),
):
    """
    Lookup product by barcode.
    Full SoC Implementation: Controller -> Service -> Infrastructure (DataGo/OFF)
    If ingredients are found and user has allergies, run Gemini allergen analysis.
    """
    request_id = request.headers.get("X-Request-Id") or os.urandom(4).hex()
    started_at = time.perf_counter()
    try:
        barcode_service = _service("barcode_service")
        logger.info(
            "[Server] Lookup request request_id=%s barcode=%s allergy_info=%s locale=%s",
            request_id,
            barcode,
            allergy_info,
            locale,
        )
        lookup_started_at = time.perf_counter()
        result = await barcode_service.get_product_info(barcode)
        logger.info(
            "[Server] Barcode source lookup done request_id=%s elapsed_ms=%d found=%s",
            request_id,
            int((time.perf_counter() - lookup_started_at) * 1000),
            bool(result),
        )
        
        if not result:
            logger.info(
                "[Server] Lookup complete request_id=%s elapsed_ms=%d found=false",
                request_id,
                int((time.perf_counter() - started_at) * 1000),
            )
            return {"found": False, "message": "Product not found in any database"}
        
        # Run allergen analysis if ingredients exist and user has allergies
        if result.get("ingredients") and allergy_info and allergy_info.lower() != "none":
            logger.info(
                "[Server] Running allergen analysis request_id=%s ingredient_count=%d",
                request_id,
                len(result["ingredients"]),
            )
            analyst = _service("analyst")
            analysis_started_at = time.perf_counter()
            allergen_result = await run_in_threadpool(
                analyst.analyze_barcode_ingredients,
                result["ingredients"],
                allergy_info,
            )
            logger.info(
                "[Server] Allergen analysis done request_id=%s elapsed_ms=%d",
                request_id,
                int((time.perf_counter() - analysis_started_at) * 1000),
            )
            
            # Merge allergen analysis into result
            result["safetyStatus"] = allergen_result.get("safetyStatus", "SAFE")
            result["coachMessage"] = allergen_result.get("coachMessage", "")
            
            # Replace simple string list with enriched ingredient objects
            result["ingredients"] = allergen_result.get("ingredients", result["ingredients"])
        logger.info(
            "[Server] Lookup complete request_id=%s elapsed_ms=%d found=true",
            request_id,
            int((time.perf_counter() - started_at) * 1000),
        )
        return {"found": True, "data": result}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "[Server] Barcode Lookup Error request_id=%s code=%s error=%s",
            request_id,
            ErrorCode.BARCODE_LOOKUP_FAILED,
            e,
        )
        raise HTTPException(
            status_code=502,
            detail={
                "message": "Barcode lookup failed",
                "code": ErrorCode.BARCODE_LOOKUP_FAILED,
                "request_id": request_id,
            },
        ) from e

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
