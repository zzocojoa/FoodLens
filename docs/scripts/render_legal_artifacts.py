#!/usr/bin/env python3
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

from validate_legal_docs import ARTIFACTS, LEGAL_DOCS, ScalarMap, parse_front_matter, split_front_matter


ARTIFACT_DIR = Path("artifacts/stripe-privacy-web-design")
CSS_PATH = Path("assets/css/legal.css")
LEGAL_DOC_MAP: dict[tuple[str, str], str] = {
    (doc_name, language): rel_path for doc_name, language, rel_path in LEGAL_DOCS
}
ARTIFACT_MAP: dict[tuple[str, str], str] = {
    (doc_name, language): rel_path for doc_name, language, rel_path in ARTIFACTS
}
FAVICON_VERSION = "foodlens-logo-20260524"
FAVICON_HREF = f"../../assets/images/favicon.png?v={FAVICON_VERSION}"
SHORTCUT_ICON_HREF = f"../../favicon.ico?v={FAVICON_VERSION}"
APPLE_TOUCH_ICON_HREF = f"../../apple-touch-icon.png?v={FAVICON_VERSION}"
BRAND_ICON = """<svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 3.25c4.84 0 8.75 3.91 8.75 8.75S16.84 20.75 12 20.75 3.25 16.84 3.25 12 7.16 3.25 12 3.25Z"></path>
            <path d="M8.35 12.25h4.2a3.1 3.1 0 1 0 0-6.2h-4.2v11.9"></path>
            <path d="M12.55 12.25 16.2 18"></path>
          </svg>"""
PRIVACY_ICON = """<svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 3.5 18.75 6v5.15c0 4.2-2.72 7.42-6.75 9.35-4.03-1.93-6.75-5.15-6.75-9.35V6L12 3.5Z"></path>
                <path d="m9.4 12.1 1.75 1.75 3.6-3.7"></path>
              </svg>"""
TERMS_ICON = """<svg viewBox="0 0 24 24" focusable="false">
                <path d="M7.25 3.75h7.5L18.75 8v12.25H7.25V3.75Z"></path>
                <path d="M14.5 3.95V8.2h4"></path>
                <path d="M9.75 12.25h6"></path>
                <path d="M9.75 15.5h4.5"></path>
              </svg>"""
LANGUAGE_ICON = """<svg viewBox="0 0 24 24" focusable="false">
                <path d="M12 20.75a8.75 8.75 0 1 0 0-17.5 8.75 8.75 0 0 0 0 17.5Z"></path>
                <path d="M3.75 12h16.5"></path>
                <path d="M12 3.25c2.1 2.25 3.15 5.17 3.15 8.75S14.1 18.5 12 20.75C9.9 18.5 8.85 15.58 8.85 12S9.9 5.5 12 3.25Z"></path>
              </svg>"""
CONTENTS_ICON = """<svg viewBox="0 0 24 24" focusable="false">
                <path d="M8.75 6.75h10"></path>
                <path d="M8.75 12h10"></path>
                <path d="M8.75 17.25h10"></path>
                <path d="M5.25 6.75h.01"></path>
                <path d="M5.25 12h.01"></path>
                <path d="M5.25 17.25h.01"></path>
              </svg>"""


def render_inline(value: str) -> str:
    escaped = html.escape(value)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    return escaped


def parse_table(lines: list[str], start: int) -> tuple[str, int]:
    rows: list[list[str]] = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        row = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        if not all(re.fullmatch(r":?-{3,}:?", cell) for cell in row):
            rows.append(row)
        index += 1
    if not rows:
        raise RuntimeError("table must include a header row")
    header, *body = rows
    head_html = "".join(f"<th>{render_inline(cell)}</th>" for cell in header)
    body_html = "".join(
        "<tr>" + "".join(f"<td>{render_inline(cell)}</td>" for cell in row) + "</tr>"
        for row in body
    )
    return f"<table><thead><tr>{head_html}</tr></thead><tbody>{body_html}</tbody></table>", index


