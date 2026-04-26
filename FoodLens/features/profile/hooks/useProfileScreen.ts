import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AllergySeverity, UseProfileScreenResult } from '../types/profile.types';
import {
    PROFILE_AUTH_REQUIRED_ERROR,
    loadTestUserProfile,
    saveTestUserProfile,
} from '../utils/profilePersistence';
import {
    buildSuggestions,
    createCustomRestrictionValue,
    resolveSuggestionStorageValue,
    IngredientSuggestion,
} from '../utils/profileSuggestions';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import { getProfileUserId } from '../constants/profile.constants';
import {
    getManualMergeConflictOperationsForUser,
    resolveManualMergeConflictsForUser,
} from '@/services/sync/phase2ConflictResolution';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import type { Phase2ConflictResolution } from '@/services/sync/phase2Sync.types';
import type { UserProfileUpdateReason } from '@/services/user/userProfileStore';

const normalizeAllergyKey = (value: string) => value.trim().toLowerCase();
const PROFILE_SCREEN_REFRESH_INTERVAL_MS = 5000;
const PROFILE_SCREEN_REFRESH_DEBOUNCE_MS = 250;

const shouldRefreshProfileScreen = (reason: UserProfileUpdateReason): boolean => {
    return reason !== 'client_state_write';
};

const buildAllergySeverityMap = (
    allergies: string[],
    severityMap: Record<string, AllergySeverity>,
): Record<string, AllergySeverity> => {
    return allergies.reduce<Record<string, AllergySeverity>>((next, allergy) => {
        return {
            ...next,
            [allergy]: severityMap[allergy] ?? 'moderate',
        };
    }, {});
};

