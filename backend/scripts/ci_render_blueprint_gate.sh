#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BLUEPRINT_PATH="${ROOT_DIR}/render.yaml"

if [[ ! -f "${BLUEPRINT_PATH}" ]]; then
  echo "[Render Blueprint Gate] missing file: ${BLUEPRINT_PATH}"
  exit 1
fi

echo "[Render Blueprint Gate] validating ${BLUEPRINT_PATH}"

if command -v rg >/dev/null 2>&1; then
  SEARCH_BIN="rg"
else
  SEARCH_BIN="grep"
fi

require_pattern() {
  local pattern="$1"
  local label="$2"
  if [[ "${SEARCH_BIN}" == "rg" ]]; then
    if rg -n --fixed-strings "${pattern}" "${BLUEPRINT_PATH}" >/dev/null; then
      return
    fi
  else
    if grep -nF "${pattern}" "${BLUEPRINT_PATH}" >/dev/null; then
      return
    fi
  fi
  if [[ "${SEARCH_BIN}" == "grep" ]]; then
    echo "[Render Blueprint Gate] ripgrep not found in runner; used grep fallback."
  fi
  echo "[Render Blueprint Gate] missing required field: ${label}"
  exit 1
}

require_pattern "type: web" "type: web"
require_pattern "env: docker" "env: docker"
require_pattern "dockerfilePath: ./Dockerfile" "dockerfilePath"
require_pattern "healthCheckPath: /" "healthCheckPath"

declared_keys=()
while IFS= read -r line; do
  declared_keys+=("${line}")
done < <(
  awk '
    /^[[:space:]]*-[[:space:]]*key:[[:space:]]*/ {
      key=$3
      gsub(/["'\'']/, "", key)
      print key
    }
  ' "${BLUEPRINT_PATH}"
)

if [[ ${#declared_keys[@]} -eq 0 ]]; then
  echo "[Render Blueprint Gate] no env keys declared in render.yaml"
  exit 1
fi

required_env_keys=(
  DATABASE_URL
  AUTH_STATE_BACKEND
  AUTH_STATE_TABLE
  AUTH_STATE_KEY
  OPENAPI_EXPORT_ONLY
  AUTH_PUBLIC_BASE_URL
  AUTH_APP_ALLOWED_REDIRECT_URIS
  AUTH_APP_ALLOWED_LOGOUT_REDIRECT_URIS
  AUTH_GOOGLE_CLIENT_ID
  AUTH_GOOGLE_CLIENT_SECRET
  AUTH_GOOGLE_CODE_VERIFY_ENABLED
  AUTH_KAKAO_CLIENT_ID
  AUTH_KAKAO_CLIENT_SECRET
  AUTH_KAKAO_CODE_VERIFY_ENABLED
  AUTH_EMAIL_VERIFICATION_REQUIRED
  AUTH_EMAIL_VERIFICATION_DELIVERY_MODE
  AUTH_EMAIL_SMTP_HOST
  AUTH_EMAIL_SMTP_PORT
  AUTH_EMAIL_SMTP_USERNAME
  AUTH_EMAIL_SMTP_PASSWORD
  AUTH_EMAIL_SENDER_FROM
  LABEL_ROLLOUT_ENABLED
  LABEL_ROLLOUT_STAGE
  LABEL_ROLLOUT_KPI_PARSE_SUCCESS
  LABEL_ROLLOUT_KPI_P95_MS
  LABEL_ROLLOUT_KPI_5XX_RATE
  LABEL_ROLLOUT_AUTO_ENABLED
  LABEL_ROLLOUT_PROMOTE_AFTER_PASSES
  LABEL_ROLLOUT_ROLLBACK_STAGE
  LABEL_ROLLOUT_STATE_BACKEND
  LABEL_ROLLOUT_STATE_PATH
  SENTRY_DSN
)

missing_keys=()
for required_key in "${required_env_keys[@]}"; do
  found=0
  for declared_key in "${declared_keys[@]}"; do
    if [[ "${declared_key}" == "${required_key}" ]]; then
      found=1
      break
    fi
  done
  if [[ ${found} -eq 0 ]]; then
    missing_keys+=("${required_key}")
  fi
done

if [[ ${#missing_keys[@]} -gt 0 ]]; then
  printf '[Render Blueprint Gate] missing env keys:\n'
  printf ' - %s\n' "${missing_keys[@]}"
  exit 1
fi

echo "[Render Blueprint Gate] env parity checks passed (${#required_env_keys[@]} required keys)."
