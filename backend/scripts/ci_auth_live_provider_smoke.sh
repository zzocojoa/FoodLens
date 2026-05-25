#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
SMOKE_MODE="${AUTH_PROVIDER_SMOKE_MODE:-live}"

if [ "${1:-}" = "--dry-run" ]; then
  SMOKE_MODE="dry-run"
  shift
fi

if [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--dry-run]"
  exit 1
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi

if [ "$SMOKE_MODE" != "live" ] && [ "$SMOKE_MODE" != "dry-run" ]; then
  echo "AUTH_PROVIDER_SMOKE_MODE must be one of: live, dry-run."
  exit 1
fi

BASE_URL="${AUTH_PUBLIC_BASE_URL:-}"
if [ "$SMOKE_MODE" = "live" ] && [ -z "$BASE_URL" ]; then
  echo "AUTH_PUBLIC_BASE_URL is required."
  exit 1
fi

BASE_URL="${BASE_URL%/}"
REDIRECT_LOCATION=""
STATE_VALUE=""

describe_url() {
  local value="$1"

  "$PYTHON_BIN" - "$value" <<'PY'
import sys
from urllib.parse import parse_qs, urlparse

value = sys.argv[1]
parsed = urlparse(value)
scheme = parsed.scheme or "unknown"
keys = ",".join(sorted(parse_qs(parsed.query).keys())) or "none"
print(f"scheme={scheme} host=[REDACTED_HOST] path=[REDACTED_PATH] query_keys={keys}")
PY
}

extract_query_param() {
  local location="$1"
  local name="$2"

  "$PYTHON_BIN" - "$location" "$name" <<'PY'
import sys
from urllib.parse import parse_qs, urlparse

location = sys.argv[1]
name = sys.argv[2]
values = parse_qs(urlparse(location).query).get(name, [])
if values:
    print(values[0])
PY
}

assert_query_param_present() {
  local location="$1"
  local name="$2"
  local label="$3"
  local value
  value="$(extract_query_param "$location" "$name")"

  if [ -z "$value" ]; then
    echo "[Smoke] ${label} missing query parameter ${name} in location ($(describe_url "$location"))."
    exit 1
  fi
}

assert_query_param_equals() {
  local location="$1"
  local name="$2"
  local expected="$3"
  local label="$4"
  local value
  value="$(extract_query_param "$location" "$name")"

  if [ "$value" != "$expected" ]; then
    echo "[Smoke] ${label} unexpected query parameter ${name}."
    exit 1
  fi
}

assert_query_param_absent() {
  local location="$1"
  local name="$2"
  local label="$3"
  local value
  value="$(extract_query_param "$location" "$name")"

  if [ -n "$value" ]; then
    echo "[Smoke] ${label} unexpected query parameter ${name}."
    exit 1
  fi
}

assert_generated_state() {
  local location="$1"
  local label="$2"
  local state
  state="$(extract_query_param "$location" "state")"

  if [ -z "$state" ]; then
    echo "[Smoke] ${label} missing generated state in location ($(describe_url "$location"))."
    exit 1
  fi

  if [ "${#state}" -lt 32 ] || [ "${#state}" -gt 256 ]; then
    echo "[Smoke] ${label} generated state length out of range: ${#state}"
    exit 1
  fi

  if [[ ! "$state" =~ ^[A-Za-z0-9._~-]+$ ]]; then
    echo "[Smoke] ${label} generated state is not URL-safe."
    exit 1
  fi

  local unique_count
  unique_count="$(printf '%s' "$state" | fold -w 1 | sort -u | wc -l | tr -d '[:space:]')"
  if [ "$unique_count" -lt 8 ]; then
    echo "[Smoke] ${label} generated state has too little character diversity."
    exit 1
  fi

  STATE_VALUE="$state"
  echo "[Smoke] ${label} generated state OK (${#state} chars)."
}