def parse_list(lines: list[str], start: int) -> tuple[str, int]:
    html_lines: list[str] = ["<ul>"]
    index = start
    current_item_open = False
    while index < len(lines):
        match = re.match(r"^(\s*)-\s+(.+)$", lines[index])
        if not match:
            break
        level = len(match.group(1)) // 2
        text = render_inline(match.group(2))
        if level == 0:
            if current_item_open:
                html_lines.append("</li>")
            html_lines.append(f"<li>{text}")
            current_item_open = True
        elif current_item_open:
            html_lines.append(f"<br><span>{text}</span>")
        else:
            html_lines.append(f"<li>{text}")
            current_item_open = True
        index += 1
    if current_item_open:
        html_lines.append("</li>")
    html_lines.append("</ul>")
    return "".join(html_lines), index


def render_markdown(body: str) -> str:
    lines = body.splitlines()
    blocks: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            index += 1
            continue
        html_heading = re.match(r"^<h([2-6])\s+id=\"([A-Za-z0-9_-]+)\">(.+)</h\1>$", stripped)
        if html_heading:
            level = html_heading.group(1)
            anchor = html.escape(html_heading.group(2))
            text = render_inline(html_heading.group(3))
            blocks.append(f'<h{level} id="{anchor}">{text}</h{level}>')
            index += 1
            continue
        heading = re.match(r"^(#{2,6})\s+(.+?)(?:\s+\{#([A-Za-z0-9_-]+)\})?$", stripped)
        if heading:
            level = len(heading.group(1))
            text = render_inline(heading.group(2))
            anchor = f' id="{html.escape(heading.group(3))}"' if heading.group(3) else ""
            blocks.append(f"<h{level}{anchor}>{text}</h{level}>")
            index += 1
            continue
        if re.match(r"^\s*-\s+", line):
            rendered, index = parse_list(lines, index)
            blocks.append(rendered)
            continue
        if stripped.startswith("|") and index + 1 < len(lines) and lines[index + 1].strip().startswith("|"):
            rendered, index = parse_table(lines, index)
            blocks.append(rendered)
            continue
        paragraph_lines = [stripped]
        index += 1
        while index < len(lines):
            next_line = lines[index]
            next_stripped = next_line.strip()
            if (
                not next_stripped
                or re.match(r"^(#{2,6})\s+", next_stripped)
                or re.match(r"^<h[2-6]\s+id=\"[A-Za-z0-9_-]+\">", next_stripped)
                or re.match(r"^\s*-\s+", next_line)
                or next_stripped.startswith("|")
            ):
                break
            paragraph_lines.append(next_stripped)
            index += 1
        blocks.append(f"<p>{render_inline(' '.join(paragraph_lines))}</p>")
    return "\n".join(blocks)


def artifact_file_name(doc_name: str, language: str) -> str:
    rel_path = ARTIFACT_MAP[(doc_name, language)]
    return Path(rel_path).name


def render_language_menu(doc_name: str, language: str, scalars: ScalarMap, options: list[ScalarMap]) -> str:
    links: list[str] = []
    for option in options:
        option_language = option["lang"]
        active = ' class="is-active" aria-current="page"' if option_language == language else ""
        href = artifact_file_name(doc_name, option_language)
        links.append(
            f'<a{active} href="{href}" hreflang="{html.escape(option_language)}" '
            f'lang="{html.escape(option_language)}">{html.escape(option["label"])}</a>'
        )
    return f'''
        <details class="language-menu">
          <summary>
            <span class="language-menu-icon" aria-hidden="true">
              {LANGUAGE_ICON}
            </span>
            <span class="language-menu-copy">
              <span class="language-menu-kicker">{html.escape(scalars["language_menu_label"])}</span>
              <span class="language-menu-current">{html.escape(scalars["language_label"])}</span>
            </span>
          </summary>
          <div class="language-menu-panel">
            {''.join(links)}
          </div>
        </details>'''


def render_side_nav(scalars: ScalarMap, nav_items: list[ScalarMap]) -> str:
    nav_links = "\n".join(
        f'          <a href="{html.escape(item["href"])}">{html.escape(item["label"])}</a>'
        for item in nav_items
    )
    return f'''        <nav class="legal-nav" aria-label="{html.escape(scalars["contents_label"])}">
          <div class="legal-nav-heading">
            <span class="legal-nav-icon" aria-hidden="true">
              {CONTENTS_ICON}
            </span>
            <span class="legal-nav-title">
              <span class="eyebrow">{html.escape(scalars["nav_eyebrow"])}</span>
              <strong>{html.escape(scalars["title"])}</strong>
            </span>
          </div>
{nav_links}
        </nav>'''


