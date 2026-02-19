#!/usr/bin/env bash
set -euo pipefail

echo "[CI Gate] Running Phase 1 auth runtime gate..."

PYTHON_BIN="./.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

# Keep auth runtime tests deterministic in CI; live-provider smoke is handled separately.
export AUTH_KAKAO_CODE_VERIFY_ENABLED=0

"$PYTHON_BIN" -m unittest -v \
  backend.tests.runtime.test_auth_phase1 \
  backend.tests.runtime.test_auth_service_rotation

echo "[CI Gate] Phase 1 auth runtime gate passed."
