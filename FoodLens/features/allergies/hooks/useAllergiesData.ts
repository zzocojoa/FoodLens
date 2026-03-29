import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { UserService } from '../../../services/userService';
import { getAllergiesUserId } from '../constants/allergies.constants';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import { AllergiesState } from '../types/allergies.types';
import { AllergySeverity } from '@/features/profile/types/profile.types';

const ALLERGIES_REFRESH_INTERVAL_MS = 5000;
const ALLERGIES_REFRESH_DEBOUNCE_MS = 250;

export const useAllergiesData = (): AllergiesState => {
    const [allergies, setAllergies] = useState<string[]>([]);
    const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
    const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({});
    const [loading, setLoading] = useState(true);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadInFlightRef = useRef(false);

    const loadAllergies = useCallback(async (options: { silent: boolean }) => {
        if (loadInFlightRef.current) {
            return;
        }
        loadInFlightRef.current = true;
        const silent = options.silent;
        if (!silent) {
            setLoading(true);
        }
        try {
            const profile = await UserService.getUserProfile(getAllergiesUserId(), {
                allowBackgroundRefresh: false,
            });
            if (!profile) return;

            setAllergies(profile.safetyProfile.allergies);
            setDietaryRestrictions(profile.safetyProfile.dietaryRestrictions);
            setSeverityMap(profile.safetyProfile.severityMap ?? {});
        } catch (e) {
            console.error('Failed to load allergies', e);
        } finally {
            loadInFlightRef.current = false;
            if (!silent) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadAllergies({ silent: false });

        return () => {
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [loadAllergies]);

    useFocusEffect(
        useCallback(() => {
            void loadAllergies({ silent: true });
            const intervalId = setInterval(() => {
                void loadAllergies({ silent: true });
            }, ALLERGIES_REFRESH_INTERVAL_MS);
            return () => {
                clearInterval(intervalId);
            };
        }, [loadAllergies]),
    );

    useEffect(() => {
        const userId = getAllergiesUserId();
        const unsubscribe = subscribeUserProfileUpdated(userId, () => {
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
            }
            refreshTimerRef.current = setTimeout(() => {
                void loadAllergies({ silent: true });
            }, ALLERGIES_REFRESH_DEBOUNCE_MS);
        });

        return () => {
            unsubscribe();
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [loadAllergies]);

    return { allergies, dietaryRestrictions, severityMap, loading };
};
