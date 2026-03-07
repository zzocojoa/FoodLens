#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="${ROOT_DIR}/scripts/perf/k6-media-baseline.js"
RUN_TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/perf/${RUN_TS}}"

mkdir -p "${OUT_DIR}"

if ! command -v k6 >/dev/null 2>&1; then
  echo "[perf] k6 is not installed. Install with: brew install k6"
  exit 1
fi

if [[ -z "${MEDIA_RENDER_URL:-}" ]]; then
  echo "[perf] MEDIA_RENDER_URL is required."
  exit 1
fi

if [[ -n "${AUTH_BEARER_TOKEN:-}" || "${ENABLE_ANALYZE:-0}" == "1" ]]; then
  if [[ -z "${BASE_URL:-}" ]]; then
    echo "[perf] BASE_URL is required when AUTH_BEARER_TOKEN is set or ENABLE_ANALYZE=1."
    exit 1
  fi
fi

if [[ "${ENABLE_ANALYZE:-0}" == "1" ]]; then
  if [[ -z "${ANALYZE_PATH:-}" || ! -f "${ANALYZE_PATH}" ]]; then
    echo "[perf] ANALYZE_PATH file is required when ENABLE_ANALYZE=1."
    exit 1
  fi
fi

echo "[perf] output: ${OUT_DIR}"
echo "[perf] starting baseline run..."

k6 run "${SCRIPT_PATH}" \
  --summary-export "${OUT_DIR}/summary.json" \
  2>&1 | tee "${OUT_DIR}/k6.log"

echo "[perf] done."
echo "[perf] summary json: ${OUT_DIR}/summary.json"
echo "[perf] raw log: ${OUT_DIR}/k6.log"

if command -v jq >/dev/null 2>&1; then
  echo "[perf] key metrics"
  jq -r '
    [
      "http_req_failed.rate=\(.metrics.http_req_failed.values.rate // "n/a")",
      "http_req_duration.p95=\(.metrics.http_req_duration.values["p(95)"] // "n/a")",
      "render_latency.p95=\(.metrics.render_latency.values["p(95)"] // "n/a")",
      "profile_latency.p95=\(.metrics.profile_latency.values["p(95)"] // "n/a")",
      "analyze_latency.p95=\(.metrics.analyze_latency.values["p(95)"] // "n/a")"
    ] | .[]
  ' "${OUT_DIR}/summary.json"
fi
