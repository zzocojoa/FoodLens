#!/usr/bin/env node

const { spawnSync } = require('child_process');

const HISTORY_RUNTIME_HEAP_LIMIT_MB = 192;
const HISTORY_RUNTIME_TEST_FILES = [
  'features/history/components/__tests__/HistoryCountryChapters.test.tsx',
];

const FORBIDDEN_LOG_PATTERNS = [
  {
    label: 'React act warning',
    pattern: /was not wrapped in act\(/,
  },
  {
    label: 'Jest console error',
    pattern: /\bconsole\.error\b/,
  },
  {
    label: 'Jest console warn',
    pattern: /\bconsole\.warn\b/,
  },
  {
    label: 'VirtualizedList slow update warning',
    pattern: /VirtualizedList:.*slow to update/i,
  },
  {
    label: 'Frame drop warning',
    pattern: /\b(?:dropped frames?|frame drops?|frame-drop|frame drop)\b/i,
  },
  {
    label: 'Memory pressure warning',
    pattern: /\b(?:JavaScript heap out of memory|Allocation failed|memory leak|Possible EventEmitter memory leak detected)\b/i,
  },
];

const HEAP_USAGE_PATTERN = /(\d+(?:\.\d+)?)\s*MB heap size/g;

const createJestCommand = () => process.execPath;

const createJestArguments = () => [
  '--expose-gc',
  require.resolve('jest/bin/jest'),
  '--ci',
  '--runInBand',
  '--logHeapUsage',
  ...HISTORY_RUNTIME_TEST_FILES,
];

const createForbiddenLogFindings = (output) =>
  FORBIDDEN_LOG_PATTERNS.filter((entry) => entry.pattern.test(output)).map((entry) => entry.label);

const collectHeapUsages = (output) =>
  Array.from(output.matchAll(HEAP_USAGE_PATTERN)).map((match) => Number(match[1]));

const createHeapUsageFindings = (output) => {
  const heapUsages = collectHeapUsages(output);

  if (heapUsages.length === 0) {
    return ['History runtime heap usage metric missing'];
  }

  return heapUsages
    .filter((heapUsageMb) => heapUsageMb > HISTORY_RUNTIME_HEAP_LIMIT_MB)
    .map((heapUsageMb) => (
      `History runtime heap usage ${heapUsageMb} MB exceeded ${HISTORY_RUNTIME_HEAP_LIMIT_MB} MB`
    ));
};

const runHistoryRuntimePerformanceGate = (spawnCommand, writeOutput) => {
  const result = spawnCommand(createJestCommand(), createJestArguments(), {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const output = `${stdout}\n${stderr}`;

  if (result.error) {
    throw new Error(`History runtime performance gate could not start Jest: ${result.error.message}`);
  }

  if (writeOutput && stdout.length > 0) {
    process.stdout.write(stdout);
  }
  if (writeOutput && stderr.length > 0) {
    process.stderr.write(stderr);
  }

  if (result.status !== 0) {
    throw new Error(`History runtime performance gate failed with status ${result.status}`);
  }

  const noisyFindings = createForbiddenLogFindings(output);
  if (noisyFindings.length > 0) {
    throw new Error(`History runtime performance gate produced noisy logs: ${noisyFindings.join(', ')}`);
  }

  const heapFindings = createHeapUsageFindings(output);
  if (heapFindings.length > 0) {
    throw new Error(`History runtime performance gate exceeded runtime budgets: ${heapFindings.join(', ')}`);
  }
};

const main = () => {
  runHistoryRuntimePerformanceGate(spawnSync, true);
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  createForbiddenLogFindings,
  createHeapUsageFindings,
  createJestArguments,
  createJestCommand,
  runHistoryRuntimePerformanceGate,
};
