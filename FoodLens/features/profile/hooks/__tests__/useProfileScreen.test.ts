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
  PROFILE_AUTH_REQUIRED_ERROR: 'PROFILE_AUTH_REQUIRED',
  loadTestUserProfile: (...args: unknown[]) => mockLoadTestUserProfile(...args),
  saveTestUserProfile: (...args: unknown[]) => mockSaveTestUserProfile(...args),
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

  it('shows login required alert when profile save lacks an authenticated user id', async () => {
    mockSaveTestUserProfile.mockRejectedValue(new Error('PROFILE_AUTH_REQUIRED'));

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await result.current.saveProfile();
    });

    const messageKeys = mockShowTranslatedAlert.mock.calls.map(([, payload]) => payload?.messageKey);
    expect(messageKeys).toContain('profile.alert.authRequiredMessage');
    expect(messageKeys).not.toContain('profile.alert.saveFailed');
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

  it('saves selected canonical and custom other restrictions', async () => {
    mockSaveTestUserProfile.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.selectSuggestion('peach');
      result.current.handleInputChange('no nightshades');
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.addOtherRestriction();
    });

    await act(async () => {
      await result.current.saveProfile();
    });

    expect(mockSaveTestUserProfile).toHaveBeenCalledWith(
      [],
      ['peach', 'custom:no nightshades'],
      {
        peach: 'moderate',
        'custom:no nightshades': 'moderate',
      },
    );
  });

  it('keeps local other restriction deletion when silent refresh runs before save', async () => {
    mockLoadTestUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: [],
        severityMap: {},
        dietaryRestrictions: ['peach', 'custom:no nightshades'],
      },
    });
    mockSaveTestUserProfile.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.removeRestriction('peach');
    });

    await act(async () => {
      await result.current.loadProfile({ silent: true });
    });

    expect(result.current.otherRestrictions).toEqual(['custom:no nightshades']);

    await act(async () => {
      await result.current.saveProfile();
    });

    expect(mockSaveTestUserProfile).toHaveBeenCalledWith(
      [],
      ['custom:no nightshades'],
      {
        'custom:no nightshades': 'moderate',
      },
    );
  });

  it('loads existing other restrictions into the severity map without moving storage fields', async () => {
    mockLoadTestUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['egg'],
        severityMap: { egg: 'severe', peach: 'mild' },
        dietaryRestrictions: ['peach', 'custom:no nightshades'],
      },
    });
    mockSaveTestUserProfile.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.allergies).toEqual(['egg']);
    expect(result.current.otherRestrictions).toEqual(['peach', 'custom:no nightshades']);
    expect(result.current.severityMap).toEqual({
      egg: 'severe',
      peach: 'mild',
      'custom:no nightshades': 'moderate',
    });

    await act(async () => {
      await result.current.saveProfile();
    });

    expect(mockSaveTestUserProfile).toHaveBeenCalledWith(
      ['egg'],
      ['peach', 'custom:no nightshades'],
      {
        egg: 'severe',
        peach: 'mild',
        'custom:no nightshades': 'moderate',
      },
    );
  });

  it('deduplicates shared allergy and other restriction severity items', async () => {
    mockLoadTestUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['peach'],
        severityMap: { peach: 'severe' },
        dietaryRestrictions: ['peach', 'custom:no nightshades'],
      },
    });

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.severityItems).toEqual(['peach', 'custom:no nightshades']);
  });

  it('keeps shared severity when an allergy is removed but an other restriction remains', async () => {
    mockLoadTestUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['peach'],
        severityMap: { peach: 'severe' },
        dietaryRestrictions: ['peach'],
      },
    });

    const { result } = renderHook(() => useProfileScreen());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.toggleAllergen('peach');
    });

    expect(result.current.allergies).toEqual([]);
    expect(result.current.otherRestrictions).toEqual(['peach']);
    expect(result.current.severityMap['peach']).toBe('severe');
    expect(result.current.severityItems).toEqual(['peach']);
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
