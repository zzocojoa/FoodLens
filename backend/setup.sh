#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_DIR="$REPO_ROOT/venv"

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --upgrade pip
pip install -r "$SCRIPT_DIR/requirements.txt"

# Install SAM 2 (Meta Segment Anything Model 2)
# Since it might not be in PyPI simply as 'sam2' or requires compilation.
# For this MVP, let's assume we clone and install if simple pip fails, 
# or use a known git install.
# Checking if we can install from git directly:
pip install git+https://github.com/facebookresearch/sam2.git

echo "▶️ Run backend server:"
echo "   python -m backend.server  # preferred"
echo "   python server.py          # compatibility shim"

echo "✅ Environment setup complete."
