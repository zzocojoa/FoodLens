#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_ROOT="${ROOT_DIR}/FoodLens/artifacts/phase6/postdeploy-smoke"
RUNSTAMP="${PHASE6_RUN_STAMP:-$(date +%Y%m%d-%H%M%S)}"
ARTIFACT_DIR="${ARTIFACT_ROOT}/${RUNSTAMP}"
SUMMARY_PATH="${ARTIFACT_DIR}/summary.md"
RESULTS_PATH="${ARTIFACT_DIR}/results.tsv"

BASE_URL="${PHASE6_POSTDEPLOY_BASE_URL:-}"
OAUTH_REDIRECT_BASE_URL="${PHASE6_POSTDEPLOY_OAUTH_REDIRECT_BASE_URL:-${AUTH_OAUTH_REDIRECT_BASE_URL:-}}"
SMOKE_EMAIL="${PHASE6_POSTDEPLOY_SMOKE_EMAIL:-}"
SMOKE_PASSWORD="${PHASE6_POSTDEPLOY_SMOKE_PASSWORD:-}"
RELEASE_LABEL="${PHASE6_RELEASE_LABEL:-}"
ROLLBACK_REFERENCE="${PHASE6_ROLLBACK_REHEARSAL_REFERENCE:-}"
ROLLBACK_VERDICT="${PHASE6_ROLLBACK_REHEARSAL_VERDICT:-}"
ROLLBACK_SUMMARY="${PHASE6_ROLLBACK_REHEARSAL_SUMMARY:-}"

CURRENT_STEP="bootstrap"
FINAL_VERDICT="FAIL"
FAILURE_STEP=""
SMOKE_MEDIA_ASSET_ID=""
SMOKE_MEDIA_CLEANUP_DONE="0"

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
    BEGIN { matched = 0; header_prefix = tolower(header_name) ":"; expected = tolower(expected_substring) }
    index(tolower($0), header_prefix) == 1 && index(tolower($0), expected) > 0 { matched = 1 }
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

write_smoke_image_fixture() {
  local output_path="$1"

  python3 - "$output_path" <<'PY'
import base64
import sys

png_base64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8"
    "/x8AAusB9pJzi10AAAAASUVORK5CYII="
)

with open(sys.argv[1], "wb") as handle:
    handle.write(base64.b64decode(png_base64))
PY
}

write_smoke_media_render_fixture() {
  local output_path="$1"

  python3 - "$output_path" <<'PY'
import struct
import sys
import zlib


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(kind)
    checksum = zlib.crc32(payload, checksum) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


width = 16
height = 16
rows = []
for y in range(height):
    pixels = bytearray()
    for x in range(width):
        pixels.extend((48 + x * 4, 96 + y * 5, 160))
    rows.append(b"\x00" + bytes(pixels))

ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
payload = b"".join(
    [
        b"\x89PNG\r\n\x1a\n",
        png_chunk(b"IHDR", ihdr),
        png_chunk(b"IDAT", zlib.compress(b"".join(rows), level=9)),
        png_chunk(b"IEND", b""),
    ]
)

with open(sys.argv[1], "wb") as handle:
    handle.write(payload)
PY
}

post_multipart_status() {
  local label="$1"
  local url="$2"
  local file_path="$3"
  local file_content_type="$4"
  local mode="$5"
  local locale="$6"
  local allergy_info="$7"
  local authorization_header="$8"
  local headers_path="${ARTIFACT_DIR}/${label}.headers"
  local body_path="${ARTIFACT_DIR}/${label}.body"
  local status_code=""

  if [[ -n "${authorization_header}" ]]; then
    status_code="$(
      curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
        -X POST \
        -H "${authorization_header}" \
        -D "${headers_path}" \
        -o "${body_path}" \
        -w '%{http_code}' \
        -F "file=@${file_path};type=${file_content_type}" \
        -F "allergy_info=${allergy_info}" \
        -F "locale=${locale}" \
        -F "mode=${mode}" \
        "${url}"
    )"
  else
    status_code="$(
      curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
        -X POST \
        -D "${headers_path}" \
        -o "${body_path}" \
        -w '%{http_code}' \
        -F "file=@${file_path};type=${file_content_type}" \
        -F "allergy_info=${allergy_info}" \
        -F "locale=${locale}" \
        -F "mode=${mode}" \
        "${url}"
    )"
  fi

  printf '%s\n' "${status_code}"
}

