#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT_DIR = process.cwd();
const BASE_LOCALE_FILE = 'en.json';
const DEFAULT_REFERENCE_TARGET_PATHS = [
  'app',
  'components/ProfileSheet.tsx',
  'components/navigation',
  'components/profileSheet',
  'features/home/screens',
  'features/home/components',
  'features/home/utils',
  'features/home/hooks',
  'features/allergies',
  'features/profile/screens',
  'features/profile/profileHub',
];
const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const EXCLUDED_DIRECTORY_NAMES = new Set(['.git', 'artifacts', 'build', 'coverage', 'dist', 'node_modules', 'scripts']);
const EXCLUDED_PATH_SEGMENTS = new Set(['__snapshots__', '__tests__']);

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

const sortStrings = (items) => items.slice().sort((left, right) => left.localeCompare(right));

const flattenLocaleKeys = (value, prefix = '') => {
  if (value === null || value === undefined) {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([childKey, childValue]) => {
      const nextPrefix = prefix ? `${prefix}.${childKey}` : childKey;
      return flattenLocaleKeys(childValue, nextPrefix);
    });
  }

  return prefix ? [prefix] : [];
};

const diffKeys = (baseKeys, targetKeys) => {
  const baseSet = new Set(baseKeys);
  const targetSet = new Set(targetKeys);

  const missing = baseKeys.filter((key) => !targetSet.has(key));
  const extra = targetKeys.filter((key) => !baseSet.has(key));
  return { missing, extra };
};

const formatList = (items) => {
  if (items.length === 0) return '  - none';
  return items.map((item) => `  - ${item}`).join('\n');
};

const relativeFilePath = (rootDir, filePath) => path.relative(rootDir, filePath).split(path.sep).join('/');

const resolveResourcesDir = (rootDir) => path.join(rootDir, 'features', 'i18n', 'resources');

const normalizeReferenceTargetPaths = (targetPaths = []) => {
  if (targetPaths.length > 0) {
    return targetPaths;
  }

  return DEFAULT_REFERENCE_TARGET_PATHS;
};

const isSourceFilePath = (filePath) => {
  if (filePath.endsWith('.d.ts') || filePath.endsWith('.d.tsx')) {
    return false;
  }

  const extension = path.extname(filePath);
  if (!SOURCE_FILE_EXTENSIONS.has(extension)) {
    return false;
  }

  const relativeSegments = filePath.split(path.sep);
  if (relativeSegments.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment) || EXCLUDED_PATH_SEGMENTS.has(segment))) {
    return false;
  }

  return true;
};

const collectFilesRecursively = (startDir) => {
  const collectedFiles = [];
  const stack = [startDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const directoryEntries = fs.readdirSync(currentDir, { withFileTypes: true });

    directoryEntries.forEach((entry) => {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORY_NAMES.has(entry.name) && !EXCLUDED_PATH_SEGMENTS.has(entry.name)) {
          stack.push(fullPath);
        }
        return;
      }

      if (entry.isFile() && isSourceFilePath(fullPath)) {
        collectedFiles.push(fullPath);
      }
    });
  }

  return collectedFiles.sort((left, right) => left.localeCompare(right));
};

const resolveCallName = (expression) => {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  return null;
};

const isLiteralTranslationKey = (text) => text.includes('.');

