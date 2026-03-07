#!/usr/bin/env python3
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
AUTH_SERVICE_PATH = REPO_ROOT / "backend" / "modules" / "auth" / "service.py"


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

    print("[OAuth Identity Guard] PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