post_media_upload_status() {
  local label="$1"
  local url="$2"
  local file_path="$3"
  local file_content_type="$4"
  local scope="$5"
  local authorization_header="$6"
  local headers_path="${ARTIFACT_DIR}/${label}.headers"
  local body_path="${ARTIFACT_DIR}/${label}.body"
  local status_code=""

  status_code="$(
    curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
      -X POST \
      -H "${authorization_header}" \
      -D "${headers_path}" \
      -o "${body_path}" \
      -w '%{http_code}' \
      -F "file=@${file_path};type=${file_content_type}" \
      -F "scope=${scope}" \
      "${url}"
  )"

  printf '%s\n' "${status_code}"
}

extract_json_field() {
  local body_path="$1"
  local field_name="$2"

  python3 - "$body_path" "$field_name" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

value = payload.get(sys.argv[2])
if value is None:
    raise SystemExit(f"Missing field: {sys.argv[2]}")

print(str(value))
PY
}

extract_media_upload_render_url() {
  local body_path="$1"

  python3 - "$body_path" <<'PY'
import json
import sys
from urllib.parse import parse_qs, urlparse

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

asset = payload.get("asset")
if not isinstance(asset, dict):
    raise SystemExit("Media upload response is missing asset.")

render_url = str(asset.get("render_url") or "").strip()
parsed = urlparse(render_url)
query = parse_qs(parsed.query)
if parsed.scheme not in {"http", "https"}:
    raise SystemExit("Media upload render_url must be absolute http(s).")
if "/media/render/" not in parsed.path:
    raise SystemExit("Media upload render_url must use /media/render/.")
if not str((query.get("exp") or [""])[0]).strip():
    raise SystemExit("Media upload render_url is missing exp.")
if not str((query.get("sig") or [""])[0]).strip():
    raise SystemExit("Media upload render_url is missing sig.")

print(render_url)
PY
}

extract_media_upload_asset_id() {
  local body_path="$1"

  python3 - "$body_path" <<'PY'
import json
import re
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

asset = payload.get("asset")
if not isinstance(asset, dict):
    raise SystemExit("Media upload response is missing asset.")

asset_id = str(asset.get("asset_id") or "").strip()
if not re.fullmatch(r"[A-Za-z0-9_.:-]+", asset_id):
    raise SystemExit("Media upload response has invalid asset_id.")

print(asset_id)
PY
}

redact_sensitive_json_artifact() {
  local body_path="$1"

  python3 - "$body_path" <<'PY'
import json
import sys
from urllib.parse import parse_qs, urlparse

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

token_keys = {"access_token", "refresh_token", "id_token"}


def is_signed_media_render_url(value: str) -> bool:
    parsed = urlparse(value)
    if "/media/render/" not in parsed.path:
        return False
    query = parse_qs(parsed.query)
    return bool(query.get("sig") or query.get("exp"))


def redact(value):
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            if key in token_keys and isinstance(item, str) and item:
                redacted["redacted_token_count"] = int(redacted.get("redacted_token_count", 0)) + 1
            else:
                redacted[key] = redact(item)
        return redacted
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, str) and is_signed_media_render_url(value):
        return "[redacted-signed-media-render-url]"
    return value

with open(path, "w", encoding="utf-8") as handle:
    json.dump(redact(payload), handle, ensure_ascii=False, sort_keys=True)
    handle.write("\n")
PY
}

delete_media_asset_status() {
  local label="$1"
  local url="$2"
  local authorization_header="$3"
  local headers_path="${ARTIFACT_DIR}/${label}.headers"
  local body_path="${ARTIFACT_DIR}/${label}.body"
  local status_code=""

  status_code="$(
    curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
      -X DELETE \
      -H "${authorization_header}" \
      -D "${headers_path}" \
      -o "${body_path}" \
      -w '%{http_code}' \
      "${url}"
  )"

  printf '%s\n' "${status_code}"
}

