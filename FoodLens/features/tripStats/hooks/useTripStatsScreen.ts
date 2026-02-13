import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { TEST_UID } from '../constants/tripStats.constants';
import { loadTripStatsSnapshot, startTripFromCurrentLocation } from '../services/tripStatsScreenService';
import { useTripStartToast } from './useTripStartToast';
import { useI18n } from '@/features/i18n';

export function useTripStatsScreen(insetsTop: number) {
    const { t } = useI18n();
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
                    t('tripStats.alert.permissionDeniedTitle', 'Permission Denied'),
                    t(
                        'tripStats.alert.permissionDeniedMessage',
                        'Location access is needed to tag your trip. Please enable it in settings.'
                    )
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
            Alert.alert(
                t('camera.alert.errorTitle', 'Error'),
                t('tripStats.alert.failedToGetLocation', 'Failed to get location. Please try again.')
            );
        } finally {
            setIsLocating(false);
        }
    }, [triggerToast, t]);

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
