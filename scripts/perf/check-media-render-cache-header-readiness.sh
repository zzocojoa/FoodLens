#!/usr/bin/env bash
set -euo pipefail

trim_value() {
  local value="${1}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
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

header_value() {
  local header_file="${1}"
  local header_name="${2}"
  awk -v header_name="${header_name}" '
    BEGIN { target = tolower(header_name) ":" }
    {
      line = $0
      sub(/\r$/, "", line)
      if (tolower(substr(line, 1, length(target))) == target) {
        value = substr(line, length(target) + 1)
        sub(/^[[:space:]]+/, "", value)
      }
    }
    END { print value }
  ' "${header_file}"
}

render_url="$(trim_value "${MEDIA_RENDER_CACHE_HIT_URL:-${MEDIA_RENDER_URL:-}}")"
if [[ -z "${render_url}" ]]; then
  echo "[perf] strict cache header readiness requires MEDIA_RENDER_URL."
  exit 1
fi
if ! is_signed_media_render_url "${render_url}"; then
  echo "[perf] strict cache header readiness requires an http(s) signed /media/render URL with exp and sig query params."
  exit 1
fi

header_file="$(mktemp)"
trap 'rm -f "${header_file}"' EXIT

if ! http_status="$(
  curl -sS -D "${header_file}" -o /dev/null -w "%{http_code}" \
    --connect-timeout "${CACHE_HEADER_READINESS_CONNECT_TIMEOUT_SECONDS:-15}" \
    --max-time "${CACHE_HEADER_READINESS_TIMEOUT_SECONDS:-30}" \
    -H "Accept: image/webp,image/*,*/*;q=0.8" \
    "${render_url}"
)"; then
  echo "[perf] strict cache header readiness probe failed before k6. Check deployed backend readiness, signed URL freshness, and media storage access."
  exit 1
fi

content_type="$(trim_value "$(header_value "${header_file}" "content-type")")"
content_type_lower="$(printf '%s' "${content_type}" | tr '[:upper:]' '[:lower:]')"
cache_header="$(trim_value "$(header_value "${header_file}" "x-media-render-cache")")"
cache_header_lower="$(printf '%s' "${cache_header}" | tr '[:upper:]' '[:lower:]')"

if [[ "${http_status}" != "200" ]]; then
  echo "[perf] strict cache header readiness failed: expected render probe status=200 before enabling require_cache_header=1, got status=${http_status}."
  exit 1
fi
if [[ "${content_type_lower}" != image/* ]]; then
  echo "[perf] strict cache header readiness failed: expected render probe content_type=image/* before enabling require_cache_header=1, got content_type=${content_type:-missing}."
  exit 1
fi
if [[ "${cache_header_lower}" != "hit" && "${cache_header_lower}" != "miss" ]]; then
  echo "[perf] strict cache header readiness failed: expected X-Media-Render-Cache=hit|miss before enabling require_cache_header=1, got x_media_render_cache=${cache_header:-missing}."
  echo "[perf] keep require_cache_header=0 until the deployed backend proves render_cache_unknown_rate=0 and render_cache_disabled_rate=0."
  exit 1
fi

echo "[perf] strict cache header readiness passed: status=200 content_type=${content_type} x_media_render_cache=${cache_header_lower}."
