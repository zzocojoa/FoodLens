import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TEST_UID } from '../constants/tripStats.constants';
import { loadTripStatsSnapshot, startTripFromCurrentLocation } from '../services/tripStatsScreenService';
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
            const snapshot = await loadTripStatsSnapshot(TEST_UID);
            setTotalCount(snapshot.totalCount);
            setSafeCount(snapshot.safeCount);
            setTripStartDate(snapshot.tripStartDate);
            setCurrentLocation(snapshot.currentLocation);
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
            const result = await startTripFromCurrentLocation(TEST_UID);
            if (!result.ok) {
                Alert.alert(
                    'Permission Denied',
                    'Location access is needed to tag your trip. Please enable it in settings.'
                );
                setIsLocating(false);
                return;
            }

            setTripStartDate(result.tripStartDate);
            setSafeCount(0);
            setCurrentLocation(result.currentLocation);
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
