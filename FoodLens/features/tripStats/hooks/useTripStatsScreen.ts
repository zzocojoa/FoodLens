import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TEST_UID } from '../constants/tripStats.constants';
import { tripStatsService } from '../services/tripStatsService';
import { countSafeAnalysesFromStart, countSafeAnalysesTotal } from '../utils/tripStatsCalculations';
import { useTripStartToast } from './useTripStartToast';

export function useTripStatsScreen(insetsTop: number) {
    const [loading, setLoading] = useState(true);
    const [safeCount, setSafeCount] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [currentLocation, setCurrentLocation] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [tripStartDate, setTripStartDate] = useState<Date | null>(null);

    const { showToast, toastOpacity, toastTranslate, triggerToast } = useTripStartToast(insetsTop);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const { user, allAnalyses } = await tripStatsService.loadUserTripData(TEST_UID);

            setTotalCount(allAnalyses.length);

            if (user?.currentTripStart) {
                const startTime = new Date(user.currentTripStart).getTime();
                setTripStartDate(new Date(user.currentTripStart));
                setSafeCount(countSafeAnalysesFromStart(allAnalyses, startTime));

                if (user.currentTripLocation) {
                    setCurrentLocation(user.currentTripLocation);
                }
            } else {
                setSafeCount(countSafeAnalysesTotal(allAnalyses));
                setTripStartDate(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadData();
        }, [loadData])
    );

    const handleStartNewTrip = useCallback(async () => {
        setIsLocating(true);
        try {
            const locationResult = await tripStatsService.resolveCurrentLocation();
            if (!locationResult.ok) {
                Alert.alert(
                    'Permission Denied',
                    'Location access is needed to tag your trip. Please enable it in settings.'
                );
                setIsLocating(false);
                return;
            }

            const now = new Date();
            await tripStatsService.startTrip(
                TEST_UID,
                locationResult.locationName,
                locationResult.coordinates,
                now
            );

            setTripStartDate(now);
            setSafeCount(0);
            setCurrentLocation(locationResult.locationName);
            triggerToast();
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to get location. Please try again.');
        } finally {
            setIsLocating(false);
        }
    }, [triggerToast]);

    return {
        loading,
        safeCount,
        totalCount,
        currentLocation,
        isLocating,
        tripStartDate,
        showToast,
        toastOpacity,
        toastTranslate,
        handleStartNewTrip,
    };
}
