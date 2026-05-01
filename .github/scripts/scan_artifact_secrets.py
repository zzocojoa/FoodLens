#!/usr/bin/env python3
import re
import sys
from pathlib import Path


SECRET_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("authorization-bearer", re.compile(r"authorization\s*:\s*bearer\s+[\w.\-~+/=]+", re.IGNORECASE)),
    ("database-url", re.compile(r"postgres(?:ql)?://[^\s\"'<>]+", re.IGNORECASE)),
    ("json-access-token", re.compile(r'"access_token"\s*:\s*"[^"]+"', re.IGNORECASE)),
    ("json-refresh-token", re.compile(r'"refresh_token"\s*:\s*"[^"]+"', re.IGNORECASE)),
    ("json-id-token", re.compile(r'"id_token"\s*:\s*"[^"]+"', re.IGNORECASE)),
    ("json-private-key", re.compile(r'"private_key"\s*:\s*"[^"]+"', re.IGNORECASE)),
    ("signed-media-render-url", re.compile(r"/media/render/[^\s\"'<>]+[?&][^\s\"'<>]*sig=", re.IGNORECASE)),
)


def _is_text_file(path: Path) -> bool:
    try:
        sample = path.read_bytes()[:4096]
    except OSError as error:
        raise RuntimeError(f"Failed to read artifact file: {path}") from error
    return b"\x00" not in sample


def _iter_files(root: Path) -> list[Path]:
    if root.is_file():
        return [root]
    if not root.exists():
        raise RuntimeError(f"Artifact path does not exist: {root}")
    return sorted(path for path in root.rglob("*") if path.is_file())


def scan_artifacts(root: Path) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in _iter_files(root):
        if not _is_text_file(path):
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError as error:
            raise RuntimeError(f"Failed to read artifact file: {path}") from error
        for label, pattern in SECRET_PATTERNS:
            if pattern.search(content):
                findings.append((str(path.relative_to(root) if root.is_dir() else path.name), label))
    return findings


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: scan_artifact_secrets.py <artifact-path>", file=sys.stderr)
        return 2

    root = Path(argv[1])
    try:
        findings = scan_artifacts(root)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 2

    if findings:
        print("Artifact secret scan failed. Redact these files before upload:", file=sys.stderr)
        for relative_path, label in findings:
            print(f"- {relative_path}: {label}", file=sys.stderr)
        return 1

    print("Artifact secret scan passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
