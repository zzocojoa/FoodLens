import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { AnalysisService } from '@/services/analysisService';
import { UserService } from '@/services/userService';
import { TEST_UID } from '../constants/tripStats.constants';
import { buildLocationLabel, countSafeAnalysesFromStart, countSafeAnalysesTotal } from '../utils/tripStatsCalculations';
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
            const user = await UserService.getUserProfile(TEST_UID);
            const allAnalyses = await AnalysisService.getAllAnalyses(TEST_UID);

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
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Permission Denied',
                    'Location access is needed to tag your trip. Please enable it in settings.'
                );
                setIsLocating(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = location.coords;

            let locationName = 'Unknown Location';
            try {
                const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
                locationName = buildLocationLabel(
                    reverseGeocode.length > 0 ? reverseGeocode[0] : null,
                    `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`
                );
            } catch (geocodeError) {
                console.warn('Geocoding failed', geocodeError);
                locationName = `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
            }

            const now = new Date();
            await UserService.CreateOrUpdateProfile(TEST_UID, '', {
                currentTripStart: now.toISOString(),
                currentTripLocation: locationName,
                currentTripCoordinates: { latitude, longitude },
            });

            setTripStartDate(now);
            setSafeCount(0);
            setCurrentLocation(locationName);
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
