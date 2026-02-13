#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();

const TARGET_PATHS = [
  'features/result/screens',
  'features/scanCamera/screens',
  'features/camera/screens',
  'features/home/screens',
  'features/history/screens',
  'features/profile/screens',
  'features/tripStats/screens',
  'components/result',
  'components/HistoryList.tsx',
];

const CODE_EXTENSIONS = new Set(['.ts', '.tsx']);

const EXCLUDED_PATTERNS = [
  /__tests__/,
  /\.test\./,
  /\.spec\./,
];

const ALLOW_TEXT_LITERALS = new Set([
  'Food Lens',
]);

const JSX_TEXT_PATTERN = /<Text\b[^>]*>([^<{][^<]*)<\/Text>/g;
const ALERT_TITLE_PATTERN = /Alert\.alert\(\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\1/g;
const UI_PROP_PATTERN = /\b(title|label|placeholder|message|description)\s*:\s*(['"])([^'"\\]*(?:\\.[^'"\\]*)*)\2/g;

const hasVisibleLetters = (text) => /[A-Za-z\u3131-\uD79D]/.test(text);

const isExcludedFile = (filePath) => EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));

const walkFiles = (targetPath) => {
  const fullPath = path.join(ROOT_DIR, targetPath);

  if (!fs.existsSync(fullPath)) {
    return [];
  }

  const stat = fs.statSync(fullPath);
  if (stat.isFile()) {
    return CODE_EXTENSIONS.has(path.extname(fullPath)) && !isExcludedFile(fullPath) ? [fullPath] : [];
  }

  const results = [];
  const entries = fs.readdirSync(fullPath, { withFileTypes: true });

  entries.forEach((entry) => {
    const entryPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(path.relative(ROOT_DIR, entryPath)));
      return;
    }

    if (!entry.isFile()) return;
    if (!CODE_EXTENSIONS.has(path.extname(entry.name))) return;
    if (isExcludedFile(entryPath)) return;
    results.push(entryPath);
  });

  return results;
};

const getLine = (content, index) => content.slice(0, index).split('\n').length;

const normalize = (value) => value.replace(/\s+/g, ' ').trim();

const pushFinding = (findings, filePath, content, matchIndex, text, kind) => {
  const normalized = normalize(text);
  if (!normalized) return;
  if (!hasVisibleLetters(normalized)) return;
  if (normalized.startsWith('{') || normalized.endsWith('}')) return;
  if (normalized.includes('t(')) return;
  if (ALLOW_TEXT_LITERALS.has(normalized)) return;

  findings.push({
    filePath: path.relative(ROOT_DIR, filePath),
    line: getLine(content, matchIndex),
    kind,
    text: normalized,
  });
};

const collectMatches = (content, pattern) => {
  const matches = [];
  let match;
  const regex = new RegExp(pattern.source, pattern.flags);
  while ((match = regex.exec(content)) !== null) {
    matches.push(match);
  }
  return matches;
};

const run = () => {
  const files = TARGET_PATHS.flatMap(walkFiles);
  const findings = [];

  files.forEach((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');

    collectMatches(content, JSX_TEXT_PATTERN).forEach((match) => {
      pushFinding(findings, filePath, content, match.index, match[1], 'jsx-text');
    });

    collectMatches(content, ALERT_TITLE_PATTERN).forEach((match) => {
      pushFinding(findings, filePath, content, match.index, match[2], 'alert-title');
    });

    collectMatches(content, UI_PROP_PATTERN).forEach((match) => {
      pushFinding(findings, filePath, content, match.index, match[3], `ui-prop:${match[1]}`);
    });
  });

  if (findings.length > 0) {
    console.error('[i18n-hardcoded-check] Found potential hardcoded UI strings:');
    findings.forEach((finding) => {
      console.error(
        `  - ${finding.filePath}:${finding.line} [${finding.kind}] "${finding.text}"`
      );
    });
    console.error('[i18n-hardcoded-check] Failed. Replace with i18n keys or add explicit allowlist with reason.');
    process.exit(1);
  }

  console.log('[i18n-hardcoded-check] Passed.');
};

try {
  run();
} catch (error) {
  console.error('[i18n-hardcoded-check] Unexpected error:', error);
  process.exit(1);
}
