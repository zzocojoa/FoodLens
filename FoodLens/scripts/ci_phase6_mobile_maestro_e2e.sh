#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACT_DIR="${ROOT_DIR}/artifacts/phase6/mobile-maestro-e2e"
FLOW_PATH="${FOODLENS_MAESTRO_FLOW_PATH:-${ROOT_DIR}/maestro/flows/release-smoke.yaml}"
LOCAL_ENV_FILE="${ROOT_DIR}/.env.maestro.local"
SUMMARY_FILE="${ARTIFACT_DIR}/maestro-manifest.json"
JUNIT_FILE="${ARTIFACT_DIR}/maestro-junit.xml"
LOG_FILE="${ARTIFACT_DIR}/maestro.log"
DEBUG_OUTPUT_DIR="${ARTIFACT_DIR}/debug-output"
TEST_OUTPUT_DIR="${ARTIFACT_DIR}/test-output"

trim_value() {
  local value="${1}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

require_env() {
  local name="${1}"
  local value
  value="$(trim_value "${!name:-}")"
  if [[ -z "${value}" ]]; then
    echo "[Phase6 Mobile Maestro E2E] ${name} is required." >&2
    exit 1
  fi
}

normalize_platform() {
  local value="${1}"
  case "${value}" in
    android|ios)
      printf '%s' "${value}"
      ;;
    *)
      echo "[Phase6 Mobile Maestro E2E] FOODLENS_E2E_PLATFORM must be android or ios." >&2
      exit 1
      ;;
  esac
}

load_local_env_file() {
  if [[ ! -f "${LOCAL_ENV_FILE}" ]]; then
    return
  fi

  if [[ ! -r "${LOCAL_ENV_FILE}" ]]; then
    echo "[Phase6 Mobile Maestro E2E] local env file is not readable: ${LOCAL_ENV_FILE}" >&2
    exit 1
  fi

  set -a
  source "${LOCAL_ENV_FILE}"
  set +a
  echo "[Phase6 Mobile Maestro E2E] loaded local env file: ${LOCAL_ENV_FILE}"
}

mkdir -p "${ARTIFACT_DIR}" "${DEBUG_OUTPUT_DIR}" "${TEST_OUTPUT_DIR}"

load_local_env_file

FOODLENS_E2E_PLATFORM="$(normalize_platform "$(trim_value "${FOODLENS_E2E_PLATFORM:-android}")")"
FOODLENS_E2E_APP_ID="$(trim_value "${FOODLENS_E2E_APP_ID:-com.hoihou.foodlens}")"
FOODLENS_E2E_EMAIL="$(trim_value "${FOODLENS_E2E_EMAIL:-}")"
FOODLENS_E2E_PASSWORD="$(trim_value "${FOODLENS_E2E_PASSWORD:-}")"
FOODLENS_MAESTRO_VALIDATE_ONLY="$(trim_value "${FOODLENS_MAESTRO_VALIDATE_ONLY:-0}")"

export FOODLENS_E2E_PLATFORM
export FOODLENS_E2E_APP_ID
export FOODLENS_E2E_EMAIL
export FOODLENS_E2E_PASSWORD

require_env FOODLENS_E2E_APP_ID

if [[ ! -f "${FLOW_PATH}" ]]; then
  echo "[Phase6 Mobile Maestro E2E] flow file does not exist: ${FLOW_PATH}" >&2
  exit 1
fi

node - "${SUMMARY_FILE}" "${FLOW_PATH}" "${FOODLENS_E2E_PLATFORM}" "${FOODLENS_E2E_APP_ID}" "${FOODLENS_MAESTRO_VALIDATE_ONLY}" <<'NODE'
const fs = require('fs');

const [summaryFile, flowPath, platform, appId, validateOnly] = process.argv.slice(2);
const summary = {
  gate: 'phase6-mobile-maestro-e2e',
  runner: 'maestro',
  deviceRunnerConfigured: true,
  platform,
  appId,
  flowPath,
  validateOnly: validateOnly === '1',
  requiredFlows: ['login', 'scan', 'history'],
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
NODE

if [[ "${FOODLENS_MAESTRO_VALIDATE_ONLY}" == "1" ]]; then
  echo "[Phase6 Mobile Maestro E2E] validate-only passed."
  exit 0
fi

require_env FOODLENS_E2E_EMAIL
require_env FOODLENS_E2E_PASSWORD

if ! command -v maestro >/dev/null 2>&1; then
  echo "[Phase6 Mobile Maestro E2E] maestro CLI is required. Install from https://maestro.mobile.dev/." >&2
  exit 1
fi

echo "[Phase6 Mobile Maestro E2E] platform=${FOODLENS_E2E_PLATFORM} app_id=${FOODLENS_E2E_APP_ID}"
maestro test \
  --no-ansi \
  --format junit \
  --output "${JUNIT_FILE}" \
  --debug-output "${DEBUG_OUTPUT_DIR}" \
  --test-output-dir "${TEST_OUTPUT_DIR}" \
  -e "FOODLENS_E2E_APP_ID=${FOODLENS_E2E_APP_ID}" \
  -e "FOODLENS_E2E_EMAIL=${FOODLENS_E2E_EMAIL}" \
  -e "FOODLENS_E2E_PASSWORD=${FOODLENS_E2E_PASSWORD}" \
  "${FLOW_PATH}" \
  2>&1 | tee "${LOG_FILE}"

echo "[Phase6 Mobile Maestro E2E] passed"