export const useProfileScreen = (): UseProfileScreenResult => {
    const { t } = useI18n();
    const [loading, setLoading] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [customAllergenInputValue, setCustomAllergenInputValue] = useState('');
    const [allergies, setAllergies] = useState<string[]>([]);
    const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({});
    const [customAllergenSuggestions, setCustomAllergenSuggestions] = useState<IngredientSuggestion[]>([]);
    const profileRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loadInFlightRef = useRef(false);
    const hasLocalEditsRef = useRef(false);

    const scrollViewRef = useRef<ScrollView>(null);
    const shouldScrollRef = useRef(false);
    const isSyncNotConfirmedError = useCallback(
        (error: unknown): boolean =>
            error instanceof Error && error.message === 'PHASE2_SYNC_NOT_CONFIRMED',
        [],
    );
    const isProfileAuthRequiredError = useCallback(
        (error: unknown): boolean =>
            error instanceof Error && error.message === PROFILE_AUTH_REQUIRED_ERROR,
        [],
    );
    const markLocalEdit = useCallback((): void => {
        hasLocalEditsRef.current = true;
        setIsDirty(true);
    }, []);

    const loadProfile = useCallback(async (options: { silent?: boolean } = {}) => {
        if (loadInFlightRef.current) {
            return;
        }
        loadInFlightRef.current = true;
        const silent = options.silent === true;
        if (!silent) {
            setLoading(true);
        }
        try {
            const user = await loadTestUserProfile();
            if (user) {
                // Avoid overwriting in-progress local edits with periodic silent refresh payloads.
                if (silent && hasLocalEditsRef.current) {
                    return;
                }
                setAllergies(user.safetyProfile.allergies);
                setSeverityMap(buildAllergySeverityMap(
                    user.safetyProfile.allergies,
                    user.safetyProfile.severityMap ?? {},
                ));
                hasLocalEditsRef.current = false;
                setIsDirty(false);
            }
        } catch {
            // Keep current behavior: ignore load errors.
        } finally {
            loadInFlightRef.current = false;
            if (!silent) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    useFocusEffect(
        useCallback(() => {
            void loadProfile({ silent: true });
            const intervalId = setInterval(() => {
                void loadProfile({ silent: true });
            }, PROFILE_SCREEN_REFRESH_INTERVAL_MS);
            return () => {
                clearInterval(intervalId);
            };
        }, [loadProfile]),
    );

    useEffect(() => {
        const userId = getProfileUserId();
        const unsubscribe = subscribeUserProfileUpdated(userId, (reason) => {
            if (!shouldRefreshProfileScreen(reason)) {
                return;
            }

            if (profileRefreshTimerRef.current) {
                clearTimeout(profileRefreshTimerRef.current);
            }
            profileRefreshTimerRef.current = setTimeout(() => {
                void loadProfile({ silent: true });
            }, PROFILE_SCREEN_REFRESH_DEBOUNCE_MS);
        });

        return () => {
            unsubscribe();
            if (profileRefreshTimerRef.current) {
                clearTimeout(profileRefreshTimerRef.current);
                profileRefreshTimerRef.current = null;
            }
        };
    }, [loadProfile]);

    const promptConflictResolution = useCallback(
        (count: number): Promise<Phase2ConflictResolution | null> =>
            new Promise((resolve) => {
                let settled = false;
                const settle = (value: Phase2ConflictResolution | null) => {
                    if (settled) return;
                    settled = true;
                    resolve(value);
                };

                Alert.alert(
                    t('sync.conflict.title', 'Sync conflict detected'),
                    t(
                        'sync.conflict.message',
                        `Saved locally, but ${count} cloud conflict(s) were found. Choose which data to keep.`,
                    ),
                    [
                        {
                            text: t('sync.conflict.action.later', 'Later'),
                            style: 'cancel',
                            onPress: () => settle(null),
                        },
                        {
                            text: t('sync.conflict.action.keepServer', 'Keep Server'),
                            onPress: () => settle('use_server'),
                        },
                        {
                            text: t('sync.conflict.action.keepDevice', 'Keep This Device'),
                            style: 'destructive',
                            onPress: () => settle('use_local'),
                        },
                    ],
                    {
                        cancelable: true,
                        onDismiss: () => settle(null),
                    },
                );
            }),
        [t],
    );

    const toggleAllergen = useCallback((id: string) => {
        markLocalEdit();
        setCustomAllergenInputValue('');
        setCustomAllergenSuggestions([]);

        setAllergies((prev) => {
            if (prev.includes(id)) {
                setSeverityMap((map) => {
                    const next = { ...map };
                    delete next[id];
                    return next;
                });
                return prev.filter((allergenId) => allergenId !== id);
            }

            setSeverityMap((map) => ({ ...map, [id]: map[id] ?? 'moderate' }));
            return [...prev, id];
        });
    }, [markLocalEdit]);

    const cycleSeverity = useCallback((id: string) => {
        markLocalEdit();
        setSeverityMap((prev) => {
            const current = prev[id] || 'moderate';
            const next: AllergySeverity =
                current === 'mild' ? 'moderate' : current === 'moderate' ? 'severe' : 'mild';
            return { ...prev, [id]: next };
        });
    }, [markLocalEdit]);

    const handleCustomAllergenInputChange = useCallback(
        (text: string) => {
            setCustomAllergenInputValue(text);
            setCustomAllergenSuggestions(buildSuggestions({
                keyword: text,
                searchable: SEARCHABLE_INGREDIENTS,
                selected: allergies,
                limit: 5,
                translate: t,
            }));
        },
        [allergies, t]
    );

    const addAllergenStorageValue = useCallback((value: string) => {
        const item = value.trim();
        if (!item) {
            return;
        }
        markLocalEdit();

        const normalizedItem = normalizeAllergyKey(item);

        setAllergies((prev) => {
            const hasDuplicate = prev.some((existing) => normalizeAllergyKey(existing) === normalizedItem);
            if (hasDuplicate) {
                return prev;
            }
            setSeverityMap((map) => ({ ...map, [item]: map[item] ?? 'moderate' }));
            return [...prev, item];
        });

        setCustomAllergenInputValue('');
        setCustomAllergenSuggestions([]);
    }, [markLocalEdit]);

    const addCustomAllergen = useCallback((name: string) => {
        const item = name.trim();
        if (!item) {
            return;
        }
        addAllergenStorageValue(createCustomRestrictionValue(item));
    }, [addAllergenStorageValue]);

    const selectCustomAllergenSuggestion = useCallback((item: string) => {
        addAllergenStorageValue(resolveSuggestionStorageValue(item));
    }, [addAllergenStorageValue]);

    const saveProfile = useCallback(async () => {
        setLoading(true);
        let saveError: unknown = null;
        try {
            await saveTestUserProfile(allergies, [], buildAllergySeverityMap(allergies, severityMap));
            hasLocalEditsRef.current = false;
            setIsDirty(false);
        } catch (error) {
            saveError = error;
        }

        try {
            if (saveError && isProfileAuthRequiredError(saveError)) {
                showTranslatedAlert(t, {
                    titleKey: 'profile.alert.authRequiredTitle',
                    titleFallback: 'Login required',
                    messageKey: 'profile.alert.authRequiredMessage',
                    messageFallback: 'Please log in again before saving your health profile.',
                });
                return;
            }

            const conflicts = await getManualMergeConflictOperationsForUser(getProfileUserId());
            if (conflicts.length > 0) {
                const resolution = await promptConflictResolution(conflicts.length);
                if (!resolution) {
                    showTranslatedAlert(t, {
                        titleKey: 'sync.conflict.deferredTitle',
                        titleFallback: 'Saved locally',
                        messageKey: 'sync.conflict.deferredMessage',
                        messageFallback:
                            'Cloud sync has pending conflicts. Resolve them later from this device.',
                    });
                    return;
                }

                const result = await resolveManualMergeConflictsForUser({
                    userId: getProfileUserId(),
                    resolution,
                });

                if (result.remaining === 0) {
                    showTranslatedAlert(t, {
                        titleKey: 'sync.conflict.resolvedTitle',
                        titleFallback: 'Conflict resolved',
                        messageKey: 'sync.conflict.resolvedMessage',
                        messageFallback:
                            resolution === 'use_server'
                                ? 'Server version was kept for conflicting fields.'
                                : 'This device version was re-applied to the server.',
                    });
                    return;
                }

                showTranslatedAlert(t, {
                    titleKey: 'sync.conflict.remainingTitle',
                    titleFallback: 'Conflicts remaining',
                    messageKey: 'sync.conflict.remainingMessage',
                    messageFallback: 'Some conflicts are still pending. Please try again.',
                });
                return;
            }

            if (saveError) {
                if (isSyncNotConfirmedError(saveError)) {
                    showTranslatedAlert(t, {
                        titleKey: 'sync.pending.title',
                        titleFallback: 'Saved locally',
                        messageKey: 'sync.pending.message',
                        messageFallback:
                            'Your changes were saved on this device and will sync to the cloud shortly.',
                    });
                    return;
                }

                showTranslatedAlert(t, {
                    titleKey: 'profile.alert.errorTitle',
                    titleFallback: 'Error',
                    messageKey: 'profile.alert.saveFailed',
                    messageFallback: 'Failed to save.',
                });
                return;
            }

            showTranslatedAlert(t, {
                titleKey: 'profile.health.saved',
                titleFallback: 'Saved',
                messageKey: 'profile.alert.updatedMessage',
                messageFallback: 'Your profile and preferences have been saved.',
            });
        } catch {
            showTranslatedAlert(t, {
                titleKey: 'profile.alert.errorTitle',
                titleFallback: 'Error',
                messageKey: 'profile.alert.saveFailed',
                messageFallback: 'Failed to save.',
            });
        } finally {
            setLoading(false);
        }
    }, [
        allergies,
        promptConflictResolution,
        severityMap,
        t,
        isSyncNotConfirmedError,
        isProfileAuthRequiredError,
    ]);

    return {
        loading,
        isDirty,
        customAllergenInputValue,
        allergies,
        severityMap,
        customAllergenSuggestions,
        severityItems: allergies,
        scrollViewRef,
        shouldScrollRef,
        loadProfile,
        toggleAllergen,
        cycleSeverity,
        handleCustomAllergenInputChange,
        addCustomAllergen,
        selectCustomAllergenSuggestion,
        saveProfile,
    };
};
