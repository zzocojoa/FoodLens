#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path


TREE_HEADER = "## 2. Directory Tree (Full System Map)"
STANDARD_SECTION = "## 5. Installation/Run Path Standard"
REQUIRED_SNIPPETS = [
    "Setup: `bash backend/setup.sh`",
    "Virtual env: `source .venv/bin/activate`",
    "Run backend: `python -m backend.server`",
]


def fail(message: str) -> int:
    print(f"[DOC-CHECK] FAIL: {message}")
    return 1


def extract_tree_block(md_text: str) -> str | None:
    header_idx = md_text.find(TREE_HEADER)
    if header_idx < 0:
        return None

    start_fence = md_text.find("```tree", header_idx)
    if start_fence < 0:
        return None

    start = md_text.find("\n", start_fence)
    if start < 0:
        return None
    start += 1

    end_fence = md_text.find("```", start)
    if end_fence < 0:
        return None

    return md_text[start:end_fence]


def parse_tree_paths(tree_text: str) -> list[tuple[Path, bool]]:
    item_re = re.compile(r"^(?P<indent>(?:│   |    )*)(?:├── |└── )(?P<name>.+)$")
    stack: list[str] = []
    parsed: list[tuple[Path, bool]] = []

    for raw_line in tree_text.splitlines():
        line = raw_line.rstrip()
        if not line:
            continue
        if line.strip() == "FoodLens-project/":
            stack = []
            continue

        match = item_re.match(line)
        if not match:
            continue

        depth = len(match.group("indent")) // 4
        name = match.group("name").split("#", 1)[0].strip()
        if not name:
            continue

        # Composite labels in docs (e.g. "android/ & ios/") are descriptive only.
        if "&" in name:
            continue

        is_dir = name.endswith("/")
        node = name.rstrip("/")
        if not node:
            continue

        stack = stack[:depth]
        rel = Path(*stack) / node if stack else Path(node)
        parsed.append((rel, is_dir))

        if is_dir:
            stack.append(node)

    return parsed


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    doc_path = repo_root / "docs" / "architecture-overview.md"

    if not doc_path.exists():
        return fail(f"missing doc file: {doc_path}")

    text = doc_path.read_text(encoding="utf-8")
    if STANDARD_SECTION not in text:
        return fail(f"missing section: {STANDARD_SECTION}")

    for snippet in REQUIRED_SNIPPETS:
        if snippet not in text:
            return fail(f"missing standard snippet: {snippet}")

    tree_block = extract_tree_block(text)
    if tree_block is None:
        return fail("cannot locate tree block under directory tree section")

    missing: list[str] = []
    for rel_path, is_dir in parse_tree_paths(tree_block):
        full = repo_root / rel_path
        if is_dir and not full.is_dir():
            missing.append(f"{rel_path}/")
        if not is_dir and not full.is_file():
            missing.append(str(rel_path))

    if missing:
        print("[DOC-CHECK] FAIL: tree paths in docs do not exist:")
        for path in missing:
            print(f" - {path}")
        return 1

    print("[DOC-CHECK] PASS: architecture-overview paths and install/run standard are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
