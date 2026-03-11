import { act, renderHook, waitFor } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import { useHomeDashboard } from '../useHomeDashboard';

const mockFetchHomeDashboardData = jest.fn();
const mockGetProfileRestrictionCount = jest.fn();
const mockSubscribeUserProfileUpdated = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockGetCurrentUserIdSnapshot = jest.fn();
const mockSafeStorageGet = jest.fn();
const mockSafeStorageGetSync = jest.fn();
const mockGetUserStorageKey = jest.fn();

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (effect: () => (() => void) | void) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});

jest.mock('../../services/homeDashboardService', () => ({
  fetchHomeDashboardData: (...args: unknown[]) => mockFetchHomeDashboardData(...args),
  getProfileRestrictionCount: (...args: unknown[]) => mockGetProfileRestrictionCount(...args),
}));

jest.mock('@/services/user/userProfileStore', () => ({
  subscribeUserProfileUpdated: (...args: unknown[]) => mockSubscribeUserProfileUpdated(...args),
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
  getCurrentUserIdSnapshot: (...args: unknown[]) => mockGetCurrentUserIdSnapshot(...args),
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

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: jest.fn(),
}));

jest.mock('@/services/analysisService', () => ({
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
    mockGetCurrentUserIdSnapshot.mockReturnValue('usr_home');
    mockGetUserStorageKey.mockImplementation((userId: string) => `@foodlens_user_profile:${userId}`);
    mockGetProfileRestrictionCount.mockReturnValue(2);
    mockSafeStorageGetSync.mockReturnValue(null);
    mockSafeStorageGet.mockResolvedValue(null);
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

  it('keeps profile image uri stable when only signed url rotates for same asset', async () => {
    const firstProfile = {
      uid: 'usr_home',
      name: 'Tester',
      email: 'user@example.com',
      profileImageAssetId: 'asset_profile_1',
      profileImage:
        'https://cdn.example.com/media/render/asset_profile_1?w=512&q=75&fmt=auto&exp=4102444800&sig=old',
      safetyProfile: { allergies: ['egg'], dietaryRestrictions: [], severityMap: {} },
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

    mockFetchHomeDashboardData
      .mockResolvedValueOnce({
        recentData: [],
        allHistory: [],
        profile: firstProfile,
        weeklyStats: [],
        safeCount: 0,
      })
      .mockResolvedValueOnce({
        recentData: [],
        allHistory: [],
        profile: secondProfile,
        weeklyStats: [],
        safeCount: 0,
      });

    const { result } = renderHook(() => useHomeDashboard());
    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
      expect(result.current.userProfile?.profileImage).toBe(firstProfile.profileImage);
    });

    await act(async () => {
      await result.current.loadDashboardData();
    });

    expect(result.current.userProfile?.profileImage).toBe(firstProfile.profileImage);
  });

  it('hydrates profile from local cache before dashboard fetch resolves', async () => {
    const localProfile = {
      uid: 'usr_home',
      name: 'Cached User',
      email: 'cached@example.com',
      profileImage: 'https://cdn.example.com/profile-cached.jpg',
      profileImageAssetId: 'asset_cached',
      safetyProfile: { allergies: ['egg'], dietaryRestrictions: [], severityMap: {} },
      settings: { language: 'en', autoPlayAudio: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockSafeStorageGet.mockResolvedValueOnce(localProfile);
    mockSafeStorageGetSync.mockReturnValueOnce(localProfile);
    mockFetchHomeDashboardData.mockImplementation(
      () => new Promise(() => { /* keep pending */ })
    );

    const { result } = renderHook(() => useHomeDashboard());
    await waitFor(() => {
      expect(result.current.userProfile?.profileImage).toBe(localProfile.profileImage);
    });
  });

  it('falls back to global profile snapshot when scoped profile is missing', async () => {
    const globalProfile = {
      uid: 'usr_home',
      name: 'Global Snapshot',
      email: 'global@example.com',
      profileImage: 'https://cdn.example.com/profile-global.jpg',
      profileImageAssetId: 'asset_global',
      safetyProfile: { allergies: ['egg'], dietaryRestrictions: [], severityMap: {} },
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
    mockFetchHomeDashboardData.mockImplementation(
      () => new Promise(() => { /* keep pending */ })
    );

    const { result } = renderHook(() => useHomeDashboard());
    await waitFor(() => {
      expect(result.current.userProfile?.profileImage).toBe(globalProfile.profileImage);
    });
  });
});