cleanup_smoke_media_asset() {
  local label="$1"
  local failure_mode="$2"
  local cleanup_status=""

  if [[ -z "${SMOKE_MEDIA_ASSET_ID}" || "${SMOKE_MEDIA_CLEANUP_DONE}" == "1" ]]; then
    return 0
  fi

  set +e
  cleanup_status="$(
    delete_media_asset_status \
      "${label}" \
      "${BASE_URL}/me/media/${SMOKE_MEDIA_ASSET_ID}" \
      "Authorization: Bearer ${AUTH_BEARER_TOKEN}"
  )"
  local cleanup_exit_code="$?"
  set -e

  if [[ "${cleanup_exit_code}" -eq 0 && "${cleanup_status}" == "200" ]]; then
    SMOKE_MEDIA_CLEANUP_DONE="1"
    record_result "${label}" "PASS" "200"
    return 0
  fi

  record_result "${label}" "${failure_mode}" "curl=${cleanup_exit_code};status=${cleanup_status:-missing}"
  if [[ "${failure_mode}" == "FAIL" ]]; then
    return 1
  fi
  return 0
}

get_header_value() {
  local label="$1"
  local header_name="$2"
  local headers_path="${ARTIFACT_DIR}/${label}.headers"

  awk -v header_name="${header_name}" '
    BEGIN { header_prefix = tolower(header_name) ":" }
    index(tolower($0), header_prefix) == 1 {
      sub("^[^:]+:[[:space:]]*", "", $0)
      sub("\r$", "", $0)
      print $0
      exit
    }
  ' "${headers_path}"
}

assert_header_equals() {
  local label="$1"
  local header_name="$2"
  local expected_value="$3"
  local actual_value=""

  actual_value="$(get_header_value "${label}" "${header_name}" | tr '[:upper:]' '[:lower:]')"
  if [[ "${actual_value}" != "${expected_value}" ]]; then
    echo "[Phase6 Postdeploy Smoke] ${label} expected ${header_name}=${expected_value}, got ${actual_value:-missing}"
    exit 1
  fi
}

assert_media_render_stage_header() {
  local label="$1"
  local stage_header=""

  stage_header="$(get_header_value "${label}" "X-Media-Render-Stage-Ms")"
  if [[ -z "${stage_header}" ]]; then
    echo "[Phase6 Postdeploy Smoke] ${label} missing X-Media-Render-Stage-Ms"
    exit 1
  fi

  python3 - "$label" "$stage_header" <<'PY'
import re
import sys

label = sys.argv[1]
header = sys.argv[2]
required = {"lookup", "fetch", "limit_wait", "transform", "cache_set"}
parts: dict[str, int] = {}
for item in header.split(","):
    key, sep, raw_value = item.strip().partition("=")
    if not sep:
        continue
    if not re.fullmatch(r"[a-z_]+", key):
        continue
    if not re.fullmatch(r"\d+", raw_value.strip()):
        raise SystemExit(f"{label} has non-numeric stage value for {key}.")
    parts[key] = int(raw_value.strip())

missing = sorted(required.difference(parts))
if missing:
    raise SystemExit(f"{label} missing stage keys: {', '.join(missing)}")
PY
}

poll_analysis_job_until_terminal() {
  local label_prefix="$1"
  local job_id="$2"
  local authorization_header="$3"
  local attempt=1

  while [[ "${attempt}" -le 30 ]]; do
    local label="${label_prefix}-poll-${attempt}"
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
          "${BASE_URL}/analyze/jobs/${job_id}"
      )"
    else
      status_code="$(
        curl -sS --connect-timeout 15 --max-time 30 --retry 3 --retry-delay 1 --retry-all-errors \
          -D "${headers_path}" \
          -o "${body_path}" \
          -w '%{http_code}' \
          "${BASE_URL}/analyze/jobs/${job_id}"
      )"
    fi

    if [[ "${status_code}" != "200" ]]; then
      echo "[Phase6 Postdeploy Smoke] ${label} expected 200, got ${status_code}"
      exit 1
    fi

    local job_status=""
    job_status="$(extract_json_field "${body_path}" "status")"

    if [[ "${job_status}" == "completed" || "${job_status}" == "fallback_completed" ]]; then
      record_result "${label_prefix}-terminal" "PASS" "${job_status}"
      return 0
    fi

    if [[ "${job_status}" == "failed" ]]; then
      echo "[Phase6 Postdeploy Smoke] ${label_prefix} failed"
      exit 1
    fi

    sleep 1
    attempt="$((attempt + 1))"
  done

  echo "[Phase6 Postdeploy Smoke] ${label_prefix} timed out"
  exit 1
}

