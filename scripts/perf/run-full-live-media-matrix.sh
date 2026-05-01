#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${FULL_LIVE_MEDIA_MATRIX_ENV_FILE:-${ROOT_DIR}/.env.media-performance.local}"
MAESTRO_ENV_FILE="${FULL_LIVE_MEDIA_MATRIX_MAESTRO_ENV_FILE:-${ROOT_DIR}/FoodLens/.env.maestro.local}"
MATRIX_SCRIPT="${ROOT_DIR}/scripts/perf/run-media-matrix.sh"

LOAD_OVERRIDE_NAMES=(
  K6_MATRIX_VUS
  K6_DURATION
  THINK_TIME_MS
  RENDER_CACHE_MISS_EVERY
  MIN_MEDIA_RENDER_COLD_CANDIDATES
  MIN_RENDER_CACHE_MISS_SAMPLES
  RENDER_P95_THRESHOLD_MS
  RENDER_CACHE_MISS_P95_HARD_THRESHOLD_MS
  RENDER_CACHE_MISS_P95_WARN_THRESHOLD_MS
  PERF_REFRESH_MEDIA_RENDER_URLS
)

capture_env_override() {
  local name="${1}"
  local has_name="HAS_OVERRIDE_${name}"
  local value_name="OVERRIDE_${name}"
  if [[ "${!name+x}" == "x" ]]; then
    printf -v "${has_name}" '%s' "1"
    printf -v "${value_name}" '%s' "${!name}"
  else
    printf -v "${has_name}" '%s' "0"
    printf -v "${value_name}" '%s' ""
  fi
}

restore_env_override() {
  local name="${1}"
  local has_name="HAS_OVERRIDE_${name}"
  local value_name="OVERRIDE_${name}"
  if [[ "${!has_name:-0}" == "1" ]]; then
    export "${name}=${!value_name}"
  fi
}

for override_name in "${LOAD_OVERRIDE_NAMES[@]}"; do
  capture_env_override "${override_name}"
done

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

for override_name in "${LOAD_OVERRIDE_NAMES[@]}"; do
  restore_env_override "${override_name}"
done

MIN_MEDIA_RENDER_COLD_CANDIDATES="${MIN_MEDIA_RENDER_COLD_CANDIDATES:-3}"

if ! [[ "${MIN_MEDIA_RENDER_COLD_CANDIDATES}" =~ ^[1-9][0-9]*$ ]]; then
  echo "[perf-full-live] MIN_MEDIA_RENDER_COLD_CANDIDATES must be a positive integer."
  exit 1
fi

