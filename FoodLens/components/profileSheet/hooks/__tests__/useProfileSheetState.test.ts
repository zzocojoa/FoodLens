import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useProfileSheetState } from '../useProfileSheetState';

const mockUpdateProfile = jest.fn();
const mockLoadProfile = jest.fn();
const mockUpdateSettingsLanguage = jest.fn();
const mockUpdateTravelerLanguage = jest.fn();
const mockGetManualMergeConflictOperationsForUser = jest.fn();
const mockResolveManualMergeConflictsForUser = jest.fn();
const mockShowTranslatedAlert = jest.fn();
const mockSafeStorageGet = jest.fn();
const mockSafeStorageGetSync = jest.fn();
const mockGetUserStorageKey = jest.fn();
const mockSetUiLanguageInStore = jest.fn();

jest.mock('../../services/profileSheetService', () => ({
  profileSheetService: {
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
    loadProfile: (...args: unknown[]) => mockLoadProfile(...args),
    updateSettingsLanguage: (...args: unknown[]) => mockUpdateSettingsLanguage(...args),
    updateTravelerLanguage: (...args: unknown[]) => mockUpdateTravelerLanguage(...args),
  },
}));

jest.mock('../../utils/profileSheetStateUtils', () => ({
  pickProfileImageUri: jest.fn(),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/features/i18n/services/languageService', () => ({
  normalizeCanonicalLocale: (value: string) => value,
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: (...args: unknown[]) => mockShowTranslatedAlert(...args),
}));

jest.mock('@/services/sync/phase2ConflictResolution', () => ({
  getManualMergeConflictOperationsForUser: (...args: unknown[]) =>
    mockGetManualMergeConflictOperationsForUser(...args),
  resolveManualMergeConflictsForUser: (...args: unknown[]) =>
    mockResolveManualMergeConflictsForUser(...args),
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    getSync: (...args: unknown[]) => mockSafeStorageGetSync(...args),
    get: (...args: unknown[]) => mockSafeStorageGet(...args),
  },
}));

jest.mock('@/services/user/constants', () => ({
  getUserStorageKey: (...args: unknown[]) => mockGetUserStorageKey(...args),
  USER_STORAGE_KEY: '@foodlens_user_profile',
}));

jest.mock('@/features/i18n/services/i18nStore', () => ({
  setUiLanguage: (...args: unknown[]) => mockSetUiLanguageInStore(...args),
}));

