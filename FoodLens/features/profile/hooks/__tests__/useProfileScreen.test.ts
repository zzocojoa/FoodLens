import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useProfileScreen } from '../useProfileScreen';

const mockLoadTestUserProfile = jest.fn();
const mockSaveTestUserProfile = jest.fn();
const mockGetManualMergeConflictOperationsForUser = jest.fn();
const mockResolveManualMergeConflictsForUser = jest.fn();
const mockShowTranslatedAlert = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
}));

jest.mock('../../utils/profilePersistence', () => ({
  loadTestUserProfile: (...args: unknown[]) => mockLoadTestUserProfile(...args),
  saveTestUserProfile: (...args: unknown[]) => mockSaveTestUserProfile(...args),
}));

jest.mock('../useProfileRestrictionHandlers', () => ({
  useProfileRestrictionHandlers: () => ({
    addOtherRestriction: jest.fn(),
    removeRestriction: jest.fn(),
    handleInputChange: jest.fn(),
    selectSuggestion: jest.fn(),
  }),
}));

jest.mock('../../utils/profileSuggestions', () => ({
  buildSuggestions: jest.fn(() => []),
}));

jest.mock('@/data/ingredients', () => ({
  SEARCHABLE_INGREDIENTS: [],
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/services/ui/uiAlerts_Logic', () => ({
  showTranslatedAlert: (...args: unknown[]) => mockShowTranslatedAlert(...args),
}));

jest.mock('../../constants/profile.constants', () => ({
  getProfileUserId: () => 'usr_profile',
}));

jest.mock('@/services/sync/phase2ConflictResolution_Logic', () => ({
  getManualMergeConflictOperationsForUser: (...args: unknown[]) =>
    mockGetManualMergeConflictOperationsForUser(...args),
  resolveManualMergeConflictsForUser: (...args: unknown[]) =>
    mockResolveManualMergeConflictsForUser(...args),
}));

jest.mock('@/services/user/userProfileStore_Logic', () => ({
  subscribeUserProfileUpdated: () => () => {},
}));

describe('useProfileScreen saveProfile sync handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadTestUserProfile.mockResolvedValue({
      safetyProfile: { allergies: [], severityMap: {}, dietaryRestrictions: [] },
    });
    mockSaveTestUserProfile.mockRejectedValue(new Error('PHASE2_SYNC_NOT_CONFIRMED'));
    mockGetManualMergeConflictOperationsForUser.mockResolvedValue([]);
    mockResolveManualMergeConflictsForUser.mockResolvedValue({
      total: 1,
      resolved: 1,
      remaining: 0,
    });
  });

  it('shows sync pending alert when save is not confirmed and no conflicts exist', async () => {
    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await result.current.saveProfile();
    });

    const messageKeys = mockShowTranslatedAlert.mock.calls.map(([, payload]) => payload?.messageKey);
    expect(messageKeys).toContain('sync.pending.message');
    expect(messageKeys).not.toContain('profile.alert.saveFailed');
    expect(mockResolveManualMergeConflictsForUser).not.toHaveBeenCalled();
  });

  it('shows deferred alert when user selects Later on conflict prompt', async () => {
    mockGetManualMergeConflictOperationsForUser.mockResolvedValue([{ id: 'op-1' }]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const laterButton = buttons?.find((button) => button.text === 'Later');
      laterButton?.onPress?.();
    });

    const { result } = renderHook(() => useProfileScreen());
    await act(async () => {
      await result.current.saveProfile();
    });

    expect(mockResolveManualMergeConflictsForUser).not.toHaveBeenCalled();
    const messageKeys = mockShowTranslatedAlert.mock.calls.map(([, payload]) => payload?.messageKey);
    expect(messageKeys).toContain('sync.conflict.deferredMessage');
    expect(messageKeys).not.toContain('profile.alert.saveFailed');

    alertSpy.mockRestore();
  });

  it('resolves conflicts with server data when user selects Keep Server', async () => {
    mockGetManualMergeConflictOperationsForUser.mockResolvedValue([{ id: 'op-1' }]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const keepServerButton = buttons?.find((button) => button.text === 'Keep Server');
      keepServerButton?.onPress?.();
    });

    const { result } = renderHook(() => useProfileScreen());
    await act(async () => {
      await result.current.saveProfile();
    });

    expect(mockResolveManualMergeConflictsForUser).toHaveBeenCalledWith({
      userId: 'usr_profile',
      resolution: 'use_server',
    });
    const messageKeys = mockShowTranslatedAlert.mock.calls.map(([, payload]) => payload?.messageKey);
    expect(messageKeys).toContain('sync.conflict.resolvedMessage');
    expect(messageKeys).not.toContain('profile.alert.saveFailed');

    alertSpy.mockRestore();
  });

  it('resolves conflicts with local data when user selects Keep This Device', async () => {
    mockGetManualMergeConflictOperationsForUser.mockResolvedValue([{ id: 'op-1' }]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const keepDeviceButton = buttons?.find((button) => button.text === 'Keep This Device');
      keepDeviceButton?.onPress?.();
    });

    const { result } = renderHook(() => useProfileScreen());
    await act(async () => {
      await result.current.saveProfile();
    });

    expect(mockResolveManualMergeConflictsForUser).toHaveBeenCalledWith({
      userId: 'usr_profile',
      resolution: 'use_local',
    });
    const messageKeys = mockShowTranslatedAlert.mock.calls.map(([, payload]) => payload?.messageKey);
    expect(messageKeys).toContain('sync.conflict.resolvedMessage');
    expect(messageKeys).not.toContain('profile.alert.saveFailed');

    alertSpy.mockRestore();
  });
});
