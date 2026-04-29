import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTripStatsScreen } from '../useTripStatsScreen';
import type { TripStatsScreenViewModel, TripStatsSnapshot } from '../../types/tripStats.types';
import type { UserProfile } from '@/models/User';
import { queryClient } from '@/services/queryClient';
import type { AnalysisRecord } from '@/services/analysis/types';

const mockReact = React;
const mockLoadTripStatsSnapshot = jest.fn();
const mockStartTripFromCurrentLocation = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockShowTranslatedAlert = jest.fn();
const mockFocusEffects: Array<() => void | (() => void)> = [];

jest.mock('@react-navigation/native', () => {
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockReact.useEffect(() => {
        mockFocusEffects.push(effect);
        return effect();
      }, [effect]);
    },
  };
});

jest.mock('../../services/tripStatsScreenService', () => ({
  loadTripStatsSnapshot: (...args: unknown[]) => mockLoadTripStatsSnapshot(...args),
  startTripFromCurrentLocation: (...args: unknown[]) => mockStartTripFromCurrentLocation(...args),
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserId: (...args: unknown[]) => mockGetCurrentUserId(...args),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: (...args: unknown[]) => mockShowTranslatedAlert(...args),
}));

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

const buildViewModel = (locationLabel: string | null): TripStatsScreenViewModel => ({
  hasActiveTrip: locationLabel !== null,
  hero: {
    scope: 'currentTrip',
    tripStartDate: locationLabel === null ? null : new Date('2026-04-20T00:00:00.000Z'),
    locationLabel,
    tone: locationLabel === null ? 'neutral' : 'safe',
    analysisCount: locationLabel === null ? 0 : 1,
    safeCount: locationLabel === null ? 0 : 1,
    cautionCount: 0,
    dangerCount: 0,
    totalCount: locationLabel === null ? 0 : 1,
    chapterCount: locationLabel === null ? 0 : 1,
    recentJourneyCount: locationLabel === null ? 0 : 1,
  },
  passportTotals: {
    totalAnalyses: locationLabel === null ? 0 : 1,
    safeCount: locationLabel === null ? 0 : 1,
    cautionCount: 0,
    dangerCount: 0,
    currentTripCount: locationLabel === null ? 0 : 1,
    currentTripSafeCount: locationLabel === null ? 0 : 1,
    currentTripCautionCount: 0,
    currentTripDangerCount: 0,
    countriesVisitedCount: locationLabel === null ? 0 : 1,
    citiesVisitedCount: locationLabel === null ? 0 : 1,
  },
  countryChapters: [],
  recentJourneyEntries: [],
});

const buildSnapshot = (
  currentLocation: string | null,
  locationLabel: string | null,
): TripStatsSnapshot => ({
  user: {
    uid: 'usr_tripstats',
    email: 'tripstats@example.com',
    safetyProfile: {
      allergies: [],
      dietaryRestrictions: [],
    },
    settings: {
      language: 'en-US',
      autoPlayAudio: false,
      clientState: {},
    },
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    ...(currentLocation === null
      ? {}
      : {
          currentTripStart: '2026-04-20T00:00:00.000Z',
          currentTripLocation: currentLocation,
        }),
  } satisfies UserProfile,
  analyses: [],
  tripStartDate: currentLocation === null ? null : new Date('2026-04-20T00:00:00.000Z'),
  currentLocation,
  viewModel: buildViewModel(locationLabel),
});

const buildCachedAnalysisRecord = (): AnalysisRecord => ({
  id: 'cached-analysis-1',
  foodName: 'Bibimbap',
  ingredients: [],
  safetyStatus: 'SAFE',
  timestamp: new Date('2026-04-21T00:00:00.000Z'),
  location: {
    latitude: 37.5665,
    longitude: 126.978,
    country: 'South Korea',
    city: 'Seoul',
  },
});

