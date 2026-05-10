import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useOnboardingFlow } from '../useOnboardingFlow';

const mockCompleteOnboardingProfile = jest.fn();
const mockGetOnboardingPermissionStatuses = jest.fn();
const mockRequestOnboardingPermissions = jest.fn();

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('../../services/onboardingProfileService', () => ({
  completeOnboardingProfile: (...args: unknown[]) => mockCompleteOnboardingProfile(...args),
}));

jest.mock('../../services/onboardingPermissionService', () => ({
  getOnboardingPermissionStatuses: (...args: unknown[]) =>
    mockGetOnboardingPermissionStatuses(...args),
  requestOnboardingPermissions: (...args: unknown[]) => mockRequestOnboardingPermissions(...args),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: jest.fn(),
}));

jest.mock('@/services/utils', () => ({
  getLocationData: jest.fn(),
}));

describe('useOnboardingFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOnboardingPermissionStatuses.mockResolvedValue({
      camera: 'not_requested',
      library: 'not_requested',
      location: 'not_requested',
    });
    mockRequestOnboardingPermissions.mockResolvedValue({
      camera: 'not_requested',
      library: 'not_requested',
      location: 'not_requested',
    });
    mockCompleteOnboardingProfile.mockResolvedValue(undefined);
  });

  it('does not persist profile data in preview mode', async () => {
    const onCompleted = jest.fn();
    const { result } = renderHook(() =>
      useOnboardingFlow({
        onCompleted,
        previewMode: true,
      })
    );

    await act(async () => {
      await result.current.handleComplete('home');
    });

    expect(mockCompleteOnboardingProfile).not.toHaveBeenCalled();
    expect(onCompleted).toHaveBeenCalledWith('home');
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('persists profile data in normal mode before completion', async () => {
    const onCompleted = jest.fn();
    const { result } = renderHook(() =>
      useOnboardingFlow({
        onCompleted,
        previewMode: false,
      })
    );

    await act(async () => {
      await result.current.handleComplete('home');
    });

    expect(mockCompleteOnboardingProfile).toHaveBeenCalledTimes(1);
    expect(onCompleted).toHaveBeenCalledWith('home');
  });
});
