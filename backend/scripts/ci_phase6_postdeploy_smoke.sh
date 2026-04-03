#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${AUTH_PUBLIC_BASE_URL:-}"
MODE="${RELEASE_GATE_MODE:-}"
LABEL="${RELEASE_LABEL:-}"

if [ -z "$BASE_URL" ]; then
  echo "AUTH_PUBLIC_BASE_URL is required."
  exit 1
fi

if [ -z "$MODE" ]; then
  echo "RELEASE_GATE_MODE is required."
  exit 1
fi

if [ -z "$LABEL" ]; then
  echo "RELEASE_LABEL is required."
  exit 1
fi

BASE_URL="${BASE_URL%/}"
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT

STATUS="$(curl -sS --connect-timeout 15 --max-time 15 --retry 3 --retry-delay 1 --retry-all-errors -o "$BODY_FILE" -w "%{http_code}" "${BASE_URL}/")"

if [ "$STATUS" != "200" ]; then
  echo "[Phase6 Smoke] mode=${MODE} label=${LABEL} health expected 200, got ${STATUS}"
  exit 1
fi

if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$BODY_FILE"; then
  echo "[Phase6 Smoke] mode=${MODE} label=${LABEL} health response missing status=ok"
  cat "$BODY_FILE"
  exit 1
fi

echo "[Phase6 Smoke] mode=${MODE} label=${LABEL} health OK"

bash backend/scripts/ci_auth_live_provider_smoke.sh

echo "[Phase6 Smoke] mode=${MODE} label=${LABEL} postdeploy checks passed"