assert_dry_run_path() {
  local path="$1"
  local label="$2"

  if [[ "$path" != /auth/* ]]; then
    echo "[Smoke] ${label} dry-run path must stay under /auth."
    exit 1
  fi

  if [[ "$path" != *"redirect_uri=foodlens%3A%2F%2Foauth%2F"* ]]; then
    echo "[Smoke] ${label} dry-run path is missing the encoded app redirect URI."
    exit 1
  fi

  echo "[Smoke] ${label} dry-run path OK."
}

run_dry_run() {
  echo "[Smoke] OAuth provider bridge dry-run checks started. No network requests will be made."
  if [ -n "$BASE_URL" ]; then
    echo "[Smoke] configured base URL ($(describe_url "$BASE_URL"))."
  fi

  assert_dry_run_path \
    "/auth/google/start?redirect_uri=foodlens%3A%2F%2Foauth%2Fgoogle-callback" \
    "google-start"
  assert_dry_run_path \
    "/auth/kakao/start?redirect_uri=foodlens%3A%2F%2Foauth%2Fkakao-callback" \
    "kakao-start"
  assert_dry_run_path \
    "/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete" \
    "google-logout-start"
  assert_dry_run_path \
    "/auth/kakao/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete" \
    "kakao-logout-start"

  echo "[Smoke] Dry-run scope: start/logout redirects only; no callback, token exchange, webhook, credential, or provider HTTP request."
  echo "[Smoke] OAuth provider bridge dry-run checks passed."
}

assert_redirect() {
  local url="$1"
  local expected_location_substring="$2"
  local label="$3"

  local headers
  headers="$(curl -sS --connect-timeout 15 --max-time 15 --retry 3 --retry-delay 1 --retry-all-errors -D - -o /dev/null "$url")"
  local status
  status="$(printf '%s\n' "$headers" | awk 'toupper($1) ~ /^HTTP\// {code=$2} END {print code}')"
  local location
  location="$(printf '%s\n' "$headers" | awk 'BEGIN{IGNORECASE=1} /^location:/{sub(/\r$/,"",$2); print $2; exit}')"

  if [ "$status" != "302" ]; then
    echo "[Smoke] ${label} expected 302, got ${status}"
    exit 1
  fi

  if [[ "$location" != *"$expected_location_substring"* ]]; then
    echo "[Smoke] ${label} unexpected location ($(describe_url "$location"))."
    exit 1
  fi

  REDIRECT_LOCATION="$location"
  echo "[Smoke] ${label} OK provider_host=${expected_location_substring}"
}

if [ "$SMOKE_MODE" = "dry-run" ]; then
  run_dry_run
  exit 0
fi

assert_redirect \
  "${BASE_URL}/auth/google/start?redirect_uri=foodlens%3A%2F%2Foauth%2Fgoogle-callback" \
  "accounts.google.com" \
  "google-start"
google_start_location="$REDIRECT_LOCATION"
assert_generated_state "$google_start_location" "google-start"
google_start_state="$STATE_VALUE"
assert_query_param_present "$google_start_location" "code_challenge" "google-start"
assert_query_param_equals "$google_start_location" "code_challenge_method" "S256" "google-start"

assert_redirect \
  "${BASE_URL}/auth/kakao/start?redirect_uri=foodlens%3A%2F%2Foauth%2Fkakao-callback" \
  "kauth.kakao.com" \
  "kakao-start"
kakao_start_location="$REDIRECT_LOCATION"
assert_generated_state "$kakao_start_location" "kakao-start"
kakao_start_state="$STATE_VALUE"
assert_query_param_present "$kakao_start_location" "code_challenge" "kakao-start"
assert_query_param_equals "$kakao_start_location" "code_challenge_method" "S256" "kakao-start"

if [ "$google_start_state" = "$kakao_start_state" ]; then
  echo "[Smoke] provider start states unexpectedly matched."
  exit 1
fi

assert_redirect \
  "${BASE_URL}/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete" \
  "accounts.google.com" \
  "google-logout-start"

assert_redirect \
  "${BASE_URL}/auth/kakao/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete" \
  "kauth.kakao.com" \
  "kakao-logout-start"

echo "[Smoke] Live provider bridge smoke checks passed."
