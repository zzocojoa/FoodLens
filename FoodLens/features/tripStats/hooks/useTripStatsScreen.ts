import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getTripStatsUserId } from '../constants/tripStats.constants';
import {
    loadTripStatsSnapshot,
    startTripFromCurrentLocation,
} from '../services/tripStatsScreenService';
import { TripStatsSnapshot, TripStatsState } from '../types/tripStats.types';
import { buildTripStatsScreenViewModel } from '../utils/tripStatsCalculations';
import { useI18n } from '@/features/i18n';
import { markHomeNavigationTrace } from '@/features/home/services/homeNavigationTrace';
import { UserProfile } from '@/models/User';
import { AnalysisRecord } from '@/services/analysis/types';
import { queryClient } from '@/services/queryClient';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

type UseTripStatsScreenResult = TripStatsState & {
    handleOpenHistory: () => void;
    handleOpenJourneyEntry: (entryId: string) => void;
    handleStartNewTrip: () => Promise<void>;
    clearStartFeedback: () => void;
};

type Handlers = {
    onOpenHistory: () => void;
    onOpenJourneyEntry: (entryId: string) => void;
};

type TripStatsScreenState = TripStatsState & {
    user: UserProfile | null;
    analyses: readonly AnalysisRecord[];
};

const buildHistoryQueryKey = (userId: string): readonly ['history', string] => ['history', userId] as const;

const resolveTripStartDate = (user: UserProfile | null): Date | null => {
    const rawTripStartDate = user?.currentTripStart ? new Date(user.currentTripStart) : null;
    return rawTripStartDate && !Number.isNaN(rawTripStartDate.getTime()) ? rawTripStartDate : null;
};

const readCachedTripStatsState = (userId: string): TripStatsScreenState | null => {
    const analyses = queryClient.getQueryData<AnalysisRecord[]>(buildHistoryQueryKey(userId)) ?? [];
    if (analyses.length === 0) {
        return null;
    }

    const user: UserProfile | null = null;
    return {
        loading: false,
        currentLocation: null,
        isLocating: false,
        tripStartDate: null,
        viewModel: buildTripStatsScreenViewModel(user, analyses),
        startFeedbackLocation: null,
        user,
        analyses,
    };
};

const buildInitialState = (userId: string): TripStatsScreenState => {
    const cachedState = readCachedTripStatsState(userId);
    if (cachedState !== null) {
        return cachedState;
    }

    return {
        loading: true,
        currentLocation: null,
        isLocating: false,
        tripStartDate: null,
        viewModel: null,
        startFeedbackLocation: null,
        user: null,
        analyses: [],
    };
};

const buildStateFromSnapshot = (
    snapshot: TripStatsSnapshot,
    startFeedbackLocation: string | null,
): TripStatsScreenState => {
    return {
        loading: false,
        currentLocation: snapshot.currentLocation,
        isLocating: false,
        tripStartDate: snapshot.tripStartDate,
        viewModel: snapshot.viewModel,
        startFeedbackLocation,
        user: snapshot.user,
        analyses: snapshot.analyses,
    };
};

const buildOptimisticTripStartState = (
    currentState: TripStatsScreenState,
    tripStartDate: Date,
    currentLocation: string,
): TripStatsScreenState => {
    const nextUser = currentState.user === null
        ? null
        : {
              ...currentState.user,
              currentTripStart: tripStartDate.toISOString(),
              currentTripLocation: currentLocation,
          };

    return {
        ...currentState,
        loading: false,
        currentLocation,
        isLocating: false,
        tripStartDate,
        viewModel: buildTripStatsScreenViewModel(nextUser, currentState.analyses),
        startFeedbackLocation: currentLocation,
        user: nextUser,
    };
};

