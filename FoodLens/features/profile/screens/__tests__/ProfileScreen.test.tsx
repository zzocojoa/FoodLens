import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileScreen from '../ProfileScreen';

const mockSaveProfile = jest.fn();
const mockCycleSeverity = jest.fn();

type MockProfileScreenState = Readonly<{
    loading: boolean;
    inputValue: string;
    customAllergenInputValue: string;
    allergies: string[];
    severityMap: Record<string, string>;
    otherRestrictions: string[];
    severityItems: string[];
    suggestions: string[];
    customAllergenSuggestions: string[];
}>;

const createMockProfileScreenState = (): MockProfileScreenState => ({
    loading: false,
    inputValue: '',
    customAllergenInputValue: '',
    allergies: ['peanut'],
    severityMap: { peanut: 'moderate' },
    otherRestrictions: ['Vegan'],
    severityItems: ['peanut', 'Vegan'],
    suggestions: [],
    customAllergenSuggestions: [],
});

let mockProfileScreenState: MockProfileScreenState = createMockProfileScreenState();

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

jest.mock('lucide-react-native', () => ({
    CircleX: () => null,
    Search: () => null,
    X: () => null,
}));

jest.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        colorScheme: 'light',
    }),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
    useColorScheme: () => 'light',
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
        ...mockProfileScreenState,
        scrollViewRef: { current: null },
        shouldScrollRef: { current: false },
        loadProfile: jest.fn(),
        toggleAllergen: jest.fn(),
        cycleSeverity: mockCycleSeverity,
        handleInputChange: jest.fn(),
        handleCustomAllergenInputChange: jest.fn(),
        addCustomAllergen: jest.fn(),
        selectCustomAllergenSuggestion: jest.fn(),
        addOtherRestriction: jest.fn(),
        removeRestriction: jest.fn(),
        selectSuggestion: jest.fn(),
        saveProfile: mockSaveProfile,
    }),
}));

describe('ProfileScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockProfileScreenState = createMockProfileScreenState();
    });

    it('renders health-only sections including dietary restrictions', () => {
        const { getAllByText, getByText, queryByText } = render(<ProfileScreen />);

        expect(getByText('What should we avoid?')).toBeTruthy();
        expect(getByText('Common Allergens')).toBeTruthy();
        expect(getByText('Other Restrictions')).toBeTruthy();
        expect(getAllByText('Vegan')).toHaveLength(2);
        expect(getByText('Set Severity Level')).toBeTruthy();
        expect(queryByText('Help & Support')).toBeNull();
        expect(queryByText('Account & Data')).toBeNull();
    });

    it('saves health profile changes from the footer action', () => {
        const { getByText } = render(<ProfileScreen />);

        fireEvent.press(getByText('SAVE_PROFILE'));

        expect(mockSaveProfile).toHaveBeenCalledTimes(1);
    });

    it('renders canonical other restriction severity with display name only', () => {
        mockProfileScreenState = {
            ...createMockProfileScreenState(),
            allergies: [],
            severityMap: { gluten_free: 'severe' },
            otherRestrictions: ['gluten_free'],
            severityItems: ['gluten_free'],
        };

        const { getAllByText, getByLabelText, queryByText } = render(<ProfileScreen />);

        expect(getByLabelText('Gluten Free - Severe')).toBeTruthy();
        expect(getAllByText('Gluten Free')).toHaveLength(2);
        expect(queryByText('gluten_free')).toBeNull();
    });

    it('renders custom other restriction severity without storage prefix', () => {
        mockProfileScreenState = {
            ...createMockProfileScreenState(),
            allergies: [],
            severityMap: { 'custom:no raw onion': 'mild' },
            otherRestrictions: ['custom:no raw onion'],
            severityItems: ['custom:no raw onion'],
        };

        const { getAllByText, getByLabelText, queryByText } = render(<ProfileScreen />);

        expect(getByLabelText('no raw onion - Mild')).toBeTruthy();
        expect(getAllByText('no raw onion')).toHaveLength(2);
        expect(queryByText('custom:no raw onion')).toBeNull();
    });
});
