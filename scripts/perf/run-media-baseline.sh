#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_PATH="${ROOT_DIR}/scripts/perf/k6-media-baseline.js"
CACHE_HEADER_READINESS_SCRIPT="${ROOT_DIR}/scripts/perf/check-media-render-cache-header-readiness.sh"
RUN_TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${OUT_DIR:-${ROOT_DIR}/artifacts/perf/${RUN_TS}}"
BASELINE_SCRIPT_VUS="${BASELINE_VUS:-${K6_VUS:-20}}"
BASELINE_SCRIPT_DURATION="${BASELINE_DURATION:-${K6_DURATION:-60s}}"
RENDER_CACHE_HIT_WARMUP_REQUESTS="${RENDER_CACHE_HIT_WARMUP_REQUESTS:-1}"
PERF_VALIDATE_ONLY="${PERF_VALIDATE_ONLY:-0}"

mkdir -p "${OUT_DIR}"

trim_value() {
  local value="${1}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

is_positive_integer() {
  local value="${1}"
  [[ "${value}" =~ ^[1-9][0-9]*$ ]]
}

is_signed_media_render_url() {
  local value="${1}"
  if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* || "${value}" == *$'\t'* ]]; then
    return 1
  fi
  if [[ "${value}" != http://* && "${value}" != https://* ]]; then
    return 1
  fi
  if [[ "${value}" != *"/media/render/"* ]]; then
    return 1
  fi
  if [[ "${value}" != *"?exp="* && "${value}" != *"&exp="* ]]; then
    return 1
  fi
  if [[ "${value}" != *"?sig="* && "${value}" != *"&sig="* ]]; then
    return 1
  fi
}

validate_media_render_url() {
  local name="${1}"
  local value="${2}"
  if ! is_signed_media_render_url "${value}"; then
    echo "[perf] ${name} must be an http(s) signed /media/render URL with exp and sig query params."
    exit 1
  fi
}

validate_cache_miss_urls() {
  local candidate=""
  local miss_urls_string="${MEDIA_RENDER_CACHE_MISS_URLS:-}"
  local saw_candidate="0"

  if [[ -n "${miss_urls_string}" ]]; then
    IFS=',' read -r -a miss_urls <<< "${miss_urls_string//$'\n'/,}"
    for candidate in "${miss_urls[@]}"; do
      candidate="$(trim_value "${candidate}")"
      if [[ -z "${candidate}" ]]; then
        continue
      fi
      saw_candidate="1"
      validate_media_render_url "MEDIA_RENDER_CACHE_MISS_URLS entry" "${candidate}"
    done
  fi

  if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" && -f "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}" ]]; then
    while IFS= read -r candidate || [[ -n "${candidate}" ]]; do
      candidate="$(trim_value "${candidate}")"
      if [[ -z "${candidate}" ]]; then
        continue
      fi
      saw_candidate="1"
      validate_media_render_url "MEDIA_RENDER_CACHE_MISS_URLS_PATH entry" "${candidate}"
    done < <(tr ',' '\n' < "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}")
  fi

  if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS:-}" || -n "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" ]]; then
    if [[ "${saw_candidate}" != "1" ]]; then
      echo "[perf] cache-miss URL input was configured but did not contain any signed /media/render URLs."
      exit 1
    fi
  fi
}

cache_miss_urls_include() {
  local needle="${1}"
  local candidate=""
  local miss_urls_string="${MEDIA_RENDER_CACHE_MISS_URLS:-}"

  if [[ -n "${miss_urls_string}" ]]; then
    IFS=',' read -r -a miss_urls <<< "${miss_urls_string//$'\n'/,}"
    for candidate in "${miss_urls[@]}"; do
      candidate="$(trim_value "${candidate}")"
      if [[ "${candidate}" == "${needle}" ]]; then
        return 0
      fi
    done
  fi

  if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" && -f "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}" ]]; then
    while IFS= read -r candidate || [[ -n "${candidate}" ]]; do
      candidate="$(trim_value "${candidate}")"
      if [[ "${candidate}" == "${needle}" ]]; then
        return 0
      fi
    done < <(tr ',' '\n' < "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}")
  fi

  return 1
}

