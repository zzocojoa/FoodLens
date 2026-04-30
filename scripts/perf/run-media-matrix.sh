#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_SCRIPT="${ROOT_DIR}/scripts/perf/run-media-baseline.sh"
MATRIX_TS="$(date +%Y%m%d-%H%M%S)"
MATRIX_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/perf/matrix-${MATRIX_TS}}"
K6_MATRIX_VUS="${K6_MATRIX_VUS:-20 50 100}"
K6_DURATION="${K6_DURATION:-60s}"
THINK_TIME_MS="${THINK_TIME_MS:-200}"

if [[ -z "${MEDIA_RENDER_URL:-}" ]]; then
  echo "[perf-matrix] MEDIA_RENDER_URL is required."
  exit 1
fi
if [[ "${ENABLE_ANALYZE:-0}" != "0" && "${ENABLE_ANALYZE:-0}" != "1" ]]; then
  echo "[perf-matrix] ENABLE_ANALYZE must be 0 or 1."
  exit 1
fi
if [[ -n "${AUTH_BEARER_TOKEN:-}" || -n "${BASE_URL:-}" ]]; then
  : # optional profile checks are handled in baseline script
fi

mkdir -p "${MATRIX_DIR}"
echo "[perf-matrix] output: ${MATRIX_DIR}"

run_case() {
  local scenario="$1"
  local vus="$2"
  local enable_analyze="$3"
  local case_dir="${MATRIX_DIR}/${scenario}-vus${vus}"
  echo "[perf-matrix] scenario=${scenario} vus=${vus}"
  local analyze_path="${ANALYZE_PATH:-}"
  local analyze_locale="${ANALYZE_LOCALE:-ko-KR}"
  local analyze_allergy="${ANALYZE_ALLERGY:-egg}"
  local analyze_every="${ANALYZE_EVERY:-10}"
  OUT_DIR="${case_dir}" \
  K6_VUS="${vus}" \
  K6_DURATION="${K6_DURATION}" \
  THINK_TIME_MS="${THINK_TIME_MS}" \
  ENABLE_ANALYZE="${enable_analyze}" \
  ANALYZE_PATH="${analyze_path}" \
  ANALYZE_LOCALE="${analyze_locale}" \
  ANALYZE_ALLERGY="${analyze_allergy}" \
  ANALYZE_EVERY="${analyze_every}" \
  bash "${RUN_SCRIPT}"
}

for vus in ${K6_MATRIX_VUS}; do
  run_case "A-render-profile" "${vus}" "0"
done

if [[ "${ENABLE_ANALYZE:-0}" == "1" ]]; then
  if [[ -z "${ANALYZE_PATH:-}" || ! -f "${ANALYZE_PATH}" ]]; then
    echo "[perf-matrix] ANALYZE_PATH file is required when ENABLE_ANALYZE=1."
    exit 1
  else
    for vus in ${K6_MATRIX_VUS}; do
      run_case "B-render-profile-analyze" "${vus}" "1"
    done
  fi
fi

echo "[perf-matrix] done."
