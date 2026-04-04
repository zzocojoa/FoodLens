#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_ROOT="${ROOT_DIR}/FoodLens/artifacts/phase6/postdeploy-smoke"
RUNSTAMP="${PHASE6_RUN_STAMP:-$(date +%Y%m%d-%H%M%S)}"
ARTIFACT_DIR="${ARTIFACT_ROOT}/${RUNSTAMP}"
SUMMARY_PATH="${ARTIFACT_DIR}/summary.md"
RESULTS_PATH="${ARTIFACT_DIR}/results.tsv"

BASE_URL="${PHASE6_POSTDEPLOY_BASE_URL:-}"
SMOKE_EMAIL="${PHASE6_POSTDEPLOY_SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${PHASE6_POSTDEPLOY_SMOKE_PASSWORD:-}"
RELEASE_LABEL="${PHASE6_RELEASE_LABEL:-}"
ROLLBACK_REFERENCE="${PHASE6_ROLLBACK_REHEARSAL_REFERENCE:-}"
ROLLBACK_VERDICT="${PHASE6_ROLLBACK_REHEARSAL_VERDICT:-}"
ROLLBACK_SUMMARY="${PHASE6_ROLLBACK_REHEARSAL_SUMMARY:-}"

CURRENT_STEP="bootstrap"
FINAL_VERDICT="FAIL"
FAILURE_STEP=""

require_env() {
  local key="$1"
  local value="$2"
  if [[ -z "${value}" ]]; then
    echo "[Phase6 Postdeploy Smoke] missing required env: ${key}"
    exit 1
  fi
}

record_result() {
  local label="$1"
  local status="$2"
  local detail="$3"
  printf '%s\t%s\t%s\n' "${label}" "${status}" "${detail}" >> "${RESULTS_PATH}"
}

assert_status() {
  local label="$1"
  local url="$2"
  local expected_status="$3"
  local authorization_header="$4"
  local headers_path="${ARTIFACT_DIR}/${label}.headers"
  local body_path="${ARTIFACT_DIR}/${label}.body"
  local status_code=""

  if [[ -n "${authorization_header}" ]]; then
    status_code="$(
      curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
        -H "${authorization_header}" \
        -D "${headers_path}" \
        -o "${body_path}" \
        -w '%{http_code}' \
        "${url}"
    )"
  else
    status_code="$(
      curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
        -D "${headers_path}" \
        -o "${body_path}" \
        -w '%{http_code}' \
        "${url}"
    )"
  fi

  if [[ "${status_code}" != "${expected_status}" ]]; then
    echo "[Phase6 Postdeploy Smoke] ${label} expected ${expected_status}, got ${status_code}"
    exit 1
  fi

  record_result "${label}" "PASS" "${status_code}"
}

assert_header_contains() {
  local label="$1"
  local header_name="$2"
  local expected_substring="$3"
  local headers_path="${ARTIFACT_DIR}/${label}.headers"

  if ! awk -v header_name="${header_name}" -v expected_substring="${expected_substring}" '
    BEGIN { IGNORECASE = 1; matched = 0 }
    $0 ~ ("^" header_name ":") && index(tolower($0), tolower(expected_substring)) > 0 { matched = 1 }
    END { exit matched ? 0 : 1 }
  ' "${headers_path}"; then
    echo "[Phase6 Postdeploy Smoke] ${label} missing header ${header_name} containing ${expected_substring}"
    exit 1
  fi
}

post_json_status() {
  local label="$1"
  local url="$2"
  local body_json="$3"
  local authorization_header="$4"
  local headers_path="${ARTIFACT_DIR}/${label}.headers"
  local body_path="${ARTIFACT_DIR}/${label}.body"
  local status_code=""

  if [[ -n "${authorization_header}" ]]; then
    status_code="$(
      curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
        -X POST \
        -H "Content-Type: application/json" \
        -H "${authorization_header}" \
        -D "${headers_path}" \
        -o "${body_path}" \
        -w '%{http_code}' \
        --data "${body_json}" \
        "${url}"
    )"
  else
    status_code="$(
      curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
        -X POST \
        -H "Content-Type: application/json" \
        -D "${headers_path}" \
        -o "${body_path}" \
        -w '%{http_code}' \
        --data "${body_json}" \
        "${url}"
    )"
  fi

  printf '%s\n' "${status_code}"
}

extract_access_token() {
  local body_path="$1"

  python3 - "$body_path" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

token = str(payload.get("access_token") or "").strip()
if not token:
    verification_required = payload.get("verification_required")
    if verification_required:
        raise SystemExit("Smoke login requires a verified email account.")
    raise SystemExit("Login response is missing access_token.")

print(token)
PY
}

resolve_media_render_url() {
  local profile_body_path="$1"
  local history_body_path="$2"

  python3 - "$profile_body_path" "$history_body_path" <<'PY'
import json
import sys

profile_path = sys.argv[1]
history_path = sys.argv[2]

def read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

profile_payload = read_json(profile_path)
history_payload = read_json(history_path)

history_items = history_payload.get("history") or []
for item in history_items:
    if not isinstance(item, dict):
        continue
    entry = item.get("entry") or {}
    if not isinstance(entry, dict):
        continue
    image_render_url = str(entry.get("image_render_url") or entry.get("imageUri") or "").strip()
    if image_render_url:
        print(image_render_url)
        raise SystemExit(0)

profile = profile_payload.get("profile") or {}
if isinstance(profile, dict):
    profile_render_url = str(profile.get("profile_image_render_url") or profile.get("profile_image_url") or "").strip()
    if profile_render_url:
        print(profile_render_url)
        raise SystemExit(0)

raise SystemExit("Smoke account is missing usable media render URL in /me/history and /me/profile.")
PY
}

