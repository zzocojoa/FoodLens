import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useTripStatsScreen } from '../useTripStatsScreen';
import type { TripStatsScreenViewModel, TripStatsSnapshot } from '../../types/tripStats.types';
import type { UserProfile } from '@/models/User';

const mockReact = React;
const mockLoadTripStatsSnapshot = jest.fn();
const mockStartTripFromCurrentLocation = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockShowTranslatedAlert = jest.fn();

jest.mock('@react-navigation/native', () => {
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockReact.useEffect(() => effect(), [effect]);
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

describe('useTripStatsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockReturnValue('usr_tripstats');
    mockShowTranslatedAlert.mockImplementation(() => undefined);
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