const extractTranslationKeyReferencesFromFile = (filePath) => {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const scriptKind = filePath.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : filePath.endsWith('.ts')
      ? ts.ScriptKind.TS
      : filePath.endsWith('.jsx')
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const references = [];

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callName = resolveCallName(node.expression);
      const firstArgument = node.arguments[0];

      if (
        (callName === 't' || callName === 'translate') &&
        firstArgument &&
        (ts.isStringLiteralLike(firstArgument) || ts.isNoSubstitutionTemplateLiteral(firstArgument))
      ) {
        const key = firstArgument.text;

        if (isLiteralTranslationKey(key)) {
          const lineNumber = sourceFile.getLineAndCharacterOfPosition(firstArgument.getStart(sourceFile)).line + 1;
          references.push({
            key,
            filePath,
            lineNumber,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return references;
};

const collectReferencedTranslationKeys = (rootDir, targetPaths = []) => {
  const normalizedTargetPaths = normalizeReferenceTargetPaths(targetPaths);
  const sourceRoots = normalizedTargetPaths
    .map((targetPath) => path.join(rootDir, targetPath))
    .filter((targetPath) => fs.existsSync(targetPath));

  return sourceRoots.flatMap((sourceRoot) => {
    if (fs.statSync(sourceRoot).isFile()) {
      return isSourceFilePath(sourceRoot) ? extractTranslationKeyReferencesFromFile(sourceRoot) : [];
    }

    return collectFilesRecursively(sourceRoot).flatMap((filePath) => extractTranslationKeyReferencesFromFile(filePath));
  });
};

const collectLocaleParityIssues = (resourcesDir, baseLocaleFile) => {
  const files = fs
    .readdirSync(resourcesDir)
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => left.localeCompare(right));

  if (!files.includes(baseLocaleFile)) {
    throw new Error(`[i18n-check] Missing base locale file: ${baseLocaleFile}`);
  }

  const basePath = path.join(resourcesDir, baseLocaleFile);
  const baseJson = readJson(basePath);
  const baseKeys = sortStrings(flattenLocaleKeys(baseJson));
  const issues = [];

  files.forEach((fileName) => {
    if (fileName === baseLocaleFile) {
      return;
    }

    const fullPath = path.join(resourcesDir, fileName);
    const targetJson = readJson(fullPath);
    const targetKeys = sortStrings(flattenLocaleKeys(targetJson));
    const { missing, extra } = diffKeys(baseKeys, targetKeys);

    if (missing.length > 0 || extra.length > 0) {
      issues.push({
        fileName,
        missing,
        extra,
      });
    }
  });

  return {
    baseKeys,
    issues,
  };
};

const collectMissingReferencedKeys = (baseKeys, references) => {
  const baseKeySet = new Set(baseKeys);
  const groupedMissingReferences = new Map();

  references.forEach((reference) => {
    if (baseKeySet.has(reference.key)) {
      return;
    }

    if (!groupedMissingReferences.has(reference.key)) {
      groupedMissingReferences.set(reference.key, []);
    }

    groupedMissingReferences.get(reference.key).push(reference);
  });

  return Array.from(groupedMissingReferences.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, keyReferences]) => ({
      key,
      references: keyReferences.sort((left, right) => {
        const fileComparison = left.filePath.localeCompare(right.filePath);
        if (fileComparison !== 0) {
          return fileComparison;
        }

        return left.lineNumber - right.lineNumber;
      }),
    }));
};

const analyzeI18n = (rootDir, targetPaths = []) => {
  const resourcesDir = resolveResourcesDir(rootDir);

  if (!fs.existsSync(resourcesDir)) {
    throw new Error(`[i18n-check] Missing resources directory: ${resourcesDir}`);
  }

  const { baseKeys, issues: localeParityIssues } = collectLocaleParityIssues(resourcesDir, BASE_LOCALE_FILE);
  const normalizedTargetPaths = normalizeReferenceTargetPaths(targetPaths);
  const referencedKeys = collectReferencedTranslationKeys(rootDir, normalizedTargetPaths);
  const missingReferencedKeys = collectMissingReferencedKeys(baseKeys, referencedKeys);

  return {
    baseLocaleFile: BASE_LOCALE_FILE,
    baseKeys,
    localeParityIssues,
    referenceTargetPaths: normalizedTargetPaths,
    referencedKeys,
    missingReferencedKeys,
  };
};

const printMissingReferencedKeys = (rootDir, missingReferencedKeys) => {
  if (missingReferencedKeys.length === 0) {
    console.log('[i18n-check] Referenced translation keys: OK');
    return;
  }

  console.error('[i18n-check] MISSING REFERENCED KEYS:');
  missingReferencedKeys.forEach((entry) => {
    console.error(`  - ${entry.key}`);
    entry.references.forEach((reference) => {
      console.error(`    - ${relativeFilePath(rootDir, reference.filePath)}:${reference.lineNumber}`);
    });
  });
};

const runI18nCheck = (rootDir, targetPaths = []) => {
  const result = analyzeI18n(rootDir, targetPaths);

  console.log(`[i18n-check] Base locale: ${result.baseLocaleFile} (${result.baseKeys.length} keys)`);
  result.localeParityIssues.forEach((issue) => {
    console.error(`[i18n-check] MISMATCH: ${issue.fileName}`);
    console.error(' missing keys:');
    console.error(formatList(issue.missing));
    console.error(' extra keys:');
    console.error(formatList(issue.extra));
  });
  console.log(
    `[i18n-check] Source references (${result.referenceTargetPaths.join(', ')}): ${result.referencedKeys.length}`
  );
  printMissingReferencedKeys(rootDir, result.missingReferencedKeys);

  const hasError = result.localeParityIssues.length > 0 || result.missingReferencedKeys.length > 0;
  if (hasError) {
    console.error('[i18n-check] Failed.');
  } else {
    console.log('[i18n-check] Passed.');
  }

  return {
    ...result,
    hasError,
  };
};

if (require.main === module) {
  try {
    const cliTargetPaths = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
    const result = runI18nCheck(ROOT_DIR, cliTargetPaths);
    process.exit(result.hasError ? 1 : 0);
  } catch (error) {
    console.error('[i18n-check] Unexpected error:', error);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_REFERENCE_TARGET_PATHS,
  analyzeI18n,
  collectLocaleParityIssues,
  collectMissingReferencedKeys,
  collectReferencedTranslationKeys,
  extractTranslationKeyReferencesFromFile,
  flattenLocaleKeys,
  normalizeReferenceTargetPaths,
  runI18nCheck,
};
