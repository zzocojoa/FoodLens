#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_SCRIPT="${ROOT_DIR}/scripts/perf/run-media-baseline.sh"
MATRIX_TS="$(date +%Y%m%d-%H%M%S)"
MATRIX_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/perf/matrix-${MATRIX_TS}}"
K6_MATRIX_VUS="${K6_MATRIX_VUS:-20 50 100}"
K6_DURATION="${K6_DURATION:-60s}"
THINK_TIME_MS="${THINK_TIME_MS:-200}"
REQUIRE_FULL_LIVE_MATRIX="${REQUIRE_FULL_LIVE_MATRIX:-0}"
MIN_MEDIA_RENDER_COLD_CANDIDATES="${MIN_MEDIA_RENDER_COLD_CANDIDATES:-3}"

if [[ -z "${MEDIA_RENDER_URL:-}" ]]; then
  echo "[perf-matrix] MEDIA_RENDER_URL is required."
  exit 1
fi
if [[ "${ENABLE_ANALYZE:-0}" != "0" && "${ENABLE_ANALYZE:-0}" != "1" ]]; then
  echo "[perf-matrix] ENABLE_ANALYZE must be 0 or 1."
  exit 1
fi
if [[ "${REQUIRE_FULL_LIVE_MATRIX}" != "0" && "${REQUIRE_FULL_LIVE_MATRIX}" != "1" ]]; then
  echo "[perf-matrix] REQUIRE_FULL_LIVE_MATRIX must be 0 or 1."
  exit 1
fi
if ! [[ "${MIN_MEDIA_RENDER_COLD_CANDIDATES}" =~ ^[1-9][0-9]*$ ]]; then
  echo "[perf-matrix] MIN_MEDIA_RENDER_COLD_CANDIDATES must be a positive integer."
  exit 1
fi
if [[ -n "${AUTH_BEARER_TOKEN:-}" || -n "${BASE_URL:-}" ]]; then
  : # optional profile checks are handled in baseline script
fi

if [[ "${REQUIRE_FULL_LIVE_MATRIX}" == "1" ]]; then
  if [[ -z "${BASE_URL:-}" ]]; then
    echo "[perf-matrix] BASE_URL is required when REQUIRE_FULL_LIVE_MATRIX=1."
    exit 1
  fi
  if [[ -z "${AUTH_BEARER_TOKEN:-}" ]]; then
    echo "[perf-matrix] AUTH_BEARER_TOKEN is required when REQUIRE_FULL_LIVE_MATRIX=1 so profile metrics are present."
    exit 1
  fi
  if [[ "${ENABLE_ANALYZE:-0}" != "1" ]]; then
    echo "[perf-matrix] ENABLE_ANALYZE=1 is required when REQUIRE_FULL_LIVE_MATRIX=1."
    exit 1
  fi
  if [[ -z "${ANALYZE_PATH:-}" || ! -f "${ANALYZE_PATH}" ]]; then
    echo "[perf-matrix] ANALYZE_PATH file is required when REQUIRE_FULL_LIVE_MATRIX=1."
    exit 1
  fi
  if [[ "${REQUIRE_MEDIA_RENDER_CACHE_HEADER:-0}" != "1" ]]; then
    echo "[perf-matrix] REQUIRE_MEDIA_RENDER_CACHE_HEADER=1 is required when REQUIRE_FULL_LIVE_MATRIX=1 so cache-miss metrics cannot be n/a."
    exit 1
  fi
  if [[ "${REQUIRE_PROFILE_AUTH_SUCCESS:-0}" != "1" ]]; then
    echo "[perf-matrix] REQUIRE_PROFILE_AUTH_SUCCESS=1 is required when REQUIRE_FULL_LIVE_MATRIX=1 so profile 401 cannot be treated as success."
    exit 1
  fi
  if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS:-}" ]]; then
    echo "[perf-matrix] MEDIA_RENDER_CACHE_MISS_URLS must be unset when REQUIRE_FULL_LIVE_MATRIX=1; use MEDIA_RENDER_CACHE_MISS_URLS_PATH to avoid exposing signed URLs inline."
    exit 1
  fi
  if [[ -z "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" || ! -f "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}" ]]; then
    echo "[perf-matrix] MEDIA_RENDER_CACHE_MISS_URLS_PATH file is required when REQUIRE_FULL_LIVE_MATRIX=1."
    exit 1
  fi
  cold_candidate_count="$(grep -Ec '[^[:space:]]' "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}" || true)"
  if [[ "${cold_candidate_count}" -lt "${MIN_MEDIA_RENDER_COLD_CANDIDATES}" ]]; then
    echo "[perf-matrix] MEDIA_RENDER_CACHE_MISS_URLS_PATH needs at least ${MIN_MEDIA_RENDER_COLD_CANDIDATES} cold candidates when REQUIRE_FULL_LIVE_MATRIX=1; found ${cold_candidate_count}."
    exit 1
  fi
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
  MIN_RENDER_CACHE_MISS_SAMPLES="${MIN_RENDER_CACHE_MISS_SAMPLES:-20}" \
  REQUIRE_PROFILE_AUTH_SUCCESS="${REQUIRE_PROFILE_AUTH_SUCCESS:-0}" \
  REQUIRE_MEDIA_RENDER_CACHE_HEADER="${REQUIRE_MEDIA_RENDER_CACHE_HEADER:-0}" \
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
else
  echo "[perf-matrix] scenario B skipped: set ENABLE_ANALYZE=1 and ANALYZE_PATH, or REQUIRE_FULL_LIVE_MATRIX=1 to fail instead."
fi

if [[ -z "${MEDIA_RENDER_CACHE_MISS_URLS:-}" && -z "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" ]]; then
  echo "[perf-matrix] cold cache-miss requests skipped: set MEDIA_RENDER_CACHE_MISS_URLS_PATH, or REQUIRE_FULL_LIVE_MATRIX=1 to fail instead."
fi

echo "[perf-matrix] done."
