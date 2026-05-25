#!/usr/bin/env python3
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
AUTH_SERVICE_PATH = REPO_ROOT / "backend" / "modules" / "auth" / "service.py"
SERVER_PATH = REPO_ROOT / "backend" / "server.py"


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
        'subject = f"email:{normalized_email}"',
    ]
    for snippet in required_snippets:
        if snippet not in block:
            return _fail(f"missing required oauth identity guard snippet: {snippet}")

    server_source = SERVER_PATH.read_text(encoding="utf-8")
    result_start = server_source.find("def _build_oauth_provider_login_result(")
    if result_start < 0:
        return _fail("_build_oauth_provider_login_result definition not found.")

    result_end = server_source.find("\ndef _decorate_profile_media(", result_start)
    if result_end < 0:
        return _fail("_decorate_profile_media definition not found after OAuth login result builder.")

    result_block = server_source[result_start:result_end]
    if "if verified_email:" in result_block:
        return _fail("verified OAuth path must not keep client email when provider omits verified email.")

    verified_identity_snippets = [
        "provider_user_id = verified_provider_user_id",
        "email = verified_email",
    ]
    for snippet in verified_identity_snippets:
        if snippet not in result_block:
            return _fail(f"missing verified oauth identity assignment: {snippet}")

    decision_start = server_source.find("def _should_verify_provider_identity(")
    if decision_start < 0:
        return _fail("_should_verify_provider_identity definition not found.")

    decision_end = server_source.find("\ndef _provider_timeout_seconds(", decision_start)
    if decision_end < 0:
        return _fail("_provider_timeout_seconds definition not found after provider verification decision.")

    decision_block = server_source[decision_start:decision_end]
    google_enabled_index = decision_block.find('provider == "google" and _is_google_code_verification_enabled()')
    kakao_enabled_index = decision_block.find('provider == "kakao" and _is_kakao_code_verification_enabled()')
    client_identity_index = decision_block.find("_has_client_supplied_provider_identity(")
    if google_enabled_index < 0 or kakao_enabled_index < 0 or client_identity_index < 0:
        return _fail("provider verification decision guard snippets not found.")
    if client_identity_index < google_enabled_index or client_identity_index < kakao_enabled_index:
        return _fail("client-supplied identity must not short-circuit enabled provider verification.")

    print("[OAuth Identity Guard] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