def render_page(
    css: str,
    doc_name: str,
    language: str,
    scalars: ScalarMap,
    language_options: list[ScalarMap],
    nav_items: list[ScalarMap],
    content_html: str,
) -> str:
    privacy_href = artifact_file_name("privacy-policy", language)
    terms_href = artifact_file_name("terms-of-service", language)
    language_menu = render_language_menu(doc_name, language, scalars, language_options)
    side_nav = render_side_nav(scalars, nav_items)
    title = html.escape(scalars["title"])
    return f'''<!doctype html>
<html lang="{html.escape(language)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title} | FoodLens</title>
    <meta name="description" content="{html.escape(scalars["description"])}">
    <link rel="icon" type="image/png" sizes="48x48" href="{FAVICON_HREF}">
    <link rel="shortcut icon" type="image/x-icon" href="{SHORTCUT_ICON_HREF}">
    <link rel="apple-touch-icon" sizes="180x180" href="{APPLE_TOUCH_ICON_HREF}">
    <style>
{css}
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main">{html.escape(scalars["skip_label"])}</a>

    <header class="site-header" aria-label="FoodLens">
      <a class="wordmark" href="#main" aria-label="FoodLens">
        <span class="brand-mark" aria-hidden="true">
          {BRAND_ICON}
        </span>
        <span>FoodLens</span>
      </a>
      <div class="header-actions">
        <nav class="top-nav" aria-label="{html.escape(scalars["top_nav_label"])}">
          <a href="{privacy_href}">
            <span class="nav-icon nav-icon-privacy" aria-hidden="true">
              {PRIVACY_ICON}
            </span>
            <span>{html.escape(scalars["privacy_nav_label"])}</span>
          </a>
          <a href="{terms_href}">
            <span class="nav-icon nav-icon-terms" aria-hidden="true">
              {TERMS_ICON}
            </span>
            <span>{html.escape(scalars["terms_nav_label"])}</span>
          </a>
        </nav>{language_menu}
      </div>
    </header>

    <div class="legal-shell">
      <aside class="legal-sidebar">
{side_nav}
      </aside>

      <main id="main" class="legal-main" tabindex="-1">
        <section class="doc-title" aria-labelledby="doc-title">
          <p class="updated">{html.escape(scalars["effective_date"])}</p>
          <h1 id="doc-title">{title}</h1>
          <p class="intro">{html.escape(scalars["lead"])}</p>
        </section>

        <article class="legal-content">
{content_html}
        </article>
      </main>
    </div>
  </body>
</html>
'''


def render_outputs(repo_root: Path) -> dict[Path, str]:
    css = (repo_root / CSS_PATH).read_text(encoding="utf-8")
    outputs: dict[Path, str] = {}
    for doc_name, language, source_rel_path in LEGAL_DOCS:
        source_path = repo_root / source_rel_path
        lines, body = split_front_matter(source_path)
        scalars, lists = parse_front_matter(lines, source_path)
        artifact_rel_path = ARTIFACT_MAP[(doc_name, language)]
        outputs[repo_root / artifact_rel_path] = render_page(
            css,
            doc_name,
            language,
            scalars,
            lists["language_options"],
            lists["nav"],
            render_markdown(body),
        )
    return outputs


def write_outputs(repo_root: Path) -> int:
    for path, rendered in render_outputs(repo_root).items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
        print(f"[LEGAL-ARTIFACTS] wrote {path.relative_to(repo_root)}")
    return 0


def check_outputs(repo_root: Path) -> int:
    stale_paths: list[Path] = []
    for path, rendered in render_outputs(repo_root).items():
        if not path.is_file() or path.read_text(encoding="utf-8") != rendered:
            stale_paths.append(path.relative_to(repo_root))
    if stale_paths:
        print("[LEGAL-ARTIFACTS] FAIL: stale generated previews")
        for path in stale_paths:
            print(f" - {path}")
        print("Run: python3 docs/scripts/render_legal_artifacts.py")
        return 1
    print("[LEGAL-ARTIFACTS] PASS: static legal previews are fresh.")
    return 0


def main(argv: list[str]) -> int:
    repo_root = Path(__file__).resolve().parents[2]
    if len(argv) == 1:
        return write_outputs(repo_root)
    if len(argv) == 2 and argv[1] == "--check":
        return check_outputs(repo_root)
    print("Usage: python3 docs/scripts/render_legal_artifacts.py [--check]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
