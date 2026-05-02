#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


OWNER: str = "zzocojoa"
REPO: str = "FoodLens"
RULESET_NAME: str = "FoodLens release branch quality gates"
RULESET_REF_PATTERN: str = "refs/heads/release/**"
API_BASE_URL: str = "https://api.github.com"
REQUIRED_STATUS_CHECKS: tuple[str, ...] = (
    "openapi-contracts",
    "backend-contracts",
    "frontend-contracts",
    "architecture-overview-check",
    "backend-auth-runtime",
    "mobile-auth-runtime",
    "sync-regression",
    "pr-policy-check",
    "image-hydration-policy",
    "backend-media-performance-regression",
    "bundle-size",
    "mobile-e2e",
    "staging-integration-smoke-pr-check",
)


def _load_dotenv_token(repo_root: Path) -> str | None:
    env_path = repo_root / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped.startswith("GITHUB_TOKEN="):
            continue
        value = stripped.removeprefix("GITHUB_TOKEN=").strip().strip('"').strip("'")
        if value:
            return value
    return None


def _github_token(env: dict[str, str], repo_root: Path) -> str:
    token = (env.get("GITHUB_TOKEN") or "").strip()
    if token:
        return token
    dotenv_token = _load_dotenv_token(repo_root)
    if dotenv_token is not None:
        return dotenv_token
    raise RuntimeError("GITHUB_TOKEN is required in the environment or .env.")


def _request_json(method: str, url: str, token: str, payload: dict[str, Any] | None) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            response_body = response.read().decode("utf-8")
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {method} failed with status {error.code}: {error_body[:500]}") from error
    except URLError as error:
        raise RuntimeError(f"GitHub API {method} failed: {error.reason}") from error
    if not response_body:
        return None
    return json.loads(response_body)


def _rulesets_url() -> str:
    return f"{API_BASE_URL}/repos/{OWNER}/{REPO}/rulesets"


def _ruleset_url(ruleset_id: int) -> str:
    return f"{_rulesets_url()}/{ruleset_id}"


def _required_status_check_payload() -> list[dict[str, str]]:
    return [{"context": context} for context in REQUIRED_STATUS_CHECKS]


def _release_ruleset_payload() -> dict[str, Any]:
    return {
        "name": RULESET_NAME,
        "target": "branch",
        "enforcement": "active",
        "bypass_actors": [],
        "conditions": {
            "ref_name": {
                "include": [RULESET_REF_PATTERN],
                "exclude": [],
            }
        },
        "rules": [
            {
                "type": "pull_request",
                "parameters": {
                    "allowed_merge_methods": ["merge", "squash", "rebase"],
                    "dismiss_stale_reviews_on_push": True,
                    "require_code_owner_review": False,
                    "require_last_push_approval": False,
                    "required_approving_review_count": 0,
                    "required_review_thread_resolution": True,
                },
            },
            {
                "type": "required_status_checks",
                "parameters": {
                    "do_not_enforce_on_create": True,
                    "required_status_checks": _required_status_check_payload(),
                    "strict_required_status_checks_policy": True,
                },
            },
            {"type": "non_fast_forward"},
        ],
    }


def _find_ruleset_id(rulesets: Any) -> int | None:
    if not isinstance(rulesets, list):
        raise RuntimeError("GitHub API returned a non-list ruleset response.")
    for ruleset in rulesets:
        if not isinstance(ruleset, dict):
            continue
        if ruleset.get("name") != RULESET_NAME:
            continue
        ruleset_id = ruleset.get("id")
        if isinstance(ruleset_id, int):
            return ruleset_id
    return None


def apply_release_branch_ruleset(env: dict[str, str], repo_root: Path) -> dict[str, Any]:
    token = _github_token(env, repo_root)
    payload = _release_ruleset_payload()
    rulesets = _request_json("GET", _rulesets_url(), token, None)
    ruleset_id = _find_ruleset_id(rulesets)
    if ruleset_id is None:
        response = _request_json("POST", _rulesets_url(), token, payload)
        action = "created"
    else:
        response = _request_json("PUT", _ruleset_url(ruleset_id), token, payload)
        action = "updated"
    if not isinstance(response, dict):
        raise RuntimeError("GitHub API returned a non-object ruleset response.")
    return {
        "action": action,
        "enforcement": response.get("enforcement"),
        "id": response.get("id"),
        "name": response.get("name"),
        "target": response.get("target"),
    }


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    try:
        summary = apply_release_branch_ruleset(dict(os.environ), repo_root)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
