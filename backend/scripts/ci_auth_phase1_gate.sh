#!/usr/bin/env bash
set -euo pipefail

echo "[CI Gate] Running Phase 1 auth runtime gate..."

PYTHON_BIN="./.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

# Guard against regression that can split same social account into different user_id.
"$PYTHON_BIN" backend/scripts/ci_oauth_identity_guard.py

# Keep auth runtime tests deterministic in CI; live-provider smoke is handled separately.
export AUTH_KAKAO_CODE_VERIFY_ENABLED=0

"$PYTHON_BIN" -m unittest -v \
  backend.tests.runtime.test_auth_email_delivery \
  backend.tests.runtime.test_auth_phase1 \
  backend.tests.runtime.test_auth_service_rotation \
  backend.tests.runtime.test_auth_state_snapshot

echo "[CI Gate] Phase 1 auth runtime gate passed."
