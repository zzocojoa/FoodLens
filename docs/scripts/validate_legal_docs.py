#!/usr/bin/env python3
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import TypeAlias
from urllib.parse import urlsplit


ScalarMap: TypeAlias = dict[str, str]
ListMap: TypeAlias = dict[str, list[ScalarMap]]
ParsedFrontMatter: TypeAlias = tuple[ScalarMap, ListMap]

LEGAL_DOCS: tuple[tuple[str, str, str], ...] = (
    ("privacy-policy", "ko", "docs/privacy-policy/index.md"),
    ("privacy-policy", "en", "docs/privacy-policy/en/index.md"),
    ("privacy-policy", "ja", "docs/privacy-policy/ja/index.md"),
    ("privacy-policy", "zh-Hans", "docs/privacy-policy/zh-Hans/index.md"),
    ("terms-of-service", "ko", "docs/terms-of-service/index.md"),
    ("terms-of-service", "en", "docs/terms-of-service/en/index.md"),
    ("terms-of-service", "ja", "docs/terms-of-service/ja/index.md"),
    ("terms-of-service", "zh-Hans", "docs/terms-of-service/zh-Hans/index.md"),
)
LANGUAGE_CODES: tuple[str, ...] = ("ko", "en", "ja", "zh-Hans")
SCALAR_KEYS: tuple[str, ...] = (
    "layout",
    "lang",
    "title",
    "nav_eyebrow",
    "skip_label",
    "top_nav_label",
    "contents_label",
    "language_menu_label",
    "language_label",
    "privacy_href",
    "terms_href",
    "privacy_nav_label",
    "terms_nav_label",
)
ARTIFACTS: tuple[tuple[str, str, str], ...] = (
    ("privacy-policy", "ko", "artifacts/stripe-privacy-web-design/index.html"),
    ("privacy-policy", "en", "artifacts/stripe-privacy-web-design/index.en.html"),
    ("privacy-policy", "ja", "artifacts/stripe-privacy-web-design/index.ja.html"),
    ("privacy-policy", "zh-Hans", "artifacts/stripe-privacy-web-design/index.zh-Hans.html"),
    ("terms-of-service", "ko", "artifacts/stripe-privacy-web-design/terms-of-service.html"),
    ("terms-of-service", "en", "artifacts/stripe-privacy-web-design/terms-of-service.en.html"),
    ("terms-of-service", "ja", "artifacts/stripe-privacy-web-design/terms-of-service.ja.html"),
    (
        "terms-of-service",
        "zh-Hans",
        "artifacts/stripe-privacy-web-design/terms-of-service.zh-Hans.html",
    ),
)


def fail(message: str) -> int:
    print(f"[LEGAL-DOCS-CHECK] FAIL: {message}")
    return 1


def clean_value(value: str) -> str:
    stripped = value.strip()
    if len(stripped) >= 2 and stripped[0] == stripped[-1] and stripped[0] in {"'", '"'}:
        return stripped[1:-1]
    return stripped


