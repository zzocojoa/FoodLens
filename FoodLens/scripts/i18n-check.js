#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const RESOURCES_DIR = path.join(ROOT_DIR, 'features', 'i18n', 'resources');
const BASE_LOCALE_FILE = 'en.json';

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

const getSortedKeys = (obj) => Object.keys(obj).sort((a, b) => a.localeCompare(b));

const diffKeys = (baseKeys, targetKeys) => {
  const baseSet = new Set(baseKeys);
  const targetSet = new Set(targetKeys);

  const missing = baseKeys.filter((k) => !targetSet.has(k));
  const extra = targetKeys.filter((k) => !baseSet.has(k));
  return { missing, extra };
};

const formatList = (items) => {
  if (items.length === 0) return '  - none';
  return items.map((item) => `  - ${item}`).join('\n');
};

const run = () => {
  if (!fs.existsSync(RESOURCES_DIR)) {
    console.error(`[i18n-check] Missing resources directory: ${RESOURCES_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(RESOURCES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error('[i18n-check] No locale json files found.');
    process.exit(1);
  }

  if (!files.includes(BASE_LOCALE_FILE)) {
    console.error(`[i18n-check] Missing base locale file: ${BASE_LOCALE_FILE}`);
    process.exit(1);
  }

  const basePath = path.join(RESOURCES_DIR, BASE_LOCALE_FILE);
  const baseJson = readJson(basePath);
  const baseKeys = getSortedKeys(baseJson);

  let hasError = false;
  console.log(`[i18n-check] Base locale: ${BASE_LOCALE_FILE} (${baseKeys.length} keys)`);

  files.forEach((fileName) => {
    if (fileName === BASE_LOCALE_FILE) return;

    const fullPath = path.join(RESOURCES_DIR, fileName);
    const targetJson = readJson(fullPath);
    const targetKeys = getSortedKeys(targetJson);
    const { missing, extra } = diffKeys(baseKeys, targetKeys);

    if (missing.length === 0 && extra.length === 0) {
      console.log(`[i18n-check] OK: ${fileName}`);
      return;
    }

    hasError = true;
    console.error(`[i18n-check] MISMATCH: ${fileName}`);
    console.error(' missing keys:');
    console.error(formatList(missing));
    console.error(' extra keys:');
    console.error(formatList(extra));
  });

  if (hasError) {
    console.error('[i18n-check] Failed.');
    process.exit(1);
  }

  console.log('[i18n-check] Passed.');
};

try {
  run();
} catch (error) {
  console.error('[i18n-check] Unexpected error:', error);
  process.exit(1);
}
