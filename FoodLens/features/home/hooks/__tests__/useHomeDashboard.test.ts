import { act, renderHook, waitFor } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import { useHomeDashboard } from '../useHomeDashboard';
import { queryClient } from '@/services/queryClient';

const mockFetchHomeDashboardData = jest.fn();
const mockGetProfileRestrictionCount = jest.fn();
const mockSubscribeUserProfileUpdated = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockGetCurrentUserIdSnapshot = jest.fn();
const mockSafeStorageGet = jest.fn();
const mockSafeStorageGetSync = jest.fn();
const mockGetUserStorageKey = jest.fn();
const mockReadHomeSelectedDateSnapshot = jest.fn();
const mockBuildHomeSelectedDatePatch = jest.fn();
const mockUpdateUserClientState = jest.fn();
const mockShowTranslatedAlert = jest.fn();
const mockDeleteAnalysis = jest.fn();
let mockIsFocused = true;

jest.mock('@react-navigation/native', () => {
  return {
    useIsFocused: () => mockIsFocused,
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

jest.mock('@/services/user/clientStateService', () => ({
  readHomeSelectedDateSnapshot: (...args: unknown[]) => mockReadHomeSelectedDateSnapshot(...args),
  buildHomeSelectedDatePatch: (...args: unknown[]) => mockBuildHomeSelectedDatePatch(...args),
  updateUserClientState: (...args: unknown[]) => mockUpdateUserClientState(...args),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: (...args: unknown[]) => mockShowTranslatedAlert(...args),
}));

jest.mock('@/services/analysisService', () => ({
  AnalysisService: {
    deleteAnalysis: (...args: unknown[]) => mockDeleteAnalysis(...args),
  },
}));

const buildSelectedDatePatch = (date: Date) => ({
  home: {
    selectedDate: [
      date.getFullYear(),
      `${date.getMonth() + 1}`.padStart(2, '0'),
      `${date.getDate()}`.padStart(2, '0'),
    ].join('-'),
  },
});

const createDeferred = <T,>() => {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
};

describe('useHomeDashboard profile update subscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-24T12:00:00.000Z'));
    mockIsFocused = true;
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
    mockReadHomeSelectedDateSnapshot.mockReturnValue(null);
    mockBuildHomeSelectedDatePatch.mockImplementation((date: Date) => buildSelectedDatePatch(date));
    mockSubscribeUserProfileUpdated.mockReturnValue(jest.fn());
    mockUpdateUserClientState.mockResolvedValue({});
    mockDeleteAnalysis.mockResolvedValue(undefined);
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

  it('skips the first focus refresh while the initial dashboard load is still pending', async () => {
    const runAfterInteractionsSpy = jest.spyOn(InteractionManager, 'runAfterInteractions');
    mockFetchHomeDashboardData.mockImplementation(
      async () =>
        new Promise(() => {
          return undefined;
        })
    );

    renderHook(() => useHomeDashboard());

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    expect(runAfterInteractionsSpy).not.toHaveBeenCalled();
  });

  it('does not commit dashboard data after home loses focus during the initial load', async () => {
    let resolveFetch:
      | ((value: {
          recentData: Array<{ id: string }>;
          allHistory: Array<{ id: string }>;
          profile: {
            uid: string;
            name: string;
            email: string;
            safetyProfile: {
              allergies: string[];
              dietaryRestrictions: string[];
              severityMap: Record<string, string>;
            };
            settings: {
              language: string;
              autoPlayAudio: boolean;
            };
            createdAt: string;
            updatedAt: string;
          };
          weeklyStats: [];
          safeCount: number;
        }) => void)
      | null = null;
    mockFetchHomeDashboardData.mockImplementation(
      async () =>
        new Promise((resolve) => {
          resolveFetch = resolve as typeof resolveFetch;
        }),
    );

    const { result, rerender } = renderHook(
      ({ focused }: { focused: boolean }) => {
        mockIsFocused = focused;
        return useHomeDashboard();
      },
      {
        initialProps: { focused: true },
      },
    );

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);

    rerender({ focused: false });

    await act(async () => {
      resolveFetch?.({
        recentData: [{ id: 'analysis_recent_1' }],
        allHistory: [{ id: 'analysis_all_1' }],
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
        safeCount: 1,
      });
      await Promise.resolve();
    });

    expect(result.current.recentScans).toEqual([]);
    expect(result.current.filteredScans).toEqual([]);
    expect(result.current.userProfile).toBeNull();
    expect(result.current.safeCount).toBe(0);
  });

  it('retries once after the skipped first-focus path when the initial dashboard load fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const successfulTimestamp = new Date('2026-04-24T12:00:00.000Z');
    mockFetchHomeDashboardData
      .mockRejectedValueOnce(new Error('temporary dashboard failure'))
      .mockResolvedValueOnce({
        recentData: [],
        allHistory: [
          {
            id: 'analysis_all_1',
            timestamp: successfulTimestamp,
            safetyStatus: 'SAFE',
          },
        ],
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
        safeCount: 1,
      });

    const { result } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(result.current.safeCount).toBe(1);
      expect(result.current.userProfile?.uid).toBe('usr_home');
    });

    errorSpy.mockRestore();
  });

  it('hydrates profile once for rapid profile update events without reloading history', async () => {
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return jest.fn();
    });

    renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });
    expect(mockSubscribeUserProfileUpdated).toHaveBeenCalledWith('usr_home', expect.any(Function));
    await waitFor(() => {
      expect(mockSafeStorageGet).toHaveBeenCalled();
    });
    mockSafeStorageGet.mockClear();

    act(() => {
      jest.advanceTimersByTime(3_000);
      listener?.('server_pull');
      listener?.('server_pull');
      listener?.('server_pull');
    });

    act(() => {
      jest.advanceTimersByTime(249);
    });
    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    expect(mockSafeStorageGet).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(mockSafeStorageGet).toHaveBeenCalledTimes(1);
    });
    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });

  it('does not reload dashboard for server_pull profile events after the guard window', async () => {
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return jest.fn();
    });

    renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });
    act(() => {
      listener?.('server_pull');
      jest.advanceTimersByTime(250);
    });

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(3_000);
      listener?.('server_pull');
      jest.advanceTimersByTime(250);
    });

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });

  it('skips immediate client_state_write reloads right after dashboard load', async () => {
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return jest.fn();
    });

    renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    act(() => {
      listener?.('client_state_write');
      jest.advanceTimersByTime(250);
    });

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });

  it('does not reload dashboard from profile updates while blurred', async () => {
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return jest.fn();
    });

    const { rerender } = renderHook(
      ({ focused }: { focused: boolean }) => {
        mockIsFocused = focused;
        return useHomeDashboard();
      },
      {
        initialProps: { focused: true },
      }
    );

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    rerender({ focused: false });

    act(() => {
      listener?.('server_pull');
      jest.advanceTimersByTime(500);
    });

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });

  it('hydrates and refreshes immediately on focus after missing a profile update while blurred', async () => {
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    const updatedProfile = {
      uid: 'usr_home',
      name: 'Updated Tester',
      email: 'updated@example.com',
      safetyProfile: {
        allergies: ['egg', 'milk'],
        dietaryRestrictions: ['vegan'],
        severityMap: {},
      },
      settings: {
        language: 'en',
        autoPlayAudio: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return jest.fn();
    });

    const { rerender } = renderHook(
      ({ focused }: { focused: boolean }) => {
        mockIsFocused = focused;
        return useHomeDashboard();
      },
      {
        initialProps: { focused: true },
      }
    );

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockSafeStorageGet).toHaveBeenCalled();
    });
    mockSafeStorageGet.mockClear();
    mockSafeStorageGet.mockResolvedValue(updatedProfile);
    mockFetchHomeDashboardData.mockResolvedValueOnce({
      recentData: [],
      allHistory: [],
      profile: updatedProfile,
      weeklyStats: [],
      safeCount: 0,
    });

    rerender({ focused: false });

    act(() => {
      jest.advanceTimersByTime(500);
      listener?.('server_pull');
    });

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    expect(mockSafeStorageGet).not.toHaveBeenCalled();

    rerender({ focused: true });

    await waitFor(() => {
      expect(mockSafeStorageGet).toHaveBeenCalledTimes(1);
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps a missed profile refresh queued when focus returns during an in-flight load', async () => {
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    const initialProfile = {
      uid: 'usr_home',
      name: 'Initial Tester',
      email: 'initial@example.com',
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
    };
    const updatedProfile = {
      ...initialProfile,
      name: 'Updated Tester',
      safetyProfile: {
        allergies: ['egg', 'milk'],
        dietaryRestrictions: ['vegan'],
        severityMap: {},
      },
    };
    const initialDashboard = createDeferred<{
      recentData: never[];
      allHistory: never[];
      profile: typeof initialProfile;
      weeklyStats: never[];
      safeCount: number;
    }>();
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return jest.fn();
    });
    mockFetchHomeDashboardData
      .mockImplementationOnce(() => initialDashboard.promise)
      .mockResolvedValueOnce({
        recentData: [],
        allHistory: [],
        profile: updatedProfile,
        weeklyStats: [],
        safeCount: 0,
      });

    const { rerender } = renderHook(
      ({ focused }: { focused: boolean }) => {
        mockIsFocused = focused;
        return useHomeDashboard();
      },
      {
        initialProps: { focused: true },
      }
    );

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });
    mockSafeStorageGet.mockClear();
    mockSafeStorageGet.mockResolvedValue(updatedProfile);

    rerender({ focused: false });
    act(() => {
      listener?.('server_pull');
    });
    rerender({ focused: true });

    await waitFor(() => {
      expect(mockSafeStorageGet).toHaveBeenCalledTimes(1);
    });
    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);

    await act(async () => {
      initialDashboard.resolve({
        recentData: [],
        allHistory: [],
        profile: initialProfile,
        weeklyStats: [],
        safeCount: 0,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(2);
    });
  });

  it('cancels pending refresh timer on unmount', async () => {
    const unsubscribe = jest.fn();
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return unsubscribe;
    });

    const { unmount } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    act(() => {
      jest.advanceTimersByTime(3_000);
      listener?.('server_pull');
    });

    unmount();

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });

  it('does not run dashboard polling on the old 15 second interval', async () => {
    renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    act(() => {
      jest.advanceTimersByTime(15_000);
    });

    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });

  it('updates home history sections from the shared history query cache', async () => {
    const { result } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    act(() => {
      queryClient.setQueryData(['history', 'usr_home'], [
        {
          id: 'analysis_shared_1',
          timestamp: new Date('2026-04-24T12:00:00.000Z'),
          safetyStatus: 'SAFE',
        },
        {
          id: 'analysis_shared_2',
          timestamp: new Date('2026-04-23T12:00:00.000Z'),
          safetyStatus: 'DANGER',
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.recentScans.map((item) => item.id)).toEqual([
        'analysis_shared_1',
        'analysis_shared_2',
      ]);
      expect(result.current.safeCount).toBe(1);
    });
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

  it('does not fall back to global profile snapshot when scoped profile is missing', async () => {
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
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.userProfile).toBeNull();
  });

  it('hydrates selected date from synced client_state home.selectedDate on initial load', async () => {
    mockFetchHomeDashboardData.mockResolvedValueOnce({
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
          clientState: {
            home: {
              selectedDate: '2026-03-20',
            },
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      weeklyStats: [],
      safeCount: 0,
    });

    const { result } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(result.current.selectedDate.getFullYear()).toBe(2026);
      expect(result.current.selectedDate.getMonth()).toBe(2);
      expect(result.current.selectedDate.getDate()).toBe(20);
    });
    expect(mockUpdateUserClientState).not.toHaveBeenCalled();
  });

  it('persists selected date only when the calendar day changes', async () => {
    mockReadHomeSelectedDateSnapshot.mockReturnValue(new Date(2026, 2, 20, 9, 0, 0));

    const { result } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.setSelectedDate(new Date(2026, 2, 20, 18, 45, 0));
    });

    expect(mockBuildHomeSelectedDatePatch).not.toHaveBeenCalled();
    expect(mockUpdateUserClientState).not.toHaveBeenCalled();

    const nextDay = new Date(2026, 2, 21, 8, 15, 0);
    const nextDayPatch = buildSelectedDatePatch(nextDay);

    act(() => {
      result.current.setSelectedDate(nextDay);
    });

    expect(mockBuildHomeSelectedDatePatch).toHaveBeenCalledTimes(1);
    expect(mockBuildHomeSelectedDatePatch).toHaveBeenCalledWith(nextDay);
    expect(mockUpdateUserClientState).toHaveBeenCalledTimes(1);
    expect(mockUpdateUserClientState).toHaveBeenCalledWith('usr_home', nextDayPatch);
  });

  it('does not reload dashboard for a selected date client_state_write after the reload guard window', async () => {
    let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, cb: typeof listener) => {
      listener = cb;
      return jest.fn();
    });
    mockReadHomeSelectedDateSnapshot.mockReturnValue(new Date(2026, 2, 24, 9, 0, 0));
    mockUpdateUserClientState.mockImplementation(async () => {
      listener?.('client_state_write');
      return {};
    });

    const { result } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    act(() => {
      jest.advanceTimersByTime(3_001);
      result.current.setSelectedDate(new Date(2026, 2, 25, 8, 15, 0));
      jest.advanceTimersByTime(250);
    });

    expect(mockUpdateUserClientState).toHaveBeenCalledTimes(1);
    expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
  });

  it('shows translated delete failure alert without inline fallback strings', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockDeleteAnalysis.mockRejectedValueOnce(new Error('delete failed'));

    const { result } = renderHook(() => useHomeDashboard());

    await waitFor(() => {
      expect(mockFetchHomeDashboardData).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.handleDeleteItem('analysis_home_1');
    });

    expect(mockShowTranslatedAlert).toHaveBeenCalledWith(expect.any(Function), {
      titleKey: 'home.alert.errorTitle',
      messageKey: 'home.alert.deleteFailedRestore',
    });
    expect(errorSpy).toHaveBeenCalledWith('Home delete failed:', expect.any(Error));
    errorSpy.mockRestore();
  });
});
