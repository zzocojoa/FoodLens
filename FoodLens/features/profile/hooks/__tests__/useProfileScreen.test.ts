import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useProfileScreen } from '../useProfileScreen';

const mockLoadTestUserProfile = jest.fn();
const mockSaveTestUserProfile = jest.fn();
const mockGetManualMergeConflictOperationsForUser = jest.fn();
const mockResolveManualMergeConflictsForUser = jest.fn();
const mockShowTranslatedAlert = jest.fn();
const mockSubscribeUserProfileUpdated = jest.fn();

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
  createCustomRestrictionValue: (value: string) => {
    const item = value.trim();
    return item ? `custom:${item}` : '';
  },
  resolveSuggestionStorageValue: (value: string) => value.trim(),
}));

jest.mock('@/data/ingredients', () => ({
  SEARCHABLE_INGREDIENTS: [],
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: (...args: unknown[]) => mockShowTranslatedAlert(...args),
}));

jest.mock('../../constants/profile.constants', () => ({
  getProfileUserId: () => 'usr_profile',
}));

jest.mock('@/services/sync/phase2ConflictResolution', () => ({
  getManualMergeConflictOperationsForUser: (...args: unknown[]) =>
    mockGetManualMergeConflictOperationsForUser(...args),
  resolveManualMergeConflictsForUser: (...args: unknown[]) =>
    mockResolveManualMergeConflictsForUser(...args),
}));

jest.mock('@/services/user/userProfileStore', () => ({
  subscribeUserProfileUpdated: (...args: unknown[]) => mockSubscribeUserProfileUpdated(...args),
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
    mockSubscribeUserProfileUpdated.mockReturnValue(() => {});
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

  it('keeps local allergy edits when silent refresh runs', async () => {
    mockLoadTestUserProfile.mockResolvedValue({
      safetyProfile: { allergies: ['egg'], severityMap: { egg: 'moderate' }, dietaryRestrictions: [] },
    });

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.toggleAllergen('milk');
    });

    await act(async () => {
      await result.current.loadProfile({ silent: true });
    });

    expect(result.current.allergies).toContain('milk');
  });

  it('allows removing custom allergen by toggling it again', async () => {
    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.addCustomAllergen('Kiwi');
    });
    expect(result.current.allergies).toContain('custom:Kiwi');
    expect(result.current.severityMap['custom:Kiwi']).toBe('moderate');

    await act(async () => {
      result.current.toggleAllergen('custom:Kiwi');
    });
    expect(result.current.allergies).not.toContain('custom:Kiwi');
    expect(result.current.severityMap['custom:Kiwi']).toBeUndefined();
  });

  it('ignores client_state_write profile updates', async () => {
    jest.useFakeTimers();
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null =
      null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, callback: typeof listener) => {
      listener = callback;
      return jest.fn();
    });

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockLoadTestUserProfile).toHaveBeenCalledTimes(1);

    act(() => {
      listener?.('client_state_write');
      jest.advanceTimersByTime(250);
    });

    expect(mockLoadTestUserProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      listener?.('server_pull');
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(mockLoadTestUserProfile).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(false);
  });
});
