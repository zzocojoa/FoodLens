import fs from 'fs';
import os from 'os';
import path from 'path';

const script = require('../i18n-hardcoded-check.js') as {
  DEFAULT_TARGET_PATHS: string[];
  collectFindings: (targetPaths: string[]) => Array<{
    filePath: string;
    kind: string;
    text: string;
    line: number;
  }>;
  normalizeTargetPaths: (targetPaths: string[]) => string[];
};

const writeFile = (rootDir: string, relativePath: string, content: string): void => {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

const createTempProject = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'foodlens-i18n-hardcoded-'));

const withCurrentWorkingDirectory = <T>(cwd: string, run: () => T): T => {
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return run();
  } finally {
    process.chdir(previousCwd);
  }
};

describe('i18n-hardcoded-check', () => {
  it('includes home components, utils, and hooks in the default target list', () => {
    expect(script.DEFAULT_TARGET_PATHS).toEqual(
      expect.arrayContaining([
        'features/home/components',
        'features/home/utils',
        'features/home/hooks',
      ])
    );
  });

  it('keeps scoped target paths unchanged when explicit paths are passed', () => {
    expect(script.normalizeTargetPaths(['features/home/utils', 'features/home/hooks'])).toEqual([
      'features/home/utils',
      'features/home/hooks',
    ]);

    expect(script.normalizeTargetPaths([])).toEqual(script.DEFAULT_TARGET_PATHS);
  });

  it('detects home utility, component, and hook strings while ignoring unrelated scoped files', () => {
    const tempRoot = createTempProject();
    try {
      writeFile(
        tempRoot,
        'features/home/utils/homeUi.ts',
        [
          'export const getHomeScanStatusBadge = () => ({',
          "  label: 'OK',",
          "  backgroundColor: '#DCFCE7',",
          "  textColor: '#15803D',",
          '});',
          '',
        ].join('\n')
      );

      writeFile(
        tempRoot,
        'features/home/components/HomeScansSection.tsx',
        [
          "import { Text } from 'react-native';",
          '',
          'export const HomeScansSection = () => <Text>Recent scans</Text>;',
          '',
        ].join('\n')
      );

      writeFile(
        tempRoot,
        'features/home/hooks/useHomeDashboard.ts',
        [
          'export const useHomeDashboard = () => {',
          "  const alertCopy = { titleFallback: 'Title fallback', messageFallback: 'Message fallback' };",
          '  return alertCopy;',
          '};',
          '',
        ].join('\n')
      );

      writeFile(
        tempRoot,
        'features/profile/screens/ProfileHubScreen.tsx',
        [
          "import { Alert } from 'react-native';",
          '',
          "Alert.alert('Log out?', 'This should not be scanned in a home-only run');",
          '',
        ].join('\n')
      );

      const findings = withCurrentWorkingDirectory(tempRoot, () =>
        script.collectFindings([
          'features/home/utils',
          'features/home/components',
          'features/home/hooks',
        ])
      );

      expect(findings).toHaveLength(4);
      expect(findings.map((finding) => finding.filePath)).toEqual(
        expect.arrayContaining([
          'features/home/utils/homeUi.ts',
          'features/home/components/HomeScansSection.tsx',
          'features/home/hooks/useHomeDashboard.ts',
        ])
      );
      expect(findings.some((finding) => finding.filePath === 'features/profile/screens/ProfileHubScreen.tsx')).toBe(
        false
      );
      expect(findings.map((finding) => finding.kind)).toEqual(
        expect.arrayContaining(['ui-prop:label', 'jsx-text', 'ui-prop:title', 'ui-prop:message'])
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
