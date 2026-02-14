#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$REPO_ROOT/.venv"
REQ_FILE="$REPO_ROOT/backend/requirements.txt"

if [[ ! -f "$REQ_FILE" ]]; then
  echo "❌ requirements not found: $REQ_FILE"
  exit 1
fi

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r "$REQ_FILE"

# Install SAM 2 (Meta Segment Anything Model 2)
# Since it might not be in PyPI simply as 'sam2' or requires compilation.
# For this MVP, let's assume we clone and install if simple pip fails, 
# or use a known git install.
# Checking if we can install from git directly:
pip install git+https://github.com/facebookresearch/sam2.git

echo "▶️ Run backend server:"
echo "   source .venv/bin/activate"
echo "   python -m backend.server"
echo ""
echo "▶️ Validate OpenAPI contract snapshot:"
echo "   python -m backend.scripts.export_openapi --out backend/contracts/openapi.json"

echo "✅ Environment setup complete (.venv)."
