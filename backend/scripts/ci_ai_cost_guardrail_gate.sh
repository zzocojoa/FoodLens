#!/usr/bin/env bash
set -euo pipefail

echo "[CI Gate] Running AI cost guardrail runtime tests..."

PYTHON_BIN="./.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

PYTHONDONTWRITEBYTECODE=1 \
OPENAPI_EXPORT_ONLY=1 \
AUTH_STATE_BACKEND=memory \
MEDIA_STORAGE_BACKEND=local \
"$PYTHON_BIN" -m unittest -v \
  backend.tests.runtime.test_cost_guardrail \
  backend.tests.runtime.test_label_429_policy \
  backend.tests.runtime.test_analysis_jobs

echo "[CI Gate] AI cost guardrail runtime tests passed."
