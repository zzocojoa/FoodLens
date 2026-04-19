import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { getTripStatsUserId } from '../constants/tripStats.constants';
import {
    loadTripStatsSnapshot,
    startTripFromCurrentLocation,
} from '../services/tripStatsScreenService';
import { TripStatsSnapshot, TripStatsState } from '../types/tripStats.types';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

type UseTripStatsScreenResult = TripStatsState & {
    handleOpenHistory: () => void;
    handleOpenJourneyEntry: (entryId: string) => void;
    handleStartNewTrip: () => Promise<void>;
};

type Handlers = {
    onOpenHistory: () => void;
    onOpenJourneyEntry: (entryId: string) => void;
};

const buildInitialState = (): TripStatsState => {
    return {
        loading: true,
        currentLocation: null,
        isLocating: false,
        tripStartDate: null,
        viewModel: null,
        startFeedbackLocation: null,
    };
};

const buildStateFromSnapshot = (
    snapshot: TripStatsSnapshot,
    startFeedbackLocation: string | null,
): TripStatsState => {
    return {
        loading: false,
        currentLocation: snapshot.currentLocation,
        isLocating: false,
        tripStartDate: snapshot.tripStartDate,
        viewModel: snapshot.viewModel,
        startFeedbackLocation,
    };
};

export function useTripStatsScreen(handlers: Handlers): UseTripStatsScreenResult {
    const { t } = useI18n();
    const [state, setState] = useState<TripStatsState>(buildInitialState);

    const loadData = useCallback(async (startFeedbackLocation: string | null) => {
        try {
            setState((currentState) => ({
                ...currentState,
                loading: true,
            }));

            const snapshot = await loadTripStatsSnapshot(getTripStatsUserId());

            setState(buildStateFromSnapshot(snapshot, startFeedbackLocation));
        } catch (error) {
            console.error(error);
            setState((currentState) => ({
                ...currentState,
                loading: false,
                isLocating: false,
                startFeedbackLocation,
            }));
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadData(null);
        }, [loadData]),
    );

    const handleStartNewTrip = useCallback(async () => {
        setState((currentState) => ({
            ...currentState,
            isLocating: true,
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

            await loadData(result.currentLocation);
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
    }, [loadData, t]);

    return useMemo(() => {
        return {
            ...state,
            handleOpenHistory: handlers.onOpenHistory,
            handleOpenJourneyEntry: handlers.onOpenJourneyEntry,
            handleStartNewTrip,
        };
    }, [handlers.onOpenHistory, handlers.onOpenJourneyEntry, handleStartNewTrip, state]);
}
