#!/usr/bin/env node

const { spawnSync } = require('child_process');

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
];

const createJestArguments = () => [
  'jest',
  '--ci',
  '--runInBand',
  ...HISTORY_RUNTIME_TEST_FILES,
];

const createForbiddenLogFindings = (output) =>
  FORBIDDEN_LOG_PATTERNS.filter((entry) => entry.pattern.test(output)).map((entry) => entry.label);

const runHistoryRuntimePerformanceGate = (spawnCommand, writeOutput) => {
  const result = spawnCommand('npx', createJestArguments(), {
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
  createJestArguments,
  runHistoryRuntimePerformanceGate,
};
