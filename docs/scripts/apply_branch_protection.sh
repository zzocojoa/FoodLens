#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   echo "GITHUB_TOKEN=YOUR_PAT" >> .env
#   bash docs/scripts/apply_branch_protection.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${GITHUB_TOKEN:?GITHUB_TOKEN is required (set it in .env or export it)}"

OWNER="zzocojoa"
REPO="FoodLens"
BRANCH="main"

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
        "architecture-overview-check"
      ]
    },
    "enforce_admins": false,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "required_approving_review_count": 1
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