write_summary() {
  mkdir -p "${ARTIFACT_DIR}"
  {
    printf '# Phase 6 Postdeploy Smoke Summary\n\n'
    printf -- '- Release label: `%s`\n' "${RELEASE_LABEL}"
    printf -- '- Base URL: `%s`\n' "${BASE_URL}"
    printf -- '- Run stamp: `%s`\n' "${RUNSTAMP}"
    printf -- '- Final verdict: `%s`\n' "${FINAL_VERDICT}"
    if [[ -n "${FAILURE_STEP}" ]]; then
      printf -- '- Failure step: `%s`\n' "${FAILURE_STEP}"
    fi
    printf '\n## Smoke Results\n\n'
    printf '| Check | Status | Detail |\n'
    printf '| --- | --- | --- |\n'
    if [[ -f "${RESULTS_PATH}" ]]; then
      while IFS=$'\t' read -r label status detail; do
        printf '| %s | %s | %s |\n' "${label}" "${status}" "${detail}"
      done < "${RESULTS_PATH}"
    fi
    printf '\n## Rollback Rehearsal Evidence\n\n'
    printf -- '- Reference: `%s`\n' "${ROLLBACK_REFERENCE}"
    printf -- '- Verdict: `%s`\n' "${ROLLBACK_VERDICT}"
    printf -- '- Summary: %s\n' "${ROLLBACK_SUMMARY}"
  } > "${SUMMARY_PATH}"
}

on_exit() {
  local exit_code="$1"
  if [[ "${exit_code}" -ne 0 ]]; then
    FAILURE_STEP="${CURRENT_STEP}"
    FINAL_VERDICT="FAIL"
  fi
  write_summary
}

mkdir -p "${ARTIFACT_DIR}"
: > "${RESULTS_PATH}"

trap 'on_exit $?' EXIT

require_env "PHASE6_POSTDEPLOY_BASE_URL" "${BASE_URL}"
require_env "PHASE6_POSTDEPLOY_SMOKE_EMAIL" "${SMOKE_EMAIL}"
require_env "PHASE6_POSTDEPLOY_SMOKE_PASSWORD" "${SMOKE_PASSWORD}"
require_env "PHASE6_RELEASE_LABEL" "${RELEASE_LABEL}"
require_env "PHASE6_ROLLBACK_REHEARSAL_REFERENCE" "${ROLLBACK_REFERENCE}"
require_env "PHASE6_ROLLBACK_REHEARSAL_VERDICT" "${ROLLBACK_VERDICT}"
require_env "PHASE6_ROLLBACK_REHEARSAL_SUMMARY" "${ROLLBACK_SUMMARY}"

BASE_URL="${BASE_URL%/}"

CURRENT_STEP="auth-login"
AUTH_LOGIN_REQUEST="$(python3 - "${SMOKE_EMAIL}" "${SMOKE_PASSWORD}" <<'PY'
import json
import sys

print(json.dumps({"email": sys.argv[1], "password": sys.argv[2]}))
PY
)"
AUTH_LOGIN_STATUS="$(post_json_status "auth-login" "${BASE_URL}/auth/email/login" "${AUTH_LOGIN_REQUEST}" "")"
if [[ "${AUTH_LOGIN_STATUS}" != "200" ]]; then
  echo "[Phase6 Postdeploy Smoke] auth-login expected 200, got ${AUTH_LOGIN_STATUS}"
  exit 1
fi
AUTH_BEARER_TOKEN="$(extract_access_token "${ARTIFACT_DIR}/auth-login.body")"
record_result "auth-login" "PASS" "200"

CURRENT_STEP="root-health"
assert_status "root-health" "${BASE_URL}/" "200" ""

CURRENT_STEP="live-provider-smoke"
AUTH_PUBLIC_BASE_URL="${BASE_URL}" bash "${ROOT_DIR}/backend/scripts/ci_auth_live_provider_smoke.sh" \
  > "${ARTIFACT_DIR}/live-provider-smoke.log" 2>&1
record_result "live-provider-smoke" "PASS" "google-kakao-redirects"

CURRENT_STEP="me-profile"
assert_status "me-profile" "${BASE_URL}/me/profile" "200" "Authorization: Bearer ${AUTH_BEARER_TOKEN}"

CURRENT_STEP="me-allergies"
assert_status "me-allergies" "${BASE_URL}/me/allergies" "200" "Authorization: Bearer ${AUTH_BEARER_TOKEN}"

CURRENT_STEP="me-settings"
assert_status "me-settings" "${BASE_URL}/me/settings" "200" "Authorization: Bearer ${AUTH_BEARER_TOKEN}"

CURRENT_STEP="me-history"
assert_status "me-history" "${BASE_URL}/me/history" "200" "Authorization: Bearer ${AUTH_BEARER_TOKEN}"

CURRENT_STEP="media-render"
MEDIA_RENDER_URL="$(resolve_media_render_url "${ARTIFACT_DIR}/me-profile.body" "${ARTIFACT_DIR}/me-history.body")"
assert_status "media-render" "${MEDIA_RENDER_URL}" "200" ""
assert_header_contains "media-render" "content-type" "image/"
record_result "media-render-header" "PASS" "content-type=image/*"

CURRENT_STEP="rollback-rehearsal"
if [[ "${ROLLBACK_VERDICT}" != "pass" ]]; then
  echo "[Phase6 Postdeploy Smoke] rollback rehearsal verdict must be pass"
  exit 1
fi
record_result "rollback-rehearsal" "PASS" "${ROLLBACK_REFERENCE}"

FINAL_VERDICT="PASS"
echo "[Phase6 Postdeploy Smoke] completed: ${SUMMARY_PATH}"
