import { Colors } from '@/constants/theme';
import { ScrollView } from 'react-native';
import { MutableRefObject, RefObject } from 'react';

export type ProfileTheme = typeof Colors.light;

export type AllergenOption = {
    id: string;
    label: string;
    image: any;
};

export type ProfileFormState = {
    loading: boolean;
    inputValue: string;
    allergies: string[];
    otherRestrictions: string[];
    suggestions: string[];
};

export type UseProfileScreenResult = ProfileFormState & {
    scrollViewRef: RefObject<ScrollView | null>;
    shouldScrollRef: MutableRefObject<boolean>;
    loadProfile: () => Promise<void>;
    toggleAllergen: (id: string) => void;
    handleInputChange: (text: string) => void;
    addOtherRestriction: () => void;
    removeRestriction: (item: string) => void;
    selectSuggestion: (item: string) => void;
    saveProfile: () => Promise<void>;
};
