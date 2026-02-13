"""Backend runtime package."""

from pathlib import Path
import sys

# Ensure legacy absolute imports like `from modules.xxx import ...` keep working
# when running as `python -m backend.server` (where only repo root is on sys.path).
_backend_dir = Path(__file__).resolve().parent
_backend_dir_str = str(_backend_dir)
if _backend_dir_str not in sys.path:
    sys.path.insert(0, _backend_dir_str)
