import { Colors } from '@/constants/theme';
import { ImageSourcePropType, ScrollView } from 'react-native';
import { MutableRefObject, RefObject } from 'react';

export type ProfileTheme = typeof Colors.light;

export type AllergySeverity = 'mild' | 'moderate' | 'severe';

export type AllergyEntry = {
    id: string;
    severity: AllergySeverity;
};

export type Gender = 'male' | 'female';

export type AllergenOption = {
    id: string;
    label: string;
    image: ImageSourcePropType;
};

export type ProfileFormState = {
    loading: boolean;
    inputValue: string;
    customAllergenInputValue: string;
    allergies: string[];
    severityMap: Record<string, AllergySeverity>;
    otherRestrictions: string[];
    suggestions: string[];
    customAllergenSuggestions: string[];
};

export type UseProfileScreenResult = ProfileFormState & {
    scrollViewRef: RefObject<ScrollView | null>;
    shouldScrollRef: MutableRefObject<boolean>;
    loadProfile: () => Promise<void>;
    toggleAllergen: (id: string) => void;
    cycleSeverity: (id: string) => void;
    handleInputChange: (text: string) => void;
    handleCustomAllergenInputChange: (text: string) => void;
    addCustomAllergen: (item: string) => void;
    addOtherRestriction: () => void;
    removeRestriction: (item: string) => void;
    selectSuggestion: (item: string) => void;
    saveProfile: () => Promise<void>;
};
