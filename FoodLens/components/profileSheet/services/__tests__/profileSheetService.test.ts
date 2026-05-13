import { profileSheetService } from '../profileSheetService';

const mockGetUserProfile = jest.fn();
const mockCreateOrUpdateProfile = jest.fn();
const mockPersistProfileImageIfNeeded = jest.fn();
const mockNormalizeCanonicalLocale = jest.fn();
const mockInitializeI18nStore = jest.fn();
const mockGetI18nSnapshot = jest.fn();
const mockSetI18nSettings = jest.fn();

jest.mock('@/services/userService', () => ({
  UserService: {
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
    CreateOrUpdateProfile: (...args: unknown[]) => mockCreateOrUpdateProfile(...args),
  },
}));

jest.mock('../../utils/profileSheetStateUtils', () => ({
  persistProfileImageIfNeeded: (...args: unknown[]) => mockPersistProfileImageIfNeeded(...args),
}));

jest.mock('@/features/i18n/services/languageService', () => ({
  normalizeCanonicalLocale: (...args: unknown[]) => mockNormalizeCanonicalLocale(...args),
}));

jest.mock('@/features/i18n/services/i18nStore', () => ({
  initializeI18nStore: (...args: unknown[]) => mockInitializeI18nStore(...args),
  getI18nSnapshot: (...args: unknown[]) => mockGetI18nSnapshot(...args),
  setI18nSettings: (...args: unknown[]) => mockSetI18nSettings(...args),
}));

describe('profileSheetService.updateProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({
      email: 'user@example.com',
      profileImage: 'file:///tmp/current.jpg',
      settings: { language: 'auto', targetLanguage: null, autoPlayAudio: false, selectedEmoji: null },
    });
    mockPersistProfileImageIfNeeded.mockResolvedValue('file:///tmp/persisted.jpg');
    mockNormalizeCanonicalLocale.mockReturnValue('ko-KR');
    mockInitializeI18nStore.mockResolvedValue(undefined);
    mockGetI18nSnapshot.mockReturnValue({
      settings: { language: 'auto', targetLanguage: null },
    });
    mockSetI18nSettings.mockResolvedValue(undefined);
    mockCreateOrUpdateProfile.mockResolvedValue({
      uid: 'usr_1',
    });
  });

  it('applies i18n ui language after profile update succeeds', async () => {
    await profileSheetService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: 'file:///tmp/new.jpg',
      uiLanguage: 'ko-KR',
    });

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockSetI18nSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });

  it('still applies i18n ui language when sync confirmation is deferred', async () => {
    mockCreateOrUpdateProfile.mockRejectedValue(new Error('PHASE2_SYNC_NOT_CONFIRMED'));

    await expect(
      profileSheetService.updateProfile({
        userId: 'usr_1',
        name: 'Tester',
        image: 'file:///tmp/new.jpg',
        uiLanguage: 'ko-KR',
      })
    ).rejects.toThrow('PHASE2_SYNC_NOT_CONFIRMED');

    expect(mockSetI18nSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });

  it('does not save the profile when image persistence fails', async () => {
    const persistenceError = new Error('copy failed');
    mockPersistProfileImageIfNeeded.mockRejectedValueOnce(persistenceError);

    await expect(
      profileSheetService.updateProfile({
        userId: 'usr_1',
        name: 'Tester',
        image: 'content://media/external/images/media/456',
        uiLanguage: 'ko-KR',
      })
    ).rejects.toThrow(persistenceError);

    expect(mockCreateOrUpdateProfile).not.toHaveBeenCalled();
    expect(mockSetI18nSettings).not.toHaveBeenCalled();
  });

  it('does not repersist the existing image when only profile text changes', async () => {
    await profileSheetService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: 'content://media/external/images/media/existing',
      imageChanged: false,
      uiLanguage: 'ko-KR',
    });

    expect(mockGetUserProfile).not.toHaveBeenCalled();
    expect(mockPersistProfileImageIfNeeded).not.toHaveBeenCalled();
    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith(
      'usr_1',
      'user@example.com',
      {
        name: 'Tester',
      }
    );
  });
});

