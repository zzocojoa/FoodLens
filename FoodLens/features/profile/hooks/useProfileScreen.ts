import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { AllergySeverity, UseProfileScreenResult } from '../types/profile.types';
import { loadTestUserProfile, saveTestUserProfile } from '../utils/profilePersistence';
import { useProfileRestrictionHandlers } from './useProfileRestrictionHandlers';
import { buildSuggestions } from '../utils/profileSuggestions';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';

const normalizeAllergyKey = (value: string) => value.trim().toLowerCase();

export const useProfileScreen = (): UseProfileScreenResult => {
    const { t } = useI18n();
    const [loading, setLoading] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [customAllergenInputValue, setCustomAllergenInputValue] = useState('');
    const [allergies, setAllergies] = useState<string[]>([]);
    const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({});
    const [otherRestrictions, setOtherRestrictions] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [customAllergenSuggestions, setCustomAllergenSuggestions] = useState<string[]>([]);

    const scrollViewRef = useRef<ScrollView>(null);
    const shouldScrollRef = useRef(false);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            const user = await loadTestUserProfile();
            if (user) {
                setAllergies(user.safetyProfile.allergies);
                setSeverityMap(user.safetyProfile.severityMap ?? {});
                setOtherRestrictions(user.safetyProfile.dietaryRestrictions);
            }
        } catch {
            // Keep current behavior: ignore load errors.
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const {
        addOtherRestriction,
        removeRestriction,
        handleInputChange,
        selectSuggestion,
    } = useProfileRestrictionHandlers({
        inputValue,
        otherRestrictions,
        setInputValue,
        setSuggestions,
        setAllergies,
        setOtherRestrictions,
        shouldScrollRef,
    });

    const toggleAllergen = useCallback((id: string) => {
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

            setSeverityMap((map) => ({ ...map, [id]: 'moderate' }));
            return [...prev, id];
        });
    }, []);

    const cycleSeverity = useCallback((id: string) => {
        setSeverityMap((prev) => {
            const current = prev[id] || 'moderate';
            const next: AllergySeverity =
                current === 'mild' ? 'moderate' : current === 'moderate' ? 'severe' : 'mild';
            return { ...prev, [id]: next };
        });
    }, []);

    const handleCustomAllergenInputChange = useCallback(
        (text: string) => {
            setCustomAllergenInputValue(text);
            setCustomAllergenSuggestions(buildSuggestions(text, SEARCHABLE_INGREDIENTS, allergies));
        },
        [allergies]
    );

    const addCustomAllergen = useCallback((name: string) => {
        const item = name.trim();
        if (!item) {
            return;
        }

        const normalizedItem = normalizeAllergyKey(item);

        setAllergies((prev) => {
            const hasDuplicate = prev.some((existing) => normalizeAllergyKey(existing) === normalizedItem);
            if (hasDuplicate) {
                return prev;
            }
            setSeverityMap((map) => ({ ...map, [item]: 'moderate' }));
            return [...prev, item];
        });

        setCustomAllergenInputValue('');
        setCustomAllergenSuggestions([]);
    }, []);

    const saveProfile = useCallback(async () => {
        setLoading(true);
        try {
            await saveTestUserProfile(allergies, otherRestrictions, severityMap);
            showTranslatedAlert(t, {
                titleKey: 'profile.alert.updatedTitle',
                titleFallback: 'Updated',
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
    }, [allergies, otherRestrictions, severityMap, t]);

    return {
        loading,
        inputValue,
        customAllergenInputValue,
        allergies,
        severityMap,
        otherRestrictions,
        suggestions,
        customAllergenSuggestions,
        scrollViewRef,
        shouldScrollRef,
        loadProfile,
        toggleAllergen,
        cycleSeverity,
        handleInputChange,
        handleCustomAllergenInputChange,
        addCustomAllergen,
        addOtherRestriction,
        removeRestriction,
        selectSuggestion,
        saveProfile,
    };
};