def split_front_matter(path: Path) -> tuple[list[str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise RuntimeError(f"missing front matter: {path}")
    parts = text.split("---\n", 2)
    if len(parts) != 3:
        raise RuntimeError(f"malformed front matter: {path}")
    return parts[1].splitlines(), parts[2]


def parse_key_value(line: str, path: Path) -> tuple[str, str]:
    if ":" not in line:
        raise RuntimeError(f"malformed front matter line in {path}: {line}")
    key, value = line.split(":", 1)
    return key.strip(), clean_value(value)


def parse_front_matter(lines: list[str], path: Path) -> ParsedFrontMatter:
    scalars: ScalarMap = {}
    lists: ListMap = {}
    current_list = ""

    for raw_line in lines:
        if not raw_line.strip():
            continue
        if raw_line.startswith("  - "):
            if not current_list:
                raise RuntimeError(f"list item without parent in {path}: {raw_line}")
            key, value = parse_key_value(raw_line.removeprefix("  - "), path)
            lists[current_list].append({key: value})
            continue
        if raw_line.startswith("    "):
            if not current_list or not lists[current_list]:
                raise RuntimeError(f"nested field without list item in {path}: {raw_line}")
            key, value = parse_key_value(raw_line.strip(), path)
            lists[current_list][-1][key] = value
            continue
        key, value = parse_key_value(raw_line, path)
        if value:
            scalars[key] = value
            current_list = ""
            continue
        lists[key] = []
        current_list = key
    return scalars, lists


def localized_doc_href(doc_name: str, language: str) -> str:
    suffix = "" if language == "ko" else f"{language}/"
    return f"/docs/{doc_name}/{suffix}"


def validate_doc_links(repo_root: Path, path: Path, scalars: ScalarMap, lists: ListMap, doc_name: str) -> list[str]:
    errors: list[str] = []
    for key in ("privacy_href", "terms_href"):
        target = repo_root / scalars[key].lstrip("/") / "index.md"
        if not target.is_file():
            errors.append(f"{path}: {key} points to missing file: {target.relative_to(repo_root)}")
    options = lists.get("language_options", [])
    option_codes = tuple(option.get("lang", "") for option in options)
    if option_codes != LANGUAGE_CODES:
        errors.append(f"{path}: language_options order must be {LANGUAGE_CODES}, got {option_codes}")
    for option in options:
        language = option.get("lang", "")
        expected_href = localized_doc_href(doc_name, language)
        actual_href = option.get("href", "")
        if actual_href != expected_href:
            errors.append(f"{path}: {language} href must be {expected_href}, got {actual_href}")
        target = repo_root / actual_href.lstrip("/") / "index.md"
        if not target.is_file():
            errors.append(f"{path}: language option points to missing file: {target.relative_to(repo_root)}")
    return errors


def validate_nav_anchors(path: Path, body: str, lists: ListMap) -> list[str]:
    errors: list[str] = []
    for item in lists.get("nav", []):
        href = item.get("href", "")
        if not href.startswith("#"):
            errors.append(f"{path}: nav href must be an anchor: {href}")
            continue
        anchor = href.removeprefix("#")
        if f"{{#{anchor}}}" not in body:
            errors.append(f"{path}: nav anchor is missing from markdown body: {anchor}")
    return errors


def validate_markdown_doc(repo_root: Path, doc_name: str, language: str, rel_path: str) -> list[str]:
    path = repo_root / rel_path
    if not path.is_file():
        return [f"missing legal doc: {rel_path}"]
    lines, body = split_front_matter(path)
    scalars, lists = parse_front_matter(lines, path)
    errors: list[str] = []
    for key in SCALAR_KEYS:
        if key not in scalars:
            errors.append(f"{path}: missing scalar front matter key: {key}")
    if lists.get("language_options") is None:
        errors.append(f"{path}: missing language_options")
    if lists.get("nav") is None:
        errors.append(f"{path}: missing nav")
    if errors:
        return errors
    if scalars["layout"] != "legal":
        errors.append(f"{path}: layout must be legal")
    if scalars["lang"] != language:
        errors.append(f"{path}: lang must be {language}, got {scalars['lang']}")
    errors.extend(validate_doc_links(repo_root, path, scalars, lists, doc_name))
    errors.extend(validate_nav_anchors(path, body, lists))
    return errors


def artifact_file_name(doc_name: str, language: str) -> str:
    if doc_name == "privacy-policy":
        return "index.html" if language == "ko" else f"index.{language}.html"
    return "terms-of-service.html" if language == "ko" else f"terms-of-service.{language}.html"


def validate_artifact_links(repo_root: Path, doc_name: str, language: str, rel_path: str) -> list[str]:
    path = repo_root / rel_path
    if not path.is_file():
        return [f"missing artifact: {rel_path}"]
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    lang_match = re.search(r"<html[^>]+lang=\"([^\"]+)\"", text)
    if not lang_match or lang_match.group(1) != language:
        actual = lang_match.group(1) if lang_match else "missing"
        errors.append(f"{path}: html lang must be {language}, got {actual}")
    for target_language in LANGUAGE_CODES:
        expected_file = artifact_file_name(doc_name, target_language)
        if f'href="{expected_file}"' not in text:
            errors.append(f"{path}: missing language switch href: {expected_file}")
    if "<summary aria-label=" in text:
        errors.append(f"{path}: language summary must expose visible current-language text")
    if 'class="is-active" aria-current="page"' not in text:
        errors.append(f"{path}: active language link must set aria-current")
    for href in re.findall(r'href="([^"]+)"', text):
        if href.startswith("#") or href.startswith("mailto:"):
            continue
        target_path = urlsplit(href).path
        if not target_path:
            continue
        target = path.parent / target_path
        if not target.is_file():
            errors.append(f"{path}: artifact link points to missing file: {href}")
    return errors


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    errors: list[str] = []
    for doc_name, language, rel_path in LEGAL_DOCS:
        errors.extend(validate_markdown_doc(repo_root, doc_name, language, rel_path))
    for doc_name, language, rel_path in ARTIFACTS:
        errors.extend(validate_artifact_links(repo_root, doc_name, language, rel_path))
    if errors:
        for error in errors:
            print(f"[LEGAL-DOCS-CHECK] {error}")
        return 1
    print("[LEGAL-DOCS-CHECK] PASS: legal docs language links, anchors, and artifacts are valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
