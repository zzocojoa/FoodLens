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

validate_cache_miss_variant_keys() {
  if [[ -z "${MEDIA_RENDER_CACHE_MISS_URLS:-}" && -z "${MEDIA_RENDER_CACHE_MISS_URLS_PATH:-}" ]]; then
    return
  fi
  python3 - <<'PY'
import os
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse


def split_urls(value: str) -> list[str]:
    normalized = value.replace("\n", ",")
    return [item.strip() for item in normalized.split(",") if item.strip()]


def read_miss_urls() -> list[str]:
    urls: list[str] = []
    urls.extend(split_urls(os.environ.get("MEDIA_RENDER_CACHE_MISS_URLS", "")))
    path_value = os.environ.get("MEDIA_RENDER_CACHE_MISS_URLS_PATH", "").strip()
    if path_value:
        path = Path(path_value)
        if path.exists():
            urls.extend(split_urls(path.read_text()))
    return urls


def env_int(name: str, fallback: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def allowed_widths() -> set[int]:
    raw = os.environ.get("MEDIA_RENDER_ALLOWED_WIDTHS", "128,256,512,1024")
    values = {int(part.strip()) for part in raw.split(",") if part.strip().isdigit()}
    return values or {128, 256, 512, 1024}


def normalized_query_value(query: dict[str, list[str]], name: str, fallback: str) -> str:
    values = query.get(name)
    if not values:
        return fallback
    value = values[0].strip()
    return value or fallback


def render_variant_key(url: str) -> tuple[str, str, str, str]:
    parsed = urlparse(url)
    marker = "/media/render/"
    if marker not in parsed.path:
        raise ValueError("missing media render path")
    asset_id = parsed.path.split(marker, 1)[1].strip("/")
    query = parse_qs(parsed.query)
    default_width = env_int("MEDIA_RENDER_DEFAULT_WIDTH", 512)
    raw_width = env_int("MEDIA_RENDER_DEFAULT_WIDTH", default_width)
    try:
        raw_width = int(normalized_query_value(query, "w", str(default_width)))
    except ValueError:
        raw_width = default_width
    width = raw_width if raw_width in allowed_widths() else default_width

    quality_min = max(1, env_int("MEDIA_RENDER_QUALITY_MIN", 50))
    quality_max = min(100, env_int("MEDIA_RENDER_QUALITY_MAX", 85))
    default_quality = env_int("MEDIA_RENDER_DEFAULT_QUALITY", 75)
    try:
        raw_quality = int(normalized_query_value(query, "q", str(default_quality)))
    except ValueError:
        raw_quality = default_quality
    quality = max(quality_min, min(quality_max, raw_quality))

    raw_fmt = normalized_query_value(query, "fmt", "auto").lower()
    if raw_fmt in {"jpg", "jpeg"}:
        fmt = "jpeg"
    elif raw_fmt == "auto":
        fmt = "webp"
    elif raw_fmt in {"webp", "png"}:
        fmt = raw_fmt
    else:
        fmt = "jpeg"
    return asset_id, str(width), str(quality), fmt


warm_url = os.environ.get("MEDIA_RENDER_CACHE_HIT_URL") or os.environ.get("MEDIA_RENDER_URL") or ""
warm_key = render_variant_key(warm_url)
seen: dict[tuple[str, str, str, str], int] = {}
for index, url in enumerate(read_miss_urls(), start=1):
    key = render_variant_key(url)
    if key == warm_key:
        print(
            "[perf] cache-miss URL variant must not match the warmed cache-hit variant. "
            f"entry_index={index}",
            file=sys.stderr,
        )
        sys.exit(1)
    previous_index = seen.get(key)
    if previous_index is not None:
        print(
            "[perf] cache-miss URLs must be unique by backend variant key. "
            f"first_entry_index={previous_index} duplicate_entry_index={index}",
            file=sys.stderr,
        )
        sys.exit(1)
    seen[key] = index
PY
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
validate_cache_miss_variant_keys
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
  if ! is_positive_integer "${RENDER_CACHE_MISS_P95_HARD_THRESHOLD_MS:-3000}"; then
    echo "[perf] RENDER_CACHE_MISS_P95_HARD_THRESHOLD_MS must be a positive integer when cache-miss URLs are configured."
    exit 1
  fi
  if ! is_positive_integer "${RENDER_CACHE_MISS_P95_WARN_THRESHOLD_MS:-2500}"; then
    echo "[perf] RENDER_CACHE_MISS_P95_WARN_THRESHOLD_MS must be a positive integer when cache-miss URLs are configured."
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
      "render_stage_limit_wait_latency.p95=\(metric_value("render_stage_limit_wait_latency"; "p(95)"))",
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
  miss_p95="$(
    jq -r '
      (.metrics?.render_cache_miss_latency?.values?["p(95)"]
        // .metrics?.render_cache_miss_latency?["p(95)"]
        // "n/a")
    ' "${OUT_DIR}/summary.json"
  )"
  if [[ "${miss_p95}" != "n/a" ]]; then
    awk \
      -v value="${miss_p95}" \
      -v warn="${RENDER_CACHE_MISS_P95_WARN_THRESHOLD_MS:-2500}" \
      -v hard="${RENDER_CACHE_MISS_P95_HARD_THRESHOLD_MS:-3000}" \
      'BEGIN {
        if (value + 0 >= warn + 0 && value + 0 < hard + 0) {
          printf("[perf] warning: render_cache_miss_latency.p95=%sms is above warning threshold %sms but below hard threshold %sms.\n", value, warn, hard)
        }
      }'
  fi
fi
