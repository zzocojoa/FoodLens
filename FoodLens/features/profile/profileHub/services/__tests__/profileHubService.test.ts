import { profileHubService } from '../profileHubService';

const mockGetUserProfile = jest.fn();
const mockCreateOrUpdateProfile = jest.fn();
const mockCreateOrUpdateProfileDeferredSync = jest.fn();
const mockPersistProfileImageIfNeeded = jest.fn();
const mockNormalizeCanonicalLocale = jest.fn();
const mockInitializeI18nStore = jest.fn();
const mockGetI18nSnapshot = jest.fn();
const mockSetI18nSettings = jest.fn();

jest.mock('@/services/userService', () => ({
  UserService: {
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
    CreateOrUpdateProfile: (...args: unknown[]) => mockCreateOrUpdateProfile(...args),
    CreateOrUpdateProfileDeferredSync: (...args: unknown[]) =>
      mockCreateOrUpdateProfileDeferredSync(...args),
  },
}));

jest.mock('../../utils/profileHubStateUtils', () => ({
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

describe('profileHubService.updateProfile', () => {
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
    mockCreateOrUpdateProfileDeferredSync.mockResolvedValue({
      uid: 'usr_1',
    });
  });

  it('applies i18n ui language after profile update succeeds', async () => {
    await profileHubService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: 'file:///tmp/new.jpg',
      uiLanguage: 'ko-KR',
    });

    expect(mockCreateOrUpdateProfileDeferredSync).toHaveBeenCalledTimes(1);
    expect(mockSetI18nSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });

  it('sends the persisted Android local image URI to the profile update payload', async () => {
    const androidLocalImageUri = 'content://media/external/images/media/123';
    const persistedImageUri = 'file:///data/user/0/com.hoihou.foodlens/files/profile/profile-photo.jpg';
    mockPersistProfileImageIfNeeded.mockResolvedValueOnce(persistedImageUri);

    await profileHubService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: androidLocalImageUri,
      uiLanguage: 'ko-KR',
    });

    expect(mockPersistProfileImageIfNeeded).toHaveBeenCalledWith(androidLocalImageUri);
    expect(mockCreateOrUpdateProfileDeferredSync).toHaveBeenCalledWith(
      'usr_1',
      'user@example.com',
      expect.objectContaining({
        name: 'Tester',
        profileImage: persistedImageUri,
      })
    );
  });

  it('skips the profile reload when save inputs already include image and ui language', async () => {
    const androidLocalImageUri = 'content://media/external/images/media/321';
    const persistedImageUri = 'file:///tmp/persisted.jpg';

    await profileHubService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: androidLocalImageUri,
      uiLanguage: 'ko-KR',
    });

    expect(mockGetUserProfile).not.toHaveBeenCalled();
    expect(mockPersistProfileImageIfNeeded).toHaveBeenCalledWith(androidLocalImageUri);
    expect(mockCreateOrUpdateProfileDeferredSync).toHaveBeenCalledWith(
      'usr_1',
      'user@example.com',
      expect.objectContaining({
        name: 'Tester',
        profileImage: persistedImageUri,
      })
    );
  });

  it('keeps the original Android local image URI when persistence falls back to the source URI', async () => {
    const androidLocalImageUri = 'content://media/external/images/media/456';
    mockPersistProfileImageIfNeeded.mockResolvedValueOnce(androidLocalImageUri);

    await profileHubService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: androidLocalImageUri,
      uiLanguage: 'ko-KR',
    });

    expect(mockPersistProfileImageIfNeeded).toHaveBeenCalledWith(androidLocalImageUri);
    expect(mockCreateOrUpdateProfileDeferredSync).toHaveBeenCalledWith(
      'usr_1',
      'user@example.com',
      expect.objectContaining({
        name: 'Tester',
        profileImage: androidLocalImageUri,
      })
    );
  });

  it('loads the existing profile when save inputs need fallback values', async () => {
    await profileHubService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: '',
      uiLanguage: undefined,
    });

    expect(mockGetUserProfile).toHaveBeenCalledWith('usr_1', {
      allowBackgroundRefresh: false,
    });
    expect(mockPersistProfileImageIfNeeded).toHaveBeenCalledWith('file:///tmp/current.jpg');
  });

  it('still applies i18n ui language when deferred profile save resolves immediately', async () => {
    await profileHubService.updateProfile({
      userId: 'usr_1',
      name: 'Tester',
      image: 'file:///tmp/new.jpg',
      uiLanguage: 'ko-KR',
    });

    expect(mockSetI18nSettings).toHaveBeenCalledWith({
      language: 'ko-KR',
      targetLanguage: null,
    });
  });
});

describe('profileHubService.updateSettingsLanguage', () => {
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
    await profileHubService.updateSettingsLanguage({
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

    await profileHubService.updateSettingsLanguage({
      userId: 'usr_1',
      uiLanguage: 'ko-KR',
    });

    expect(mockCreateOrUpdateProfile).not.toHaveBeenCalled();
  });
});

describe('profileHubService.updateTravelerLanguage', () => {
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
    await profileHubService.updateTravelerLanguage({
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
    await profileHubService.updateTravelerLanguage({
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
    await profileHubService.updateTravelerLanguage({
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

    await profileHubService.updateTravelerLanguage({
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
