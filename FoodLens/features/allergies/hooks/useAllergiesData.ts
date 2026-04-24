import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { UserService } from '../../../services/userService';
import { getAllergiesUserId } from '../constants/allergies.constants';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import { AllergiesState } from '../types/allergies.types';
import type { UserProfileUpdateReason } from '@/services/user/userProfileStore';
import type { AllergySeverity } from '@/features/profile/types/profile.types';
import type { UserProfile } from '@/models/User';
import { SafeStorage } from '@/services/storage';
import { getUserStorageKey } from '@/services/user/constants';

const ALLERGIES_REFRESH_INTERVAL_MS = 5000;
const ALLERGIES_REFRESH_DEBOUNCE_MS = 250;
const PROFILE_UPDATE_RELOAD_GUARD_MS = 3000;

type AllergiesSnapshotState = Readonly<{
    allergies: string[];
    dietaryRestrictions: string[];
    severityMap: Record<string, AllergySeverity>;
}>;

const readInitialAllergiesProfileSnapshot = (): UserProfile | null => {
    const userId = getAllergiesUserId();
    return SafeStorage.getSync<UserProfile | null>(getUserStorageKey(userId), null);
};

const buildAllergiesSnapshotState = (profile: UserProfile | null): AllergiesSnapshotState => {
    if (!profile) {
        return {
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
        };
    }

    return {
        allergies: profile.safetyProfile.allergies,
        dietaryRestrictions: profile.safetyProfile.dietaryRestrictions,
        severityMap: profile.safetyProfile.severityMap ?? {},
    };
};

const isRefreshStale = (lastLoadedAtMs: number, refreshWindowMs: number): boolean => {
    if (lastLoadedAtMs <= 0) {
        return true;
    }

    return Date.now() - lastLoadedAtMs >= refreshWindowMs;
};

const shouldReloadFromProfileUpdate = (
    lastLoadedAtMs: number,
    reason: UserProfileUpdateReason,
): boolean => {
    if (reason === 'client_state_write') {
        return false;
    }

    if (lastLoadedAtMs <= 0) {
        return true;
    }

    return Date.now() - lastLoadedAtMs >= PROFILE_UPDATE_RELOAD_GUARD_MS;
};

export const useAllergiesData = (): AllergiesState => {
    const initialProfileSnapshotRef = useRef<UserProfile | null>(readInitialAllergiesProfileSnapshot());
    const initialSnapshotStateRef = useRef<AllergiesSnapshotState>(
        buildAllergiesSnapshotState(initialProfileSnapshotRef.current),
    );
    const [allergies, setAllergies] = useState<string[]>(initialSnapshotStateRef.current.allergies);
    const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>(
        initialSnapshotStateRef.current.dietaryRestrictions,
    );
    const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>(
        initialSnapshotStateRef.current.severityMap,
    );
    const [loading, setLoading] = useState(initialProfileSnapshotRef.current === null);
    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadInFlightRef = useRef(false);
    const lastLoadedAtRef = useRef(0);
    const hasRequestedInitialLoadRef = useRef(false);
    const hasSkippedInitialFocusRefreshRef = useRef(false);

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
            lastLoadedAtRef.current = Date.now();

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
        hasRequestedInitialLoadRef.current = true;
        void loadAllergies({ silent: initialProfileSnapshotRef.current !== null });

        return () => {
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [loadAllergies]);

    useFocusEffect(
        useCallback(() => {
            const shouldSkipInitialFocusRefresh =
                hasRequestedInitialLoadRef.current &&
                !hasSkippedInitialFocusRefreshRef.current &&
                lastLoadedAtRef.current <= 0;

            if (shouldSkipInitialFocusRefresh) {
                hasSkippedInitialFocusRefreshRef.current = true;
            } else if (isRefreshStale(lastLoadedAtRef.current, ALLERGIES_REFRESH_INTERVAL_MS)) {
                void loadAllergies({ silent: true });
            }
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
        const unsubscribe = subscribeUserProfileUpdated(userId, (reason) => {
            if (!shouldReloadFromProfileUpdate(lastLoadedAtRef.current, reason)) {
                return;
            }

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
