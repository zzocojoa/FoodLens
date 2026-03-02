import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useProfileSheetState } from '../useProfileSheetState';

const mockUpdateProfile = jest.fn();
const mockLoadProfile = jest.fn();
const mockGetManualMergeConflictOperationsForUser = jest.fn();
const mockResolveManualMergeConflictsForUser = jest.fn();
const mockShowTranslatedAlert = jest.fn();

jest.mock('../../services/profileSheetService', () => ({
  profileSheetService: {
    updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
    loadProfile: (...args: unknown[]) => mockLoadProfile(...args),
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

jest.mock('@/features/i18n/services/languageService_Logic', () => ({
  normalizeCanonicalLocale: (value: string) => value,
}));

jest.mock('@/services/ui/uiAlerts_Logic', () => ({
  showTranslatedAlert: (...args: unknown[]) => mockShowTranslatedAlert(...args),
}));

jest.mock('@/services/sync/phase2ConflictResolution_Logic', () => ({
  getManualMergeConflictOperationsForUser: (...args: unknown[]) =>
    mockGetManualMergeConflictOperationsForUser(...args),
  resolveManualMergeConflictsForUser: (...args: unknown[]) =>
    mockResolveManualMergeConflictsForUser(...args),
}));

describe('useProfileSheetState conflict handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
