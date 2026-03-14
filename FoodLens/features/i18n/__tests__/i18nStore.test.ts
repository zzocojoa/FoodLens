const mockLoadLanguageSettings = jest.fn();
const mockNormalizeCanonicalLocale = jest.fn();
const mockNormalizeLanguageSettings = jest.fn();
const mockResolveEffectiveLocale = jest.fn();
const mockSaveLanguageSettings = jest.fn();
const mockSafeStorageGetSync = jest.fn();
const mockSafeStorageSet = jest.fn();
const mockGetCurrentUserIdSnapshot = jest.fn();
const mockPublishUserProfileUpdated = jest.fn();
const mockPhase2GetSettings = jest.fn();
const mockGetQueuedPhase2EntityPayload = jest.fn();

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    getSync: (...args: unknown[]) => mockSafeStorageGetSync(...args),
    set: (...args: unknown[]) => mockSafeStorageSet(...args),
  },
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserIdSnapshot: (...args: unknown[]) => mockGetCurrentUserIdSnapshot(...args),
}));

jest.mock('@/services/user/constants', () => ({
  USER_STORAGE_KEY: '@foodlens_user_profile',
  getUserStorageKey: (uid: string) => `@foodlens_user_profile:${uid}`,
}));

jest.mock('../services/languageService', () => ({
  loadLanguageSettings: (...args: unknown[]) => mockLoadLanguageSettings(...args),
  normalizeCanonicalLocale: (...args: unknown[]) => mockNormalizeCanonicalLocale(...args),
  normalizeLanguageSettings: (...args: unknown[]) => mockNormalizeLanguageSettings(...args),
  resolveEffectiveLocale: (...args: unknown[]) => mockResolveEffectiveLocale(...args),
  saveLanguageSettings: (...args: unknown[]) => mockSaveLanguageSettings(...args),
}));

jest.mock('@/services/user/userProfileStore', () => ({
  publishUserProfileUpdated: (...args: unknown[]) => mockPublishUserProfileUpdated(...args),
}));

jest.mock('@/services/sync/phase2Api', () => ({
  Phase2Api: {
    getSettings: (...args: unknown[]) => mockPhase2GetSettings(...args),
  },
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  getQueuedPhase2EntityPayload: (...args: unknown[]) => mockGetQueuedPhase2EntityPayload(...args),
}));

describe('i18nStore initialization', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockLoadLanguageSettings.mockResolvedValue({
      language: 'en-US',
      targetLanguage: null,
    });
    mockNormalizeCanonicalLocale.mockImplementation((value: unknown) => value);
    mockNormalizeLanguageSettings.mockImplementation((value: unknown) => value);
    mockResolveEffectiveLocale.mockImplementation((settings: { language?: string }) =>
      settings?.language === 'ko-KR' ? 'ko-KR' : 'en-US'
    );
    mockSafeStorageSet.mockResolvedValue(undefined);
    mockPhase2GetSettings.mockResolvedValue({
      settings: {
        language: 'ko-KR',
        target_language: null,
      },
      requestId: 'req-settings',
    });
    mockGetQueuedPhase2EntityPayload.mockResolvedValue(null);
    mockGetCurrentUserIdSnapshot.mockReturnValue('usr_i18n');
    mockSafeStorageGetSync.mockReturnValue(null);
  });

  it('keeps persisted i18n settings when profile snapshot has no language', async () => {
    const store = require('../services/i18nStore') as typeof import('../services/i18nStore');

    await store.initializeI18nStore();

    expect(mockSaveLanguageSettings).not.toHaveBeenCalled();
    expect(store.getI18nSnapshot().settings.language).toBe('en-US');
    expect(store.getI18nSnapshot().locale).toBe('en-US');
  });

  it('prefers profile language snapshot over stale persisted settings at startup', async () => {
    mockSafeStorageGetSync.mockImplementation((key: string) => {
      if (key === '@foodlens_user_profile:usr_i18n') {
        return {
          settings: {
            language: 'auto',
            targetLanguage: null,
          },
        };
      }
      return null;
    });

    const store = require('../services/i18nStore') as typeof import('../services/i18nStore');

    await store.initializeI18nStore();

    expect(mockSaveLanguageSettings).toHaveBeenCalledWith({
      language: 'auto',
      targetLanguage: null,
    });
    expect(store.getI18nSnapshot().settings.language).toBe('auto');
  });

  it('prefers profile auto traveler target over stale persisted target at startup', async () => {
    mockLoadLanguageSettings.mockResolvedValue({
      language: 'en-US',
      targetLanguage: 'ko-KR',
    });
    mockSafeStorageGetSync.mockImplementation((key: string) => {
      if (key === '@foodlens_user_profile:usr_i18n') {
        return {
          settings: {
            language: 'ko-KR',
            targetLanguage: null,
          },
        };
      }
      return null;
    });

    const store = require('../services/i18nStore') as typeof import('../services/i18nStore');

    await store.initializeI18nStore();

    expect(mockSaveLanguageSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: null,
    });
    expect(store.getI18nSnapshot().settings).toEqual({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });

  it('treats omitted traveler target from server settings as auto mode', async () => {
    const store = require('../services/i18nStore') as typeof import('../services/i18nStore');

    expect(
      store.normalizeRemoteLanguageSettings({
        language: 'ko-KR',
      })
    ).toEqual({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });

  it('keeps queued traveler auto payload over stale remote manual target', async () => {
    mockPhase2GetSettings.mockResolvedValue({
      settings: {
        language: 'ko-KR',
        target_language: 'ko-KR',
      },
      requestId: 'req-settings-stale',
    });
    mockGetQueuedPhase2EntityPayload.mockResolvedValue({
      language: 'ko-KR',
      target_language: null,
      auto_play_audio: false,
    });

    const store = require('../services/i18nStore') as typeof import('../services/i18nStore');

    await store.initializeI18nStore();
    await store.syncI18nSettingsFromProfile({ pullFromServer: true });

    expect(store.getI18nSnapshot().settings).toEqual({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });

  it('ignores stale remote manual traveler target when local settings version is newer', async () => {
    mockSafeStorageGetSync.mockImplementation((key: string) => {
      if (key === '@foodlens_user_profile:usr_i18n') {
        return {
          settings: {
            language: 'ko-KR',
            targetLanguage: null,
          },
          syncVersions: {
            settingsUpdatedAt: '2026-03-14T01:00:10.000Z',
          },
        };
      }
      return null;
    });
    mockPhase2GetSettings.mockResolvedValue({
      settings: {
        language: 'ko-KR',
        target_language: 'ko-KR',
        updated_at: '2026-03-14T01:00:00.000Z',
      },
      requestId: 'req-settings-stale-version',
    });

    const store = require('../services/i18nStore') as typeof import('../services/i18nStore');

    await store.initializeI18nStore();
    await store.syncI18nSettingsFromProfile({ pullFromServer: true });

    expect(store.getI18nSnapshot().settings).toEqual({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });
});
