import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const i18nCheck = require('../i18n-check.js');

const writeJsonFile = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
};

const writeTextFile = (filePath: string, value: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
};

const createWorkspace = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'foodlens-i18n-check-'));

const cleanupWorkspace = (rootDir: string): void => {
  fs.rmSync(rootDir, { recursive: true, force: true });
};

const muteConsole = <T>(callback: () => T): T => {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return callback();
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
};

describe('i18n-check', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('flags literal translation references that are missing from the base locale and ignores dynamic keys', () => {
    const rootDir = createWorkspace();

    try {
      writeJsonFile(path.join(rootDir, 'features', 'i18n', 'resources', 'en.json'), {
        'common.done': 'Done',
      });
      writeJsonFile(path.join(rootDir, 'features', 'i18n', 'resources', 'ko.json'), {
        'common.done': '완료',
      });
      writeTextFile(
        path.join(rootDir, 'features', 'home', 'screens', 'HomeScreen.tsx'),
        [
          "export const resolved = t('common.done');",
          "export const safe = t('home.status.chip.safe', '안정');",
          "export const featured = translate('home.scans.featuredTitle', '가장 최근 판단');",
          "const dynamicKey = 'home.dynamic';",
          'export const ignored = t(dynamicKey);',
          'export const ignoredTemplate = translate(`home.${dynamicKey}`);',
          '',
        ].join('\n')
      );

      const result = muteConsole(() => i18nCheck.runI18nCheck(rootDir));

      expect(result.hasError).toBe(true);
      expect(result.localeParityIssues).toEqual([]);
      expect(result.missingReferencedKeys.map((entry: { key: string }) => entry.key)).toEqual([
        'home.scans.featuredTitle',
        'home.status.chip.safe',
      ]);
      expect(result.referencedKeys.map((entry: { key: string }) => entry.key)).toContain('common.done');
      expect(result.referencedKeys.map((entry: { key: string }) => entry.key)).not.toContain('home.dynamic');
    } finally {
      cleanupWorkspace(rootDir);
    }
  });

  it('keeps locale parity failures when a locale is missing a base key', () => {
    const rootDir = createWorkspace();

    try {
      writeJsonFile(path.join(rootDir, 'features', 'i18n', 'resources', 'en.json'), {
        'common.done': 'Done',
        'home.status.chip.safe': 'Safe',
      });
      writeJsonFile(path.join(rootDir, 'features', 'i18n', 'resources', 'ko.json'), {
        'common.done': '완료',
      });
      writeTextFile(
        path.join(rootDir, 'app', 'index.tsx'),
        [
          "export const resolved = t('common.done');",
          '',
        ].join('\n')
      );

      const result = muteConsole(() => i18nCheck.runI18nCheck(rootDir));

      expect(result.hasError).toBe(true);
      expect(result.localeParityIssues).toHaveLength(1);
      expect(result.localeParityIssues[0]).toMatchObject({
        fileName: 'ko.json',
        missing: ['home.status.chip.safe'],
        extra: [],
      });
      expect(result.missingReferencedKeys).toEqual([]);
    } finally {
      cleanupWorkspace(rootDir);
    }
  });

  it('scans app, navigation, and profile hub paths by default', () => {
    const rootDir = createWorkspace();

    try {
      writeJsonFile(path.join(rootDir, 'features', 'i18n', 'resources', 'en.json'), {
        'common.done': 'Done',
      });
      writeJsonFile(path.join(rootDir, 'features', 'i18n', 'resources', 'ko.json'), {
        'common.done': '완료',
      });
      writeTextFile(
        path.join(rootDir, 'app', '_layout.tsx'),
        [
          "export const exitPrompt = t('bottomNav.exitPrompt', '뒤로가기를 한 번 더 누르면 앱이 종료됩니다.');",
          '',
        ].join('\n')
      );
      writeTextFile(
        path.join(rootDir, 'components', 'navigation', 'FloatingBottomNav.tsx'),
        [
          "export const homeLabel = t('bottomNav.home', 'Home');",
          '',
        ].join('\n')
      );
      writeTextFile(
        path.join(rootDir, 'features', 'profile', 'screens', 'ProfileHubScreen.tsx'),
        [
          "export const title = t('profileHub.title', 'Profile');",
          '',
        ].join('\n')
      );

      const result = muteConsole(() => i18nCheck.runI18nCheck(rootDir));

      expect(result.hasError).toBe(true);
      expect(result.missingReferencedKeys.map((entry: { key: string }) => entry.key)).toEqual([
        'bottomNav.exitPrompt',
        'bottomNav.home',
        'profileHub.title',
      ]);
    } finally {
      cleanupWorkspace(rootDir);
    }
  });
});
