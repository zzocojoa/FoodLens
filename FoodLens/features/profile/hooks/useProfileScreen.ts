import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import { UserService } from '@/services/userService';
import { TEST_EMAIL, TEST_UID } from '../constants/profile.constants';
import { UseProfileScreenResult } from '../types/profile.types';
import { addUniqueItem, removeStringItem, toggleStringItem } from '../utils/profileSelection';
import { buildSuggestions } from '../utils/profileSuggestions';

export const useProfileScreen = (): UseProfileScreenResult => {
    const [loading, setLoading] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [allergies, setAllergies] = useState<string[]>([]);
    const [otherRestrictions, setOtherRestrictions] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    const scrollViewRef = useRef<ScrollView>(null);
    const shouldScrollRef = useRef(false);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            const user = await UserService.getUserProfile(TEST_UID);
            if (user) {
                setAllergies(user.safetyProfile.allergies);
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

    const toggleAllergen = useCallback((id: string) => {
        setAllergies((prev) => toggleStringItem(prev, id));
    }, []);

    const addItemToRestrictions = useCallback((text: string) => {
        const item = text.trim();
        if (!item) {
            return;
        }

        setOtherRestrictions((prev) => {
            const next = addUniqueItem(prev, item);
            if (next.length !== prev.length) {
                shouldScrollRef.current = true;
            }
            return next;
        });

        setInputValue('');
        setSuggestions([]);
    }, []);

    const addOtherRestriction = useCallback(() => {
        addItemToRestrictions(inputValue);
    }, [addItemToRestrictions, inputValue]);

    const removeRestriction = useCallback((item: string) => {
        setOtherRestrictions((prev) => removeStringItem(prev, item));
    }, []);

    const handleInputChange = useCallback(
        (text: string) => {
            setInputValue(text);
            setSuggestions(buildSuggestions(text, SEARCHABLE_INGREDIENTS, otherRestrictions));
        },
        [otherRestrictions]
    );

    const selectSuggestion = useCallback(
        (item: string) => {
            addItemToRestrictions(item);
        },
        [addItemToRestrictions]
    );

    const saveProfile = useCallback(async () => {
        setLoading(true);
        try {
            await UserService.CreateOrUpdateProfile(TEST_UID, TEST_EMAIL, {
                safetyProfile: {
                    allergies,
                    dietaryRestrictions: otherRestrictions,
                },
                settings: {
                    language: 'en',
                    autoPlayAudio: false,
                },
            });
            Alert.alert('Updated', 'Your profile and preferences have been saved.');
        } catch {
            Alert.alert('Error', 'Failed to save.');
        } finally {
            setLoading(false);
        }
    }, [allergies, otherRestrictions]);

    return {
        loading,
        inputValue,
        allergies,
        otherRestrictions,
        suggestions,
        scrollViewRef,
        shouldScrollRef,
        loadProfile,
        toggleAllergen,
        handleInputChange,
        addOtherRestriction,
        removeRestriction,
        selectSuggestion,
        saveProfile,
    };
};
