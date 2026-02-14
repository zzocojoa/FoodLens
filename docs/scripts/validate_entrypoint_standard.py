#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


REQUIRED_FILES = [
    "backend/server.py",
    "backend/setup.sh",
    "backend/requirements.txt",
    "backend/Dockerfile",
]

FORBIDDEN_PATHS = [
    "server.py",
    "setup.sh",
    "requirements.txt",
    "modules",
    "scripts/remove_bg.py",
]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    errors: list[str] = []

    for rel in REQUIRED_FILES:
        path = repo_root / rel
        if not path.exists():
            errors.append(f"missing required standard path: {rel}")

    for rel in FORBIDDEN_PATHS:
        path = repo_root / rel
        if path.exists():
            errors.append(f"legacy compatibility path must not exist: {rel}")

    if errors:
        print("[ENTRYPOINT-CHECK] FAIL")
        for err in errors:
            print(f" - {err}")
        return 1

    print("[ENTRYPOINT-CHECK] PASS: single standard entrypoint paths are enforced.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