export function useTripStatsScreen(handlers: Handlers): UseTripStatsScreenResult {
    const { t } = useI18n();
    const tripStatsUserId = getTripStatsUserId();
    const loadRequestIdRef = useRef(0);
    const isStartingTripRef = useRef(false);
    const [state, setState] = useState<TripStatsScreenState>(() => buildInitialState(tripStatsUserId));
    const hasRenderableContentRef = useRef(state.viewModel !== null);

    useEffect(() => {
        hasRenderableContentRef.current = state.viewModel !== null;
    }, [state.viewModel]);

    const beginLoadRequest = useCallback((): number => {
        loadRequestIdRef.current += 1;
        return loadRequestIdRef.current;
    }, []);

    const clearStartFeedback = useCallback(() => {
        setState((currentState) => {
            if (currentState.startFeedbackLocation === null) {
                return currentState;
            }

            return {
                ...currentState,
                startFeedbackLocation: null,
            };
        });
    }, []);

    const loadData = useCallback(async (startFeedbackLocation: string | null) => {
        const requestId = beginLoadRequest();

        try {
            markHomeNavigationTrace('trip_stats', 'async_load_start');
            setState((currentState) => ({
                ...currentState,
                loading: true,
            }));

            const snapshot = await loadTripStatsSnapshot(tripStatsUserId);
            if (requestId !== loadRequestIdRef.current) {
                return;
            }

            setState(buildStateFromSnapshot(snapshot, startFeedbackLocation));
        } catch (error) {
            console.error(error);
            if (requestId !== loadRequestIdRef.current) {
                return;
            }

            setState((currentState) => ({
                ...currentState,
                loading: false,
                isLocating: false,
                startFeedbackLocation,
            }));
        } finally {
            markHomeNavigationTrace('trip_stats', 'async_load_end');
        }
    }, [beginLoadRequest, tripStatsUserId]);

    const refreshDataInBackground = useCallback(async (requestId: number) => {
        try {
            markHomeNavigationTrace('trip_stats', 'async_load_start');
            const snapshot = await loadTripStatsSnapshot(tripStatsUserId);
            if (requestId !== loadRequestIdRef.current) {
                return;
            }

            setState((currentState) => ({
                ...currentState,
                loading: false,
                currentLocation: snapshot.currentLocation,
                isLocating: false,
                tripStartDate: snapshot.tripStartDate,
                viewModel: snapshot.viewModel,
                user: snapshot.user,
                analyses: snapshot.analyses,
            }));
        } catch (error) {
            console.error(error);
            if (requestId !== loadRequestIdRef.current) {
                return;
            }

            setState((currentState) => ({
                ...currentState,
                loading: false,
                isLocating: false,
            }));
        } finally {
            markHomeNavigationTrace('trip_stats', 'async_load_end');
        }
    }, [tripStatsUserId]);

    const loadFocusedData = useCallback((): void => {
        if (!hasRenderableContentRef.current) {
            const cachedState = readCachedTripStatsState(tripStatsUserId);
            if (cachedState !== null) {
                hasRenderableContentRef.current = true;
                setState((currentState) => ({
                    ...cachedState,
                    startFeedbackLocation: currentState.startFeedbackLocation,
                }));

                const requestId = beginLoadRequest();
                void refreshDataInBackground(requestId);
                return;
            }

            void loadData(null);
            return;
        }

        const requestId = beginLoadRequest();
        void refreshDataInBackground(requestId);
    }, [beginLoadRequest, loadData, refreshDataInBackground, tripStatsUserId]);

    useFocusEffect(
        useCallback(() => {
            loadFocusedData();
        }, [loadFocusedData]),
    );

    const handleStartNewTrip = useCallback(async () => {
        if (isStartingTripRef.current) {
            return;
        }

        isStartingTripRef.current = true;
        const requestId = beginLoadRequest();

        setState((currentState) => ({
            ...currentState,
            isLocating: true,
            startFeedbackLocation: null,
        }));

        try {
            const result = await startTripFromCurrentLocation(tripStatsUserId);

            if (!result.ok) {
                showTranslatedAlert(t, {
                    titleKey: 'tripStats.alert.permissionDeniedTitle',
                    titleFallback: 'Permission Denied',
                    messageKey: 'tripStats.alert.permissionDeniedMessage',
                    messageFallback: 'Location access is needed to tag your trip. Please enable it in settings.',
                });

                setState((currentState) => ({
                    ...currentState,
                    isLocating: false,
                    startFeedbackLocation: null,
                }));
                return;
            }

            setState((currentState) =>
                buildOptimisticTripStartState(currentState, result.tripStartDate, result.currentLocation),
            );

            void refreshDataInBackground(requestId);
        } catch (error) {
            console.error(error);
            showTranslatedAlert(t, {
                titleKey: 'camera.alert.errorTitle',
                titleFallback: 'Error',
                messageKey: 'tripStats.alert.failedToGetLocation',
                messageFallback: 'Failed to get location. Please try again.',
            });
            setState((currentState) => ({
                ...currentState,
                isLocating: false,
                startFeedbackLocation: null,
            }));
        } finally {
            isStartingTripRef.current = false;
        }
    }, [beginLoadRequest, refreshDataInBackground, t, tripStatsUserId]);

    return useMemo(() => {
        return {
            ...state,
            handleOpenHistory: handlers.onOpenHistory,
            handleOpenJourneyEntry: handlers.onOpenJourneyEntry,
            handleStartNewTrip,
            clearStartFeedback,
        };
    }, [clearStartFeedback, handlers.onOpenHistory, handlers.onOpenJourneyEntry, handleStartNewTrip, state]);
}
