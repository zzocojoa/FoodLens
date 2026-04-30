const historyRuntimePerformanceGate = require('../history-runtime-performance-gate.js');

type SpawnResult = {
  error?: Error;
  status: number;
  stdout: string;
  stderr: string;
};

describe('history-runtime-performance-gate', () => {
  it('runs the History virtualized fixture contract test only', () => {
    expect(historyRuntimePerformanceGate.createJestArguments()).toEqual([
      'jest',
      '--ci',
      '--runInBand',
      'features/history/components/__tests__/HistoryCountryChapters.test.tsx',
    ]);
  });

  it('detects noisy logs that can hide mobile runtime regressions', () => {
    const output = [
      'PASS features/history/components/__tests__/HistoryCountryChapters.test.tsx',
      'console.warn',
      'An update to HistoryCountryChapters inside a test was not wrapped in act(',
    ].join('\n');

    expect(historyRuntimePerformanceGate.createForbiddenLogFindings(output)).toEqual([
      'React act warning',
      'Jest console warn',
    ]);
  });

  it('fails when the focused Jest run passes with noisy output', () => {
    const spawnCommand = jest.fn((): SpawnResult => ({
      status: 0,
      stdout: 'PASS\nconsole.error\n',
      stderr: '',
    }));

    expect(() => historyRuntimePerformanceGate.runHistoryRuntimePerformanceGate(spawnCommand, false)).toThrow(
      'History runtime performance gate produced noisy logs: Jest console error',
    );
  });

  it('fails when the focused Jest run fails', () => {
    const spawnCommand = jest.fn((): SpawnResult => ({
      status: 1,
      stdout: '',
      stderr: 'FAIL\n',
    }));

    expect(() => historyRuntimePerformanceGate.runHistoryRuntimePerformanceGate(spawnCommand, false)).toThrow(
      'History runtime performance gate failed with status 1',
    );
  });

  it('fails when Jest cannot start', () => {
    const spawnCommand = jest.fn((): SpawnResult => ({
      error: new Error('spawn npx ENOENT'),
      status: 0,
      stdout: '',
      stderr: '',
    }));

    expect(() => historyRuntimePerformanceGate.runHistoryRuntimePerformanceGate(spawnCommand, false)).toThrow(
      'History runtime performance gate could not start Jest: spawn npx ENOENT',
    );
  });
});