if [[ -f "${MAESTRO_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${MAESTRO_ENV_FILE}"
  set +a
fi

reject_placeholder_value() {
  local name="${1}"
  local value="${2}"
  if [[ "${value}" == *"<"* || "${value}" == *">"* || "${value}" == *"example.invalid"* ]]; then
    echo "[perf-full-live] ${name} still contains a placeholder value."
    exit 1
  fi
}

missing_names=()
for name in BASE_URL MEDIA_RENDER_URL MEDIA_RENDER_CACHE_MISS_URLS_PATH ANALYZE_PATH; do
  if [[ -z "${!name:-}" ]]; then
    missing_names+=("${name}")
  fi
done

if [[ "${#missing_names[@]}" -gt 0 ]]; then
  echo "[perf-full-live] missing required values: ${missing_names[*]}"
  echo "[perf-full-live] create ${ENV_FILE} from scripts/perf/full-live-media-matrix.env.example."
  exit 1
fi

reject_placeholder_value "BASE_URL" "${BASE_URL}"
reject_placeholder_value "MEDIA_RENDER_URL" "${MEDIA_RENDER_URL}"
reject_placeholder_value "MEDIA_RENDER_CACHE_MISS_URLS_PATH" "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}"
reject_placeholder_value "ANALYZE_PATH" "${ANALYZE_PATH}"

resolve_auth_bearer_token() {
  local auth_email="${PERF_AUTH_EMAIL:-${PHASE6_POSTDEPLOY_SMOKE_EMAIL:-${FOODLENS_E2E_EMAIL:-}}}"
  local auth_password="${PERF_AUTH_PASSWORD:-${PHASE6_POSTDEPLOY_SMOKE_PASSWORD:-${FOODLENS_E2E_PASSWORD:-}}}"
  if [[ -z "${auth_email}" && -z "${auth_password}" ]]; then
    return 0
  fi
  if [[ -z "${auth_email}" || -z "${auth_password}" ]]; then
    echo "[perf-full-live] PERF_AUTH_EMAIL/PERF_AUTH_PASSWORD must be set together."
    exit 1
  fi
  reject_placeholder_value "PERF_AUTH_EMAIL" "${auth_email}"
  reject_placeholder_value "PERF_AUTH_PASSWORD" "${auth_password}"
  if ! command -v jq >/dev/null 2>&1; then
    echo "[perf-full-live] jq is required to resolve AUTH_BEARER_TOKEN from PERF_AUTH_EMAIL/PERF_AUTH_PASSWORD."
    exit 1
  fi

  local response_file
  response_file="$(mktemp)"
  local payload
  payload="$(
    jq -cn \
      --arg email "${auth_email}" \
      --arg password "${auth_password}" \
      --arg device_id "foodlens-full-live-k6" \
      '{email: $email, password: $password, device_id: $device_id}'
  )"
  local status
  status="$(
    curl -sS -o "${response_file}" -w "%{http_code}" \
      --connect-timeout 10 \
      --max-time 20 \
      -X POST "${BASE_URL%/}/auth/email/login" \
      -H "Content-Type: application/json" \
      -d "${payload}" || true
  )"
  if [[ "${status}" != "200" ]]; then
    rm -f "${response_file}"
    echo "[perf-full-live] email login failed while resolving AUTH_BEARER_TOKEN. status=${status}"
    exit 1
  fi

  local resolved_token
  resolved_token="$(jq -r '.access_token // .accessToken // .token // empty' "${response_file}")"
  rm -f "${response_file}"
  if [[ -z "${resolved_token}" || "${resolved_token}" == "null" ]]; then
    echo "[perf-full-live] email login did not return an access token."
    exit 1
  fi
  export AUTH_BEARER_TOKEN="${resolved_token}"
  echo "[perf-full-live] AUTH_BEARER_TOKEN resolved from login credentials."
}

resolve_auth_bearer_token

if [[ -z "${AUTH_BEARER_TOKEN:-}" ]]; then
  echo "[perf-full-live] AUTH_BEARER_TOKEN is required unless PERF_AUTH_EMAIL/PERF_AUTH_PASSWORD are set."
  exit 1
fi
reject_placeholder_value "AUTH_BEARER_TOKEN" "${AUTH_BEARER_TOKEN}"