describe('useTripStatsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusEffects.length = 0;
    queryClient.clear();
    mockGetCurrentUserId.mockReturnValue('usr_tripstats');
    mockShowTranslatedAlert.mockImplementation(() => undefined);
  });

  it('keeps cached trip stats visible while focus refresh runs', async () => {
    const refreshedSnapshot = buildSnapshot('Busan, South Korea', 'Busan, South Korea');
    const refreshDeferred = createDeferred<TripStatsSnapshot>();
    const onOpenHistory = jest.fn();
    const onOpenJourneyEntry = jest.fn();

    queryClient.setQueryData(['history', 'usr_tripstats'], [buildCachedAnalysisRecord()]);
    mockLoadTripStatsSnapshot.mockReturnValueOnce(refreshDeferred.promise);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory,
        onOpenJourneyEntry,
      })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.viewModel?.passportTotals.totalAnalyses).toBe(1);

    await waitFor(() => {
      expect(mockLoadTripStatsSnapshot).toHaveBeenCalledTimes(1);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.viewModel?.passportTotals.totalAnalyses).toBe(1);

    await act(async () => {
      refreshDeferred.resolve(refreshedSnapshot);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.currentLocation).toBe('Busan, South Korea');
    });

    expect(onOpenHistory).not.toHaveBeenCalled();
    expect(onOpenJourneyEntry).not.toHaveBeenCalled();
  });

  it('hydrates cached trip stats on focus when premounted before cache is ready', async () => {
    const initialDeferred = createDeferred<TripStatsSnapshot>();
    const refreshDeferred = createDeferred<TripStatsSnapshot>();
    const initialSnapshot = buildSnapshot(null, null);
    const refreshedSnapshot = buildSnapshot('Busan, South Korea', 'Busan, South Korea');

    mockLoadTripStatsSnapshot
      .mockReturnValueOnce(initialDeferred.promise)
      .mockReturnValueOnce(refreshDeferred.promise);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory: jest.fn(),
        onOpenJourneyEntry: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(mockLoadTripStatsSnapshot).toHaveBeenCalledTimes(1);
      expect(mockFocusEffects.length).toBeGreaterThan(0);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.viewModel).toBeNull();

    queryClient.setQueryData(['history', 'usr_tripstats'], [buildCachedAnalysisRecord()]);

    act(() => {
      const latestFocusEffect = mockFocusEffects[mockFocusEffects.length - 1];
      latestFocusEffect();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.viewModel?.passportTotals.totalAnalyses).toBe(1);
    });

    expect(mockLoadTripStatsSnapshot).toHaveBeenCalledTimes(2);

    await act(async () => {
      initialDeferred.resolve(initialSnapshot);
      refreshDeferred.resolve(refreshedSnapshot);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.currentLocation).toBe('Busan, South Korea');
      expect(result.current.loading).toBe(false);
    });
  });

  it('keeps location and loading states separate while starting a trip', async () => {
    const initialSnapshot = buildSnapshot('Seoul, South Korea', 'Seoul, South Korea');
    const refreshedSnapshot = buildSnapshot('Daegu, South Korea', 'Daegu, South Korea');
    const startTripDeferred = createDeferred<{
      ok: true;
      tripStartDate: Date;
      currentLocation: string;
    }>();
    const snapshotDeferred = createDeferred<TripStatsSnapshot>();
    const onOpenHistory = jest.fn();
    const onOpenJourneyEntry = jest.fn();

    mockLoadTripStatsSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockReturnValueOnce(snapshotDeferred.promise);
    mockStartTripFromCurrentLocation.mockReturnValue(startTripDeferred.promise);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory,
        onOpenJourneyEntry,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      void result.current.handleStartNewTrip();
    });

    expect(result.current.isLocating).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.startFeedbackLocation).toBeNull();

    await act(async () => {
      startTripDeferred.resolve({
        ok: true,
        tripStartDate: new Date('2026-04-20T00:00:00.000Z'),
        currentLocation: 'Daegu, South Korea',
      });
      await Promise.resolve();
    });

    expect(mockStartTripFromCurrentLocation).toHaveBeenCalledWith('usr_tripstats');
    expect(result.current.loading).toBe(false);
    expect(result.current.isLocating).toBe(false);
    expect(result.current.currentLocation).toBe('Daegu, South Korea');
    expect(result.current.startFeedbackLocation).toBe('Daegu, South Korea');
    expect(result.current.tripStartDate?.toISOString()).toBe('2026-04-20T00:00:00.000Z');
    expect(result.current.viewModel?.passportTotals.currentTripCount).toBe(0);
    expect(result.current.viewModel?.hero.locationLabel).toBe('Daegu, South Korea');

    await act(async () => {
      snapshotDeferred.resolve(refreshedSnapshot);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.isLocating).toBe(false);
      expect(result.current.currentLocation).toBe('Daegu, South Korea');
      expect(result.current.startFeedbackLocation).toBe('Daegu, South Korea');
    });

    expect(onOpenHistory).not.toHaveBeenCalled();
    expect(onOpenJourneyEntry).not.toHaveBeenCalled();
  });

  it('shows a translated alert and resets locating state when location permission is denied', async () => {
    const initialSnapshot = buildSnapshot(null, null);
    const deniedResult = { ok: false as const, reason: 'permission_denied' as const };
    const onOpenHistory = jest.fn();
    const onOpenJourneyEntry = jest.fn();

    mockLoadTripStatsSnapshot.mockResolvedValueOnce(initialSnapshot);
    mockStartTripFromCurrentLocation.mockResolvedValueOnce(deniedResult);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory,
        onOpenJourneyEntry,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.handleStartNewTrip();
    });

    expect(mockStartTripFromCurrentLocation).toHaveBeenCalledWith('usr_tripstats');
    expect(mockLoadTripStatsSnapshot).toHaveBeenCalledTimes(1);
    expect(mockShowTranslatedAlert).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        titleKey: 'tripStats.alert.permissionDeniedTitle',
        messageKey: 'tripStats.alert.permissionDeniedMessage',
      })
    );
    expect(result.current.isLocating).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.startFeedbackLocation).toBeNull();
  });

  it('shows the location failure alert when the device location is unavailable', async () => {
    const initialSnapshot = buildSnapshot(null, null);
    const unavailableResult = { ok: false as const, reason: 'location_unavailable' as const };

    mockLoadTripStatsSnapshot.mockResolvedValueOnce(initialSnapshot);
    mockStartTripFromCurrentLocation.mockResolvedValueOnce(unavailableResult);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory: jest.fn(),
        onOpenJourneyEntry: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.handleStartNewTrip();
    });

    expect(mockShowTranslatedAlert).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        titleKey: 'camera.alert.errorTitle',
        messageKey: 'tripStats.alert.failedToGetLocation',
      })
    );
    expect(result.current.isLocating).toBe(false);
    expect(result.current.startFeedbackLocation).toBeNull();
  });

  it('shows the profile save alert when trip profile persistence fails', async () => {
    const initialSnapshot = buildSnapshot(null, null);
    const saveFailedResult = { ok: false as const, reason: 'profile_save_failed' as const };

    mockLoadTripStatsSnapshot.mockResolvedValueOnce(initialSnapshot);
    mockStartTripFromCurrentLocation.mockResolvedValueOnce(saveFailedResult);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory: jest.fn(),
        onOpenJourneyEntry: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.handleStartNewTrip();
    });

    expect(mockShowTranslatedAlert).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        titleKey: 'camera.alert.errorTitle',
        messageKey: 'tripStats.alert.failedToSaveTrip',
      })
    );
    expect(result.current.isLocating).toBe(false);
    expect(result.current.startFeedbackLocation).toBeNull();
  });

  it('shows the login required alert when trip start lacks an authenticated user id', async () => {
    const initialSnapshot = buildSnapshot(null, null);
    const authRequiredResult = { ok: false as const, reason: 'auth_required' as const };

    mockLoadTripStatsSnapshot.mockResolvedValueOnce(initialSnapshot);
    mockStartTripFromCurrentLocation.mockResolvedValueOnce(authRequiredResult);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory: jest.fn(),
        onOpenJourneyEntry: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.handleStartNewTrip();
    });

    expect(mockShowTranslatedAlert).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        titleKey: 'tripStats.alert.authRequiredTitle',
        messageKey: 'tripStats.alert.authRequiredMessage',
      })
    );
    expect(result.current.isLocating).toBe(false);
    expect(result.current.startFeedbackLocation).toBeNull();
  });

  it('ignores repeated trip start requests while the first one is still running', async () => {
    const initialSnapshot = buildSnapshot(null, null);
    const refreshedSnapshot = buildSnapshot('Daegu, South Korea', 'Daegu, South Korea');
    const startTripDeferred = createDeferred<{
      ok: true;
      tripStartDate: Date;
      currentLocation: string;
    }>();

    mockLoadTripStatsSnapshot
      .mockResolvedValueOnce(initialSnapshot)
      .mockResolvedValueOnce(refreshedSnapshot);
    mockStartTripFromCurrentLocation.mockReturnValue(startTripDeferred.promise);

    const { result } = renderHook(() =>
      useTripStatsScreen({
        onOpenHistory: jest.fn(),
        onOpenJourneyEntry: jest.fn(),
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      void result.current.handleStartNewTrip();
      void result.current.handleStartNewTrip();
    });

    expect(mockStartTripFromCurrentLocation).toHaveBeenCalledTimes(1);

    await act(async () => {
      startTripDeferred.resolve({
        ok: true,
        tripStartDate: new Date('2026-04-20T00:00:00.000Z'),
        currentLocation: 'Daegu, South Korea',
      });
      await Promise.resolve();
    });
  });
});
