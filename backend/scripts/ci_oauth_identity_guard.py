#!/usr/bin/env python3
import json
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
AUTH_SERVICE_PATH = REPO_ROOT / "backend" / "modules" / "auth" / "service.py"
SERVER_PATH = REPO_ROOT / "backend" / "server.py"
OPENAPI_PATH = REPO_ROOT / "backend" / "contracts" / "openapi.json"
API_CONTRACTS_PATH = REPO_ROOT / "docs" / "contracts" / "api-contracts.md"


def _fail(message: str) -> int:
    print(f"[OAuth Identity Guard] FAIL: {message}")
    return 1


def main() -> int:
    source = AUTH_SERVICE_PATH.read_text(encoding="utf-8")
    start = source.find("def oauth_login(")
    if start < 0:
        return _fail("oauth_login definition not found.")

    end = source.find("\n    def refresh(", start)
    if end < 0:
        return _fail("refresh definition not found after oauth_login.")

    block = source[start:end]
    if "_derive_provider_subject(" in block:
        return _fail("oauth_login must not derive subject from transient code/state.")

    required_snippets = [
        'subject = (provider_user_id or "").strip()',
        "AUTH_PROVIDER_IDENTITY_MISSING",
    ]
    for snippet in required_snippets:
        if snippet not in block:
            return _fail(f"missing required oauth identity guard snippet: {snippet}")

    if 'subject = f"email:{normalized_email}"' in block:
        return _fail("oauth_login must not use email as provider subject fallback.")

    server_source = SERVER_PATH.read_text(encoding="utf-8")
    request_start = server_source.find("class OAuthProviderRequest(BaseModel):")
    if request_start < 0:
        return _fail("OAuthProviderRequest definition not found.")

    request_end = server_source.find("\nclass RefreshRequest(BaseModel):", request_start)
    if request_end < 0:
        return _fail("RefreshRequest definition not found after OAuthProviderRequest.")

    request_block = server_source[request_start:request_end]
    if 'provider_user_id:' in request_block or 'email:' in request_block:
        return _fail("OAuthProviderRequest must not accept client-supplied OAuth identity fields.")
    if 'ConfigDict(extra="ignore")' not in request_block:
        return _fail("OAuthProviderRequest must ignore legacy extra client-supplied fields.")

    result_start = server_source.find("def _build_oauth_provider_login_result(")
    if result_start < 0:
        return _fail("_build_oauth_provider_login_result definition not found.")

    result_end = server_source.find("\ndef _decorate_profile_media(", result_start)
    if result_end < 0:
        return _fail("_decorate_profile_media definition not found after OAuth login result builder.")

    result_block = server_source[result_start:result_end]
    for forbidden_snippet in ("payload.provider_user_id", "payload.email"):
        if forbidden_snippet in result_block:
            return _fail(f"OAuth login builder must not read client identity: {forbidden_snippet}")

    if "if verified_email:" in result_block:
        return _fail("verified OAuth path must not keep client email when provider omits verified email.")

    verified_identity_snippets = [
        "provider_user_id = verified_provider_user_id",
        "email = verified_email",
    ]
    for snippet in verified_identity_snippets:
        if snippet not in result_block:
            return _fail(f"missing verified oauth identity assignment: {snippet}")
    for snippet in ("pending_nonce", "expected_nonce=pending_nonce"):
        if snippet not in result_block:
            return _fail(f"missing Google OAuth pending nonce propagation: {snippet}")

    google_start = server_source.find("def _verify_google_id_token_claims(")
    if google_start < 0:
        return _fail("_verify_google_id_token_claims definition not found.")

    google_end = server_source.find("\ndef resolve_prompt_country_code(", google_start)
    if google_end < 0:
        return _fail("resolve_prompt_country_code definition not found after _verify_google_identity.")

    google_block = server_source[google_start:google_end]
    google_required_snippets = [
        'raw_id_token = token_payload.get("id_token")',
        "google_id_token.verify_oauth2_token(",
        "audience=client_id",
        "clock_skew_in_seconds=GOOGLE_ID_TOKEN_CLOCK_SKEW_SECONDS",
        "AUTH_PROVIDER_ID_TOKEN_MISSING",
        "AUTH_PROVIDER_ID_TOKEN_NONCE_MISSING",
        "AUTH_PROVIDER_ID_TOKEN_NONCE_MISMATCH",
        "hmac.compare_digest(token_nonce, normalized_expected_nonce)",
        "expected_nonce=expected_nonce",
        'provider_user_id = str(id_info.get("sub", "")).strip()',
    ]
    for snippet in google_required_snippets:
        if snippet not in google_block:
            return _fail(f"missing Google ID token nonce verification snippet: {snippet}")
    if "openidconnect.googleapis.com/v1/userinfo" in google_block:
        return _fail("Google OAuth identity must come from verified ID token claims, not userinfo fallback.")

    decision_start = server_source.find("def _should_verify_provider_identity(")
    if decision_start < 0:
        return _fail("_should_verify_provider_identity definition not found.")

    decision_end = server_source.find("\ndef _provider_timeout_seconds(", decision_start)
    if decision_end < 0:
        return _fail("_provider_timeout_seconds definition not found after provider verification decision.")

    decision_block = server_source[decision_start:decision_end]
    google_enabled_index = decision_block.find('provider == "google" and _is_google_code_verification_enabled()')
    kakao_enabled_index = decision_block.find('provider == "kakao" and _is_kakao_code_verification_enabled()')
    if google_enabled_index < 0 or kakao_enabled_index < 0:
        return _fail("provider verification decision guard snippets not found.")
    if "_has_client_supplied_provider_identity(" in decision_block:
        return _fail("client-supplied identity must not influence provider verification decisions.")

    openapi = json.loads(OPENAPI_PATH.read_text(encoding="utf-8"))
    oauth_schema = openapi["components"]["schemas"]["OAuthProviderRequest"]
    oauth_properties = oauth_schema.get("properties", {})
    for forbidden_property in ("email", "provider_user_id"):
        if forbidden_property in oauth_properties:
            return _fail(f"OpenAPI OAuthProviderRequest exposes {forbidden_property}.")

    docs = API_CONTRACTS_PATH.read_text(encoding="utf-8")
    docs_start = docs.find("- `POST /auth/google|kakao`")
    if docs_start < 0:
        return _fail("OAuth request summary not found in API contracts.")
    docs_end = docs.find("- `POST /auth/refresh`", docs_start)
    if docs_end < 0:
        return _fail("OAuth request summary end not found in API contracts.")
    oauth_docs_block = docs[docs_start:docs_end]
    for line in oauth_docs_block.splitlines():
        stripped = line.strip()
        if stripped.startswith("- `code`") and ("provider_user_id" in stripped or "`email" in stripped):
            return _fail("API contracts OAuth request summary exposes client identity fields.")
    if "provider-verified subject" not in docs:
        return _fail("API contracts must document provider-verified subject identity behavior.")
    if "ignored" not in docs:
        return _fail("API contracts must document legacy client identity fields are ignored.")
    google_nonce_docs_snippets = [
        "Google session identity",
        "ID token `nonce` claim",
        "AUTH_PROVIDER_ID_TOKEN_NONCE_MISMATCH",
    ]
    for snippet in google_nonce_docs_snippets:
        if snippet not in docs:
            return _fail(f"API contracts must document Google ID token nonce behavior: {snippet}")

    print("[OAuth Identity Guard] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
