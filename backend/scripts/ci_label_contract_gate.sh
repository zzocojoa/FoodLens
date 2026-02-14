#!/usr/bin/env bash
set -euo pipefail

echo "[CI Gate] Running label contract/regression gate..."

PYTHON_BIN="./.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="python3"
fi

"$PYTHON_BIN" -m unittest -v \
  backend.tests.contracts.test_label_contract_gate \
  backend.tests.contracts.test_label_regression_scaffold

echo "[CI Gate] Label contract/regression gate passed."