is_signed_media_render_url() {
  local value="${1}"
  [[ "${value}" != *$'\n'* ]] || return 1
  [[ "${value}" != *$'\r'* ]] || return 1
  [[ "${value}" != *$'\t'* ]] || return 1
  [[ "${value}" == http://* || "${value}" == https://* ]] || return 1
  [[ "${value}" == *"/media/render/"* ]] || return 1
  [[ "${value}" == *"?exp="* || "${value}" == *"&exp="* ]] || return 1
  [[ "${value}" == *"?sig="* || "${value}" == *"&sig="* ]] || return 1
}

refresh_media_render_urls() {
  if [[ "${PERF_REFRESH_MEDIA_RENDER_URLS:-1}" != "1" ]]; then
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "[perf-full-live] jq is required to refresh signed media render URLs."
    exit 1
  fi

  local candidates_file
  candidates_file="$(mktemp)"
  local profile_file
  profile_file="$(mktemp)"
  local history_file
  history_file="$(mktemp)"
  local profile_status
  local history_status

  profile_status="$(
    curl -sS -o "${profile_file}" -w "%{http_code}" \
      --connect-timeout 10 \
      --max-time 20 \
      -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
      "${BASE_URL%/}/me/profile" || true
  )"
  history_status="$(
    curl -sS -o "${history_file}" -w "%{http_code}" \
      --connect-timeout 10 \
      --max-time 20 \
      -H "Authorization: Bearer ${AUTH_BEARER_TOKEN}" \
      "${BASE_URL%/}/me/history?limit=100" || true
  )"

  if [[ "${profile_status}" != "200" || "${history_status}" != "200" ]]; then
    rm -f "${candidates_file}" "${profile_file}" "${history_file}"
    echo "[perf-full-live] signed media URL refresh failed. profile_status=${profile_status} history_status=${history_status}"
    exit 1
  fi

  {
    jq -r '.profile.profile_image_render_url // .profile_image_render_url // empty' "${profile_file}"
    jq -r '.history[]? | (.entry? // .) | .image_render_url // empty' "${history_file}"
  } | awk '/\/media\/render\// && /[?&]exp=/ && /[?&]sig=/ && !seen[$0]++' > "${candidates_file}"

  local candidate_count
  candidate_count="$(grep -Ec '[^[:space:]]' "${candidates_file}" || true)"
  local cold_candidate_count
  cold_candidate_count=$((candidate_count - 1))
  if [[ "${cold_candidate_count}" -lt "${MIN_MEDIA_RENDER_COLD_CANDIDATES}" ]]; then
    rm -f "${candidates_file}" "${profile_file}" "${history_file}"
    echo "[perf-full-live] signed media URL refresh needs at least ${MIN_MEDIA_RENDER_COLD_CANDIDATES} cold image render URLs, found ${cold_candidate_count}."
    exit 1
  fi

  local refreshed_warm_url
  refreshed_warm_url="$(head -n 1 "${candidates_file}")"
  if ! is_signed_media_render_url "${refreshed_warm_url}"; then
    rm -f "${candidates_file}" "${profile_file}" "${history_file}"
    echo "[perf-full-live] refreshed warm media URL is not a signed /media/render URL."
    exit 1
  fi

  export MEDIA_RENDER_URL="${refreshed_warm_url}"
  tail -n +2 "${candidates_file}" > "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}"
  chmod 600 "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}"
  rm -f "${candidates_file}" "${profile_file}" "${history_file}"
  echo "[perf-full-live] refreshed signed media render URLs. cold_candidates=${cold_candidate_count}"
}

refresh_media_render_urls

if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS:-}" ]]; then
  echo "[perf-full-live] MEDIA_RENDER_CACHE_MISS_URLS must be unset; use MEDIA_RENDER_CACHE_MISS_URLS_PATH."
  exit 1
fi

if [[ ! -f "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}" ]]; then
  echo "[perf-full-live] MEDIA_RENDER_CACHE_MISS_URLS_PATH file does not exist."
  exit 1
fi

if [[ ! -s "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}" ]]; then
  echo "[perf-full-live] MEDIA_RENDER_CACHE_MISS_URLS_PATH file is empty."
  exit 1
fi

if grep -Eq '<|>|example\.invalid' "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}"; then
  echo "[perf-full-live] MEDIA_RENDER_CACHE_MISS_URLS_PATH still contains a placeholder value."
  exit 1
fi

if [[ ! -f "${ANALYZE_PATH}" ]]; then
  echo "[perf-full-live] ANALYZE_PATH file does not exist."
  exit 1
fi

export REQUIRE_FULL_LIVE_MATRIX=1
export REQUIRE_MEDIA_RENDER_CACHE_HEADER=1
export REQUIRE_PROFILE_AUTH_SUCCESS=1
export ENABLE_ANALYZE=1
export K6_MATRIX_VUS="${K6_MATRIX_VUS:-20 50 100}"
export K6_DURATION="${K6_DURATION:-60s}"
export THINK_TIME_MS="${THINK_TIME_MS:-200}"
export RENDER_CACHE_MISS_EVERY="${RENDER_CACHE_MISS_EVERY:-1}"
export ANALYZE_EVERY="${ANALYZE_EVERY:-10}"

echo "[perf-full-live] starting full live media matrix."
bash "${MATRIX_SCRIPT}"
