import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getTripStatsUserId } from '../constants/tripStats.constants';
import {
    loadTripStatsSnapshot,
    startTripFromCurrentLocation,
} from '../services/tripStatsScreenService';
import { TripStatsSnapshot, TripStatsState } from '../types/tripStats.types';
import { buildTripStatsScreenViewModel } from '../utils/tripStatsCalculations';
import { useI18n } from '@/features/i18n';
import { UserProfile } from '@/models/User';
import { AnalysisRecord } from '@/services/analysis/types';
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

const buildInitialState = (): TripStatsScreenState => {
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
    const loadRequestIdRef = useRef(0);
    const [state, setState] = useState<TripStatsScreenState>(buildInitialState);

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
            setState((currentState) => ({
                ...currentState,
                loading: true,
            }));

            const snapshot = await loadTripStatsSnapshot(getTripStatsUserId());
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
        }
    }, [beginLoadRequest]);

    const refreshDataInBackground = useCallback(async (requestId: number) => {
        try {
            const snapshot = await loadTripStatsSnapshot(getTripStatsUserId());
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
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadData(null);
        }, [loadData]),
    );

    const handleStartNewTrip = useCallback(async () => {
        const requestId = beginLoadRequest();

        setState((currentState) => ({
            ...currentState,
            isLocating: true,
            startFeedbackLocation: null,
        }));

        try {
            const result = await startTripFromCurrentLocation(getTripStatsUserId());

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
        }
    }, [beginLoadRequest, refreshDataInBackground, t]);

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
