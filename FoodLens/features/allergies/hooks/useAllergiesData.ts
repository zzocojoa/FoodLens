import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { UserService } from '../../../services/userService_Logic';
import { getAllergiesUserId } from '../constants/allergies.constants';
import { mergeAllergyTerms } from '../utils/mergeAllergyTerms';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore_Logic';
import { AllergiesState } from '../types/allergies.types';

const ALLERGIES_REFRESH_INTERVAL_MS = 5000;
const ALLERGIES_REFRESH_DEBOUNCE_MS = 250;

export const useAllergiesData = (): AllergiesState => {
    const [allergies, setAllergies] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadInFlightRef = useRef(false);

    const loadAllergies = useCallback(async (options: { silent?: boolean } = {}) => {
        if (loadInFlightRef.current) {
            return;
        }
        loadInFlightRef.current = true;
        const silent = options.silent === true;
        if (!silent) {
            setLoading(true);
        }
        try {
            const profile = await UserService.getUserProfile(getAllergiesUserId());
            if (!profile) return;

            const combined = mergeAllergyTerms(
                profile.safetyProfile.allergies,
                profile.safetyProfile.dietaryRestrictions
            );
            setAllergies(combined);
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
        loadAllergies();

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

    return { allergies, loading };
};
