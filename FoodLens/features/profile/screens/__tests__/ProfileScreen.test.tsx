import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileScreen from '../ProfileScreen';

const mockSaveProfile = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        replace: jest.fn(),
        back: jest.fn(),
    }),
    useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        colorScheme: 'light',
    }),
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('../../constants/profile.constants', () => ({
    COMMON_ALLERGENS: [],
    SEVERITY_LEVELS: [
        { key: 'mild', label: 'Mild', color: '#22C55E', emoji: '🙂' },
        { key: 'moderate', label: 'Moderate', color: '#F59E0B', emoji: '⚠️' },
        { key: 'severe', label: 'Severe', color: '#EF4444', emoji: '🚨' },
    ],
}));

jest.mock('../../components/AllergenGrid', () => {
    return function MockAllergenGrid() {
        return null;
    };
});

jest.mock('../../components/ProfileHeader', () => {
    const mockReactNative = jest.requireActual('react-native');
    const MockText = mockReactNative.Text;

    return function MockProfileHeader() {
        return <MockText>PROFILE_HEADER</MockText>;
    };
});

jest.mock('../../components/SaveProfileFooter', () => {
    const mockReactNative = jest.requireActual('react-native');
    const MockTouchableOpacity = mockReactNative.TouchableOpacity;
    const MockText = mockReactNative.Text;

    return function MockSaveProfileFooter(props: { onSave: () => void }) {
        return (
            <MockTouchableOpacity onPress={props.onSave}>
                <MockText>SAVE_PROFILE</MockText>
            </MockTouchableOpacity>
        );
    };
});

jest.mock('../../hooks/useProfileScreen', () => ({
    useProfileScreen: () => ({
        loading: false,
        inputValue: '',
        customAllergenInputValue: '',
        allergies: ['peanut'],
        severityMap: { peanut: 'moderate' },
        otherRestrictions: ['Vegan'],
        suggestions: [],
        customAllergenSuggestions: [],
        scrollViewRef: { current: null },
        shouldScrollRef: { current: false },
        loadProfile: jest.fn(),
        toggleAllergen: jest.fn(),
        cycleSeverity: jest.fn(),
        handleInputChange: jest.fn(),
        handleCustomAllergenInputChange: jest.fn(),
        addCustomAllergen: jest.fn(),
        addOtherRestriction: jest.fn(),
        removeRestriction: jest.fn(),
        selectSuggestion: jest.fn(),
        saveProfile: mockSaveProfile,
    }),
}));

describe('ProfileScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders health-only sections including dietary restrictions', () => {
        const { getByText, queryByText } = render(<ProfileScreen />);

        expect(getByText('What should we avoid?')).toBeTruthy();
        expect(getByText('Common Allergens')).toBeTruthy();
        expect(getByText('Other Restrictions')).toBeTruthy();
        expect(getByText('Vegan')).toBeTruthy();
        expect(getByText('Set Severity Level')).toBeTruthy();
        expect(queryByText('Help & Support')).toBeNull();
        expect(queryByText('Account & Data')).toBeNull();
    });

    it('saves health profile changes from the footer action', () => {
        const { getByText } = render(<ProfileScreen />);

        fireEvent.press(getByText('SAVE_PROFILE'));

        expect(mockSaveProfile).toHaveBeenCalledTimes(1);
    });
});
