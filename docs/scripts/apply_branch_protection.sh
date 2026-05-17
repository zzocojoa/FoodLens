#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   echo "GITHUB_TOKEN=YOUR_PAT" >> .env
#   bash docs/scripts/apply_branch_protection.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [[ -z "${GITHUB_TOKEN:-}" && -f "$ENV_FILE" ]]; then
  token_line="$(grep -E '^GITHUB_TOKEN=' "$ENV_FILE" | tail -n 1 || true)"
  if [[ -n "$token_line" ]]; then
    GITHUB_TOKEN="${token_line#GITHUB_TOKEN=}"
    GITHUB_TOKEN="${GITHUB_TOKEN%\"}"
    GITHUB_TOKEN="${GITHUB_TOKEN#\"}"
    export GITHUB_TOKEN
  fi
fi

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required (set it in .env or export it)}"

OWNER="zzocojoa"
REPO="FoodLens"
BRANCH="main"
MOBILE_E2E_CONTEXT="mobile-e2e"
MOBILE_E2E_WORKFLOW_PATH=".github/workflows/mobile-e2e-release-gate.yml"
STAGING_SMOKE_PR_CONTEXT="staging-integration-smoke-pr-check"
STAGING_SMOKE_WORKFLOW_PATH=".github/workflows/staging-integration-smoke.yml"

# workflow_dispatch는 기본 브랜치에 workflow 파일이 있어야 실행할 수 있다.
echo "Checking default-branch workflow exists for required context: ${MOBILE_E2E_CONTEXT}"
if ! curl --fail-with-body -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${OWNER}/${REPO}/contents/${MOBILE_E2E_WORKFLOW_PATH}?ref=${BRANCH}" \
  >/dev/null; then
  echo ""
  echo "Cannot require ${MOBILE_E2E_CONTEXT}: ${MOBILE_E2E_WORKFLOW_PATH} must exist on ${BRANCH} before applying branch protection."
  exit 1
fi

# staging smoke는 PR에서는 설정/secret 참조를 검증하고, main/release push 또는 main/release workflow_dispatch에서는 free staging deploy readiness를 검증한다.
echo "Checking default-branch workflow exists for required context: ${STAGING_SMOKE_PR_CONTEXT}"
if ! curl --fail-with-body -L \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${OWNER}/${REPO}/contents/${STAGING_SMOKE_WORKFLOW_PATH}?ref=${BRANCH}" \
  >/dev/null; then
  echo ""
  echo "Cannot require ${STAGING_SMOKE_PR_CONTEXT}: ${STAGING_SMOKE_WORKFLOW_PATH} must exist on ${BRANCH} before applying branch protection."
  exit 1
fi

# Backend Media Performance Regression은 baseline 비교가 포함된 PR 필수 컨텍스트다.
curl --fail-with-body -L \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "openapi-contracts",
        "backend-contracts",
        "frontend-contracts",
        "architecture-overview-check",
        "backend-auth-runtime",
        "mobile-auth-runtime",
        "sync-regression",
        "backend-media-performance-regression",
        "bundle-size",
        "mobile-e2e",
        "staging-integration-smoke-pr-check",
        "pr-policy-check",
        "image-hydration-policy"
      ]
    },
    "enforce_admins": false,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "required_approving_review_count": 0
    },
    "restrictions": null,
    "required_linear_history": false,
    "allow_force_pushes": false,
    "allow_deletions": false,
    "block_creations": false,
    "required_conversation_resolution": true,
    "lock_branch": false,
    "allow_fork_syncing": true
  }'

echo ""
echo "Branch protection applied: ${OWNER}/${REPO}:${BRANCH}"