redact_media_render_urls() {
  perl -pe 's#https?://[^\s"'\''<>]+/media/render/[^\s"'\''<>]+#<redacted-media-render-url>#g'
}

if [[ -z "${MEDIA_RENDER_URL:-}" ]]; then
  echo "[perf] MEDIA_RENDER_URL is required."
  exit 1
fi
validate_media_render_url "MEDIA_RENDER_URL" "${MEDIA_RENDER_URL}"
if [[ -n "${MEDIA_RENDER_CACHE_HIT_URL:-}" ]]; then
  validate_media_render_url "MEDIA_RENDER_CACHE_HIT_URL" "${MEDIA_RENDER_CACHE_HIT_URL}"
fi
if [[ "${PERF_VALIDATE_ONLY}" != "0" && "${PERF_VALIDATE_ONLY}" != "1" ]]; then
  echo "[perf] PERF_VALIDATE_ONLY must be 0 or 1."
  exit 1
fi
if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" && ! -f "${MEDIA_RENDER_CACHE_MISS_URLS_PATH}" ]]; then
  echo "[perf] MEDIA_RENDER_CACHE_MISS_URLS_PATH file does not exist."
  exit 1
fi
validate_cache_miss_urls
if cache_miss_urls_include "${MEDIA_RENDER_CACHE_HIT_URL:-${MEDIA_RENDER_URL}}"; then
  echo "[perf] cache-miss URLs must not include the warmed cache-hit render URL."
  exit 1
fi
if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS:-}" || -n "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" ]]; then
  if ! is_positive_integer "${RENDER_CACHE_MISS_EVERY:-1}"; then
    echo "[perf] RENDER_CACHE_MISS_EVERY must be a positive integer when cache-miss URLs are configured."
    exit 1
  fi
fi

if [[ "${ENABLE_ANALYZE:-0}" != "0" && "${ENABLE_ANALYZE:-0}" != "1" ]]; then
  echo "[perf] ENABLE_ANALYZE must be 0 or 1."
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
  if ! is_positive_integer "${ANALYZE_EVERY:-10}"; then
    echo "[perf] ANALYZE_EVERY must be a positive integer when ENABLE_ANALYZE=1."
    exit 1
  fi
fi

if [[ "${PERF_VALIDATE_ONLY}" == "1" ]]; then
  printf '{"mode":"validate_only","status":"passed","script_path":"%s"}\n' "${SCRIPT_PATH}" > "${OUT_DIR}/validate-only.json"
  echo "[perf] validate-only passed."
  exit 0
fi

if [[ "${REQUIRE_MEDIA_RENDER_CACHE_HEADER:-0}" != "0" && "${REQUIRE_MEDIA_RENDER_CACHE_HEADER:-0}" != "1" ]]; then
  echo "[perf] REQUIRE_MEDIA_RENDER_CACHE_HEADER must be 0 or 1."
  exit 1
fi

if [[ -n "${MEDIA_RENDER_CACHE_MISS_URLS:-}" || -n "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" ]]; then
  if ! is_positive_integer "${MIN_RENDER_CACHE_MISS_SAMPLES:-15}"; then
    echo "[perf] MIN_RENDER_CACHE_MISS_SAMPLES must be a positive integer when cache-miss URLs are configured."
    exit 1
  fi
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "[perf] k6 is not installed. Install with: brew install k6"
  exit 1
fi

if [[ "${RENDER_CACHE_HIT_WARMUP_REQUESTS}" =~ ^[0-9]+$ ]]; then
  for ((warmup_index = 0; warmup_index < RENDER_CACHE_HIT_WARMUP_REQUESTS; warmup_index++)); do
    curl -fsS --connect-timeout 15 --max-time 30 \
      -H "Accept: image/webp,image/*,*/*;q=0.8" \
      -o /dev/null \
      "${MEDIA_RENDER_CACHE_HIT_URL:-${MEDIA_RENDER_URL}}"
  done
else
  echo "[perf] RENDER_CACHE_HIT_WARMUP_REQUESTS must be a non-negative integer."
  exit 1
fi