resolve_media_render_url() {
  local profile_body_path="$1"
  local history_body_path="$2"

  python3 - "$profile_body_path" "$history_body_path" <<'PY'
import json
import sys
from urllib.parse import parse_qs, urlparse

profile_path = sys.argv[1]
history_path = sys.argv[2]

def read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)

def is_signed_remote_render_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.netloc:
        return False
    if "/media/render/" not in parsed.path:
        return False
    query = parse_qs(parsed.query)
    exp = str((query.get("exp") or [""])[0]).strip()
    sig = str((query.get("sig") or [""])[0]).strip()
    if not exp or not sig:
        return False
    return True

profile_payload = read_json(profile_path)
history_payload = read_json(history_path)

history_items = history_payload.get("history") or []
for item in history_items:
    if not isinstance(item, dict):
        continue
    entry = item.get("entry") or {}
    if not isinstance(entry, dict):
        continue
    image_render_url = str(entry.get("image_render_url") or "").strip()
    if is_signed_remote_render_url(image_render_url):
        print(f"history.image_render_url\t{image_render_url}")
        raise SystemExit(0)

profile = profile_payload.get("profile") or {}
if isinstance(profile, dict):
    profile_render_url = str(profile.get("profile_image_render_url") or "").strip()
    if is_signed_remote_render_url(profile_render_url):
        print(f"profile.profile_image_render_url\t{profile_render_url}")
        raise SystemExit(0)

raise SystemExit(
    "Smoke account is missing a usable signed remote render URL. "
    "Accepted sources: history.entry.image_render_url, profile.profile_image_render_url. "
    "Required format: absolute http(s) /media/render/ URL with exp and sig query params."
)
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
  cleanup_smoke_media_asset "media-cold-cleanup-on-exit" "WARN"
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
require_env "PHASE6_POSTDEPLOY_OAUTH_REDIRECT_BASE_URL" "${OAUTH_REDIRECT_BASE_URL}"
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
redact_sensitive_json_artifact "${ARTIFACT_DIR}/auth-login.body"
record_result "auth-login" "PASS" "200"

CURRENT_STEP="root-health"
assert_status "root-health" "${BASE_URL}/" "200" ""

CURRENT_STEP="live-provider-smoke"
AUTH_PUBLIC_BASE_URL="${BASE_URL}" AUTH_OAUTH_REDIRECT_BASE_URL="${OAUTH_REDIRECT_BASE_URL}" bash "${ROOT_DIR}/backend/scripts/ci_auth_live_provider_smoke.sh" \
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
MEDIA_RENDER_RESOLUTION="$(resolve_media_render_url "${ARTIFACT_DIR}/me-profile.body" "${ARTIFACT_DIR}/me-history.body")"
redact_sensitive_json_artifact "${ARTIFACT_DIR}/me-profile.body"
redact_sensitive_json_artifact "${ARTIFACT_DIR}/me-history.body"
IFS=$'\t' read -r MEDIA_RENDER_SOURCE MEDIA_RENDER_URL <<< "${MEDIA_RENDER_RESOLUTION}"
record_result "media-render-source" "PASS" "${MEDIA_RENDER_SOURCE}"
assert_status "media-render" "${MEDIA_RENDER_URL}" "200" ""
assert_header_contains "media-render" "content-type" "image/"
record_result "media-render-header" "PASS" "content-type=image/*"

