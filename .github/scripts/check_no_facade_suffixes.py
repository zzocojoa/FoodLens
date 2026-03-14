from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TEXT_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".md",
    ".yml",
    ".yaml",
    ".json",
}
FACADE_FILE_RE = re.compile(r"_(Logic|Structure)\.(ts|tsx|js|jsx|py)$")
FACADE_REF_RE = re.compile(r"_(Logic|Structure)\b")
SEARCH_ROOTS = ("FoodLens", "backend", ".github", "docs")
EXCLUDED_PARTS = {
    "node_modules",
    "android",
    "ios",
    ".expo",
    "artifacts",
    "__pycache__",
    ".git",
}


def should_skip(path: Path) -> bool:
    return any(part in EXCLUDED_PARTS for part in path.parts)


def iter_repo_files():
    for root_name in SEARCH_ROOTS:
        root = REPO_ROOT / root_name
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or should_skip(path):
                continue
            yield path


def main() -> int:
    violations: list[str] = []

    for path in iter_repo_files():
        relative = path.relative_to(REPO_ROOT)

        if FACADE_FILE_RE.search(path.name):
            violations.append(f"Facade file is not allowed: {relative}")
            continue

        if path == Path(__file__).resolve():
            continue

        if path.suffix not in TEXT_EXTENSIONS:
            continue

        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        if FACADE_REF_RE.search(content):
            violations.append(f"Facade suffix reference found in: {relative}")

    if violations:
        print("Found forbidden facade suffixes:")
        for violation in sorted(violations):
            print(f"- {violation}")
        return 1

    print("No facade suffix files or references found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