describe('profileSheetService.updateSettingsLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({
      email: 'user@example.com',
      settings: { language: 'auto', targetLanguage: 'en', autoPlayAudio: false, selectedEmoji: null },
    });
    mockNormalizeCanonicalLocale.mockImplementation((value: string) => value);
    mockInitializeI18nStore.mockResolvedValue(undefined);
    mockGetI18nSnapshot.mockReturnValue({
      settings: { language: 'auto', targetLanguage: null },
    });
    mockSetI18nSettings.mockResolvedValue(undefined);
    mockCreateOrUpdateProfile.mockResolvedValue({ uid: 'usr_1' });
  });

  it('auto-saves selected settings language to server', async () => {
    await profileSheetService.updateSettingsLanguage({
      userId: 'usr_1',
      uiLanguage: 'ko-KR',
    });

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith(
      'usr_1',
      'user@example.com',
      expect.objectContaining({
        settings: expect.objectContaining({
          language: 'ko-KR',
        }),
      })
    );
  });

  it('skips server write when selected language is already current', async () => {
    mockGetUserProfile.mockResolvedValue({
      email: 'user@example.com',
      settings: { language: 'ko-KR', targetLanguage: 'en', autoPlayAudio: false, selectedEmoji: null },
    });

    await profileSheetService.updateSettingsLanguage({
      userId: 'usr_1',
      uiLanguage: 'ko-KR',
    });

    expect(mockCreateOrUpdateProfile).not.toHaveBeenCalled();
  });
});

describe('profileSheetService.updateTravelerLanguage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({
      email: 'user@example.com',
      settings: { language: 'ko-KR', targetLanguage: 'en-US', autoPlayAudio: false, selectedEmoji: null },
    });
    mockNormalizeCanonicalLocale.mockImplementation((value: string) => value);
    mockInitializeI18nStore.mockResolvedValue(undefined);
    mockGetI18nSnapshot.mockReturnValue({
      settings: { language: 'ko-KR', targetLanguage: 'en-US' },
    });
    mockSetI18nSettings.mockResolvedValue(undefined);
    mockCreateOrUpdateProfile.mockResolvedValue({ uid: 'usr_1' });
  });

  it('auto-saves selected traveler language to server', async () => {
    await profileSheetService.updateTravelerLanguage({
      userId: 'usr_1',
      travelerLanguage: 'ja-JP',
    });

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith(
      'usr_1',
      'user@example.com',
      expect.objectContaining({
        settings: expect.objectContaining({
          targetLanguage: 'ja-JP',
        }),
      })
    );
    expect(mockSetI18nSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: 'ja-JP',
    });
  });

  it('maps auto selection to undefined target language', async () => {
    await profileSheetService.updateTravelerLanguage({
      userId: 'usr_1',
      travelerLanguage: undefined,
    });

    expect(mockGetUserProfile).toHaveBeenCalledWith('usr_1', {
      allowBackgroundRefresh: false,
      forceServerRefresh: true,
    });

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith(
      'usr_1',
      'user@example.com',
      expect.objectContaining({
        settings: expect.objectContaining({
          targetLanguage: undefined,
        }),
      })
    );
    expect(mockSetI18nSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });

  it('skips server write when selected traveler language is already current', async () => {
    await profileSheetService.updateTravelerLanguage({
      userId: 'usr_1',
      travelerLanguage: 'en-US',
    });

    expect(mockCreateOrUpdateProfile).not.toHaveBeenCalled();
  });

  it('aborts stale traveler language save before server write', async () => {
    let shouldAbort = false;
    mockGetUserProfile.mockImplementation(async () => {
      shouldAbort = true;
      return {
        email: 'user@example.com',
        settings: { language: 'ko-KR', targetLanguage: 'en-US', autoPlayAudio: false, selectedEmoji: null },
      };
    });

    await profileSheetService.updateTravelerLanguage({
      userId: 'usr_1',
      travelerLanguage: undefined,
      shouldAbort: () => shouldAbort,
    });

    expect(mockCreateOrUpdateProfile).not.toHaveBeenCalled();
    expect(mockSetI18nSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });
});
