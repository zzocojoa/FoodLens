import { Colors } from '@/constants/theme';
import { ImageSourcePropType, ScrollView } from 'react-native';
import { MutableRefObject, RefObject } from 'react';
import { IngredientSuggestion } from '../utils/profileSuggestions';

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
    isDirty: boolean;
    customAllergenInputValue: string;
    allergies: string[];
    severityMap: Record<string, AllergySeverity>;
    severityItems: string[];
    customAllergenSuggestions: IngredientSuggestion[];
};

export type UseProfileScreenResult = ProfileFormState & {
    scrollViewRef: RefObject<ScrollView | null>;
    shouldScrollRef: MutableRefObject<boolean>;
    loadProfile: (options?: { silent?: boolean }) => Promise<void>;
    toggleAllergen: (id: string) => void;
    cycleSeverity: (id: string) => void;
    handleCustomAllergenInputChange: (text: string) => void;
    addCustomAllergen: (item: string) => void;
    selectCustomAllergenSuggestion: (item: string) => void;
    saveProfile: () => Promise<void>;
};
