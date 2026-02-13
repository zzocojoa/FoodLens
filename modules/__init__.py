"""Compatibility package for legacy imports.

Allows existing imports like `from modules.xxx import ...` to resolve to
`backend/modules` after the backend move.
"""

from pathlib import Path

_current_dir = Path(__file__).resolve().parent
_backend_modules_dir = _current_dir.parent / "backend" / "modules"

if _backend_modules_dir.exists():
    __path__.append(str(_backend_modules_dir))
