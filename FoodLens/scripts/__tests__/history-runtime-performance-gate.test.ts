const historyRuntimePerformanceGate = require('../history-runtime-performance-gate.js');

type SpawnResult = {
  error?: Error;
  status: number;
  stdout: string;
  stderr: string;
};

describe('history-runtime-performance-gate', () => {
  it('runs the History virtualized fixture contract test only', () => {
    expect(historyRuntimePerformanceGate.createJestCommand()).toBe(process.execPath);
    expect(historyRuntimePerformanceGate.createJestArguments()).toEqual([
      '--expose-gc',
      expect.stringMatching(/jest[/\\]bin[/\\]jest\.js$/),
      '--ci',
      '--runInBand',
      '--logHeapUsage',
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

  it('detects runtime warnings that map to History frame-drop and memory risk', () => {
    const output = [
      'VirtualizedList: You have a large list that is slow to update',
      'Dropped frames while rendering the history list',
      'Possible EventEmitter memory leak detected',
    ].join('\n');

    expect(historyRuntimePerformanceGate.createForbiddenLogFindings(output)).toEqual([
      'VirtualizedList slow update warning',
      'Frame drop warning',
      'Memory pressure warning',
    ]);
  });

  it('fails when heap usage exceeds the synthetic History budget', () => {
    expect(historyRuntimePerformanceGate.createHeapUsageFindings('PASS (193 MB heap size)')).toEqual([
      'History runtime heap usage 193 MB exceeded 192 MB',
    ]);
  });

  it('fails when heap usage is missing from a passing focused run', () => {
    expect(historyRuntimePerformanceGate.createHeapUsageFindings('PASS')).toEqual([
      'History runtime heap usage metric missing',
    ]);
  });

  it('passes when the focused Jest run is clean and inside the heap budget', () => {
    const spawnCommand = jest.fn((): SpawnResult => ({
      status: 0,
      stdout: 'PASS (110 MB heap size)\n',
      stderr: '',
    }));

    expect(() => historyRuntimePerformanceGate.runHistoryRuntimePerformanceGate(spawnCommand, false)).not.toThrow();
    expect(spawnCommand).toHaveBeenCalledWith(
      process.execPath,
      historyRuntimePerformanceGate.createJestArguments(),
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
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