CURRENT_STEP="media-cold-upload"
SMOKE_MEDIA_IMAGE_PATH="${ARTIFACT_DIR}/media-cold-smoke.png"
write_smoke_media_render_fixture "${SMOKE_MEDIA_IMAGE_PATH}"
MEDIA_COLD_UPLOAD_STATUS="$(
  post_media_upload_status \
    "media-cold-upload" \
    "${BASE_URL}/me/media/upload" \
    "${SMOKE_MEDIA_IMAGE_PATH}" \
    "image/png" \
    "history" \
    "Authorization: Bearer ${AUTH_BEARER_TOKEN}"
)"
if [[ "${MEDIA_COLD_UPLOAD_STATUS}" != "200" ]]; then
  echo "[Phase6 Postdeploy Smoke] media-cold-upload expected 200, got ${MEDIA_COLD_UPLOAD_STATUS}"
  exit 1
fi
SMOKE_MEDIA_ASSET_ID="$(extract_media_upload_asset_id "${ARTIFACT_DIR}/media-cold-upload.body")"
MEDIA_COLD_RENDER_URL="$(extract_media_upload_render_url "${ARTIFACT_DIR}/media-cold-upload.body")"
redact_sensitive_json_artifact "${ARTIFACT_DIR}/media-cold-upload.body"
record_result "media-cold-upload" "PASS" "fresh-render-url-redacted"

CURRENT_STEP="media-cold-render-miss"
assert_status "media-cold-render-miss" "${MEDIA_COLD_RENDER_URL}" "200" ""
assert_header_contains "media-cold-render-miss" "content-type" "image/"
assert_header_equals "media-cold-render-miss" "X-Media-Render-Cache" "miss"
assert_media_render_stage_header "media-cold-render-miss"
record_result "media-cold-render-miss" "PASS" "cache=miss;stage=lookup,fetch,limit_wait,transform,cache_set"

CURRENT_STEP="media-cold-render-hit"
assert_status "media-cold-render-hit" "${MEDIA_COLD_RENDER_URL}" "200" ""
assert_header_contains "media-cold-render-hit" "content-type" "image/"
assert_header_equals "media-cold-render-hit" "X-Media-Render-Cache" "hit"
record_result "media-cold-render-hit" "PASS" "cache=hit"

CURRENT_STEP="media-cold-cleanup"
if ! cleanup_smoke_media_asset "media-cold-cleanup" "FAIL"; then
  echo "[Phase6 Postdeploy Smoke] media-cold-cleanup failed"
  exit 1
fi

CURRENT_STEP="analyze-jobs-submit"
SMOKE_ANALYZE_IMAGE_PATH="${ARTIFACT_DIR}/analyze-jobs-smoke.png"
write_smoke_image_fixture "${SMOKE_ANALYZE_IMAGE_PATH}"
ANALYZE_JOBS_SUBMIT_STATUS="$(
  post_multipart_status \
    "analyze-jobs-submit" \
    "${BASE_URL}/analyze/jobs" \
    "${SMOKE_ANALYZE_IMAGE_PATH}" \
    "image/png" \
    "food" \
    "en-US" \
    "None" \
    "Authorization: Bearer ${AUTH_BEARER_TOKEN}"
)"
if [[ "${ANALYZE_JOBS_SUBMIT_STATUS}" != "202" ]]; then
  echo "[Phase6 Postdeploy Smoke] analyze-jobs-submit expected 202, got ${ANALYZE_JOBS_SUBMIT_STATUS}"
  exit 1
fi
ANALYZE_JOBS_JOB_ID="$(extract_json_field "${ARTIFACT_DIR}/analyze-jobs-submit.body" "job_id")"
record_result "analyze-jobs-submit" "PASS" "${ANALYZE_JOBS_JOB_ID}"

CURRENT_STEP="analyze-jobs-poll"
poll_analysis_job_until_terminal "analyze-jobs" "${ANALYZE_JOBS_JOB_ID}" "Authorization: Bearer ${AUTH_BEARER_TOKEN}"

CURRENT_STEP="rollback-rehearsal"
if [[ "${ROLLBACK_VERDICT}" != "pass" ]]; then
  echo "[Phase6 Postdeploy Smoke] rollback rehearsal verdict must be pass"
  exit 1
fi
record_result "rollback-rehearsal" "PASS" "${ROLLBACK_REFERENCE}"

FINAL_VERDICT="PASS"
echo "[Phase6 Postdeploy Smoke] completed: ${SUMMARY_PATH}"
