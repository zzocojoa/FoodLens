import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { UseProfileScreenResult } from '../types/profile.types';
import { loadTestUserProfile, saveTestUserProfile } from '../utils/profilePersistence';
import { useProfileRestrictionHandlers } from './useProfileRestrictionHandlers';

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
            const user = await loadTestUserProfile();
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

    const {
        toggleAllergen,
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

    const saveProfile = useCallback(async () => {
        setLoading(true);
        try {
            await saveTestUserProfile(allergies, otherRestrictions);
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
