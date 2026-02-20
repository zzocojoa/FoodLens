#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${AUTH_PUBLIC_BASE_URL:-}"
if [ -z "$BASE_URL" ]; then
  echo "AUTH_PUBLIC_BASE_URL is required."
  exit 1
fi

BASE_URL="${BASE_URL%/}"

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
    echo "[Smoke] ${label} unexpected location: ${location}"
    exit 1
  fi

  echo "[Smoke] ${label} OK -> ${location}"
}

assert_redirect \
  "${BASE_URL}/auth/google/start?redirect_uri=foodlens%3A%2F%2Foauth%2Fgoogle-callback&state=ci-live-google" \
  "accounts.google.com" \
  "google-start"

assert_redirect \
  "${BASE_URL}/auth/kakao/start?redirect_uri=foodlens%3A%2F%2Foauth%2Fkakao-callback&state=ci-live-kakao" \
  "kauth.kakao.com" \
  "kakao-start"

assert_redirect \
  "${BASE_URL}/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete" \
  "accounts.google.com" \
  "google-logout-start"

assert_redirect \
  "${BASE_URL}/auth/kakao/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete" \
  "kauth.kakao.com" \
  "kakao-logout-start"

echo "[Smoke] Live provider bridge smoke checks passed."