describe('useProfileSheetState conflict handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserStorageKey.mockImplementation((userId: string) => `@foodlens_user_profile:${userId}`);
    mockSafeStorageGetSync.mockReturnValue(null);
    mockSafeStorageGet.mockResolvedValue(null);
    mockUpdateSettingsLanguage.mockResolvedValue(undefined);
    mockUpdateTravelerLanguage.mockResolvedValue(undefined);
    mockUpdateProfile.mockRejectedValue(new Error('PHASE2_SYNC_NOT_CONFIRMED'));
    mockGetManualMergeConflictOperationsForUser.mockResolvedValue([{ id: 'op_conflict_1' }]);
    mockResolveManualMergeConflictsForUser.mockResolvedValue({
      total: 1,
      resolved: 1,
      remaining: 0,
    });
  });

  it('resolves pending conflicts instead of showing generic save error on sync-not-confirmed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const keepServerButton = buttons?.find((button) => button.text === 'Keep Server');
      keepServerButton?.onPress?.();
    });

    const { result } = renderHook(() => useProfileSheetState('usr_profile'));
    const onUpdate = jest.fn();
    const onClose = jest.fn();

    await act(async () => {
      await result.current.handleUpdate(onUpdate, onClose);
    });

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockGetManualMergeConflictOperationsForUser).toHaveBeenCalledWith('usr_profile');
    expect(mockResolveManualMergeConflictsForUser).toHaveBeenCalledWith({
      userId: 'usr_profile',
      resolution: 'use_server',
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    const messageKeys = mockShowTranslatedAlert.mock.calls.map(([, payload]) => payload?.messageKey);
    expect(messageKeys).toContain('sync.conflict.resolvedMessage');
    expect(messageKeys).not.toContain('profile.alert.saveFailed');

    alertSpy.mockRestore();
  });

  it('does not overwrite existing image when loaded profile has no image', async () => {
    mockLoadProfile.mockResolvedValue({
      uid: 'usr_profile',
      name: 'Traveler',
      email: 'user@example.com',
      profileImage: '',
      safetyProfile: { allergies: [], dietaryRestrictions: [], severityMap: {} },
      settings: { language: 'en', autoPlayAudio: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useProfileSheetState('usr_profile'));

    act(() => {
      result.current.setImage('https://cdn.example.com/local-selected.jpg');
    });

    await act(async () => {
      await result.current.loadProfile();
    });

    expect(result.current.image).toBe('https://cdn.example.com/local-selected.jpg');
  });

  it('does not overwrite editing name during periodic profile reload', async () => {
    mockLoadProfile.mockResolvedValue({
      uid: 'usr_profile',
      name: 'Original Name',
      email: 'user@example.com',
      profileImage: '',
      safetyProfile: { allergies: [], dietaryRestrictions: [], severityMap: {} },
      settings: { language: 'en', autoPlayAudio: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useProfileSheetState('usr_profile'));

    act(() => {
      result.current.setName('Typing New Name');
    });

    await act(async () => {
      await result.current.loadProfile();
    });

    expect(result.current.name).toBe('Typing New Name');
  });

  it('keeps profile image uri stable when only signed url rotates for same asset', async () => {
    const firstProfile = {
      uid: 'usr_profile',
      name: 'Traveler',
      email: 'user@example.com',
      profileImageAssetId: 'asset_profile_1',
      profileImage:
        'https://cdn.example.com/media/render/asset_profile_1?w=512&q=75&fmt=auto&exp=4102444800&sig=old',
      safetyProfile: { allergies: [], dietaryRestrictions: [], severityMap: {} },
      settings: { language: 'en', autoPlayAudio: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const secondProfile = {
      ...firstProfile,
      profileImage:
        'https://cdn.example.com/media/render/asset_profile_1?w=512&q=75&fmt=auto&exp=4102444801&sig=new',
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    };

    mockLoadProfile.mockResolvedValueOnce(firstProfile).mockResolvedValueOnce(secondProfile);
    const { result } = renderHook(() => useProfileSheetState('usr_profile'));

    await act(async () => {
      await result.current.loadProfile();
    });
    const firstImage = result.current.image;

    await act(async () => {
      await result.current.loadProfile();
    });

    expect(result.current.image).toBe(firstImage);
  });

  it('hydrates from global profile snapshot when scoped snapshot is missing', async () => {
    const globalProfile = {
      uid: 'usr_profile',
      name: 'Global Snapshot',
      email: 'global@example.com',
      profileImage: 'https://cdn.example.com/profile-global.jpg',
      profileImageAssetId: 'asset_global',
      safetyProfile: { allergies: [], dietaryRestrictions: [], severityMap: {} },
      settings: { language: 'en', autoPlayAudio: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    mockSafeStorageGetSync
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(globalProfile);
    mockSafeStorageGet
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(globalProfile);
    mockLoadProfile.mockResolvedValue(null);

    const { result } = renderHook(() => useProfileSheetState('usr_profile'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.image).toBe(globalProfile.profileImage);
  });

  it('applies selected settings language to global i18n store immediately', async () => {
    const { result } = renderHook(() => useProfileSheetState('usr_profile'));

    act(() => {
      result.current.setUiLanguage('ko-KR');
    });

    expect(result.current.uiLanguage).toBe('ko-KR');
    expect(mockSetUiLanguageInStore).toHaveBeenCalledWith('ko-KR');
    expect(mockUpdateSettingsLanguage).toHaveBeenCalledWith({
      userId: 'usr_profile',
      uiLanguage: 'ko-KR',
    });
  });

  it('applies selected traveler language to server immediately', async () => {
    const { result } = renderHook(() => useProfileSheetState('usr_profile'));

    act(() => {
      result.current.setTravelerLanguage('ja-JP');
    });

    expect(result.current.travelerLanguage).toBe('ja-JP');
    expect(mockUpdateTravelerLanguage).toHaveBeenCalledWith({
      userId: 'usr_profile',
      travelerLanguage: 'ja-JP',
    });
  });

  it('applies server language to global i18n store when profile is refreshed', async () => {
    mockLoadProfile.mockResolvedValue({
      uid: 'usr_profile',
      name: 'Traveler',
      email: 'user@example.com',
      profileImage: '',
      safetyProfile: { allergies: [], dietaryRestrictions: [], severityMap: {} },
      settings: { language: 'ko-KR', autoPlayAudio: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useProfileSheetState('usr_profile'));

    await act(async () => {
      await result.current.loadProfile();
    });

    expect(result.current.uiLanguage).toBe('ko-KR');
    expect(mockSetUiLanguageInStore).toHaveBeenCalledWith('ko-KR');
  });
});