if [[ "${REQUIRE_MEDIA_RENDER_CACHE_HEADER:-0}" == "1" ]]; then
  bash "${CACHE_HEADER_READINESS_SCRIPT}"
fi

echo "[perf] output: ${OUT_DIR}"
echo "[perf] starting baseline run..."

env -u K6_VUS -u K6_DURATION k6 run "${SCRIPT_PATH}" \
  --env "BASELINE_VUS=${BASELINE_SCRIPT_VUS}" \
  --env "BASELINE_DURATION=${BASELINE_SCRIPT_DURATION}" \
  --summary-export "${OUT_DIR}/summary.json" \
  2>&1 | redact_media_render_urls | tee "${OUT_DIR}/k6.log"

echo "[perf] done."
echo "[perf] summary json: ${OUT_DIR}/summary.json"
echo "[perf] raw log: ${OUT_DIR}/k6.log"

if command -v jq >/dev/null 2>&1; then
  echo "[perf] key metrics"
  jq -r '
    def metric_value($name; $field):
      (.metrics?[$name]?.values?[$field] // .metrics?[$name]?[$field] // .metrics?[$name]?.value // "n/a");
    [
      "http_req_failed.rate=\(metric_value("http_req_failed"; "rate"))",
      "http_req_duration.p95=\(metric_value("http_req_duration"; "p(95)"))",
      "render_status_2xx_rate.rate=\(metric_value("render_status_2xx_rate"; "rate"))",
      "render_status_3xx_rate.rate=\(metric_value("render_status_3xx_rate"; "rate"))",
      "render_status_4xx_rate.rate=\(metric_value("render_status_4xx_rate"; "rate"))",
      "render_status_5xx_rate.rate=\(metric_value("render_status_5xx_rate"; "rate"))",
      "render_status_other_rate.rate=\(metric_value("render_status_other_rate"; "rate"))",
      "render_content_type_mismatch_rate.rate=\(metric_value("render_content_type_mismatch_rate"; "rate"))",
      "render_latency.p95=\(metric_value("render_latency"; "p(95)"))",
      "render_cache_hit_failure_rate.rate=\(metric_value("render_cache_hit_failure_rate"; "rate"))",
      "render_cache_hit_content_type_mismatch_rate.rate=\(metric_value("render_cache_hit_content_type_mismatch_rate"; "rate"))",
      "render_cache_hit_latency.p95=\(metric_value("render_cache_hit_latency"; "p(95)"))",
      "render_cache_miss_failure_rate.rate=\(metric_value("render_cache_miss_failure_rate"; "rate"))",
      "render_cache_miss_content_type_mismatch_rate.rate=\(metric_value("render_cache_miss_content_type_mismatch_rate"; "rate"))",
      "render_cache_miss_latency.p95=\(metric_value("render_cache_miss_latency"; "p(95)"))",
      "render_cache_miss_observed_rate.rate=\(metric_value("render_cache_miss_observed_rate"; "rate"))",
      "render_cache_miss_observed_count.count=\(metric_value("render_cache_miss_observed_count"; "count"))",
      "render_stage_lookup_latency.p95=\(metric_value("render_stage_lookup_latency"; "p(95)"))",
      "render_stage_fetch_latency.p95=\(metric_value("render_stage_fetch_latency"; "p(95)"))",
      "render_stage_transform_latency.p95=\(metric_value("render_stage_transform_latency"; "p(95)"))",
      "render_stage_touch_latency.p95=\(metric_value("render_stage_touch_latency"; "p(95)"))",
      "render_stage_cache_set_latency.p95=\(metric_value("render_stage_cache_set_latency"; "p(95)"))",
      "render_cache_disabled_rate.rate=\(metric_value("render_cache_disabled_rate"; "rate"))",
      "render_cache_unknown_rate.rate=\(metric_value("render_cache_unknown_rate"; "rate"))",
      "render_cache_unknown_latency.p95=\(metric_value("render_cache_unknown_latency"; "p(95)"))",
      "profile_latency.p95=\(metric_value("profile_latency"; "p(95)"))",
      "analyze_latency.p95=\(metric_value("analyze_latency"; "p(95)"))"
    ] | .[]
  ' "${OUT_DIR}/summary.json"
fi
