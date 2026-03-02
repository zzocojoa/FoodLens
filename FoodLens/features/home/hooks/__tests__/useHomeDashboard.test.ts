import { act, renderHook, waitFor } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import { useHomeDashboard } from '../useHomeDashboard';

const mockFetchHomeDashboardData = jest.fn();
const mockGetProfileRestrictionCount = jest.fn();
const mockSubscribeUserProfileUpdated = jest.fn();
const mockGetCurrentUserId = jest.fn();

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => (() => void) | void) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});

jest.mock('../../services/homeDashboardService_Logic', () => ({
  fetchHomeDashboardData: (...args: unknown[]) => mockFetchHomeDashboardData(...args),
  getProfileRestrictionCount: (...args: unknown[]) => mockGetProfileRestrictionCount(...args),
}));

jest.mock('@/services/user/userProfileStore_Logic', () => ({
  subscribeUserProfileUpdated: (...args: unknown[]) => mockSubscribeUserProfileUpdated(...args),
}));

jest.mock('@/services/auth/currentUser_Logic', () => ({
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/services/ui/uiAlerts_Logic', () => ({
  showTranslatedAlert: jest.fn(),
}));

jest.mock('@/services/analysisService_Logic', () => ({
  AnalysisService: {
    deleteAnalysis: jest.fn(),
  },
}));

describe('useHomeDashboard profile update subscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest
      .spyOn(InteractionManager, 'runAfterInteractions')
      .mockImplementation(((task?: (() => any) | { run?: () => any }) => {
        if (typeof task === 'function') {
          task();
        } else if (task && typeof task.run === 'function') {
          task.run();
        }
        return {
          then: (onfulfilled?: () => any) => {
            onfulfilled?.();
            return Promise.resolve();
          },
          done: (...args: any[]) => {
            const callback = args[0];
            if (typeof callback === 'function') {
              callback();
            }
          },
          cancel: jest.fn(),
        };
      }) as typeof InteractionManager.runAfterInteractions);
    mockGetCurrentUserId.mockReturnValue('usr_home');
    mockGetProfileRestrictionCount.mockReturnValue(2);
    mockFetchHomeDashboardData.mockResolvedValue({
      recentData: [],
      allHistory: [],
      profile: {
        uid: 'usr_home',
        name: 'Tester',
        email: 'user@example.com',
        safetyProfile: {
          allergies: ['egg'],
          dietaryRestrictions: ['vegan'],
          severityMap: {},
        },
        settings: {
          language: 'en',
          autoPlayAudio: false,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      weeklyStats: [],
      safeCount: 0,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reloads dashboard once for rapid profile update events (debounced)', async () => {
    let listener: (() => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: () => void) => {
      listener = cb;
      return jest.fn();
    });

    renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });
    expect(mockSubscribeUserProfileUpdated).toHaveBeenCalledWith('usr_home', expect.any(Function));

    act(() => {
      listener?.();
      listener?.();
      listener?.();
    });

    act(() => {
      jest.advanceTimersByTime(249);
    });
    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(2);
    });
  });

  it('cancels pending refresh timer on unmount', async () => {
    const unsubscribe = jest.fn();
    let listener: (() => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: () => void) => {
      listener = cb;
      return unsubscribe;
    });

    const { unmount } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    act(() => {
      listener?.();
    });

    unmount();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });
});
