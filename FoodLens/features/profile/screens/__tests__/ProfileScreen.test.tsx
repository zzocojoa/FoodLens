import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileScreen from '../ProfileScreen';

const mockSaveProfile = jest.fn();
const mockCycleSeverity = jest.fn();

type MockProfileScreenState = Readonly<{
    loading: boolean;
    savedNoticeKey: number;
    customAllergenInputValue: string;
    allergies: string[];
    severityMap: Record<string, string>;
    severityItems: string[];
    customAllergenSuggestions: string[];
}>;

const createMockProfileScreenState = (): MockProfileScreenState => ({
    loading: false,
    savedNoticeKey: 0,
    customAllergenInputValue: '',
    allergies: ['peanut'],
    severityMap: { peanut: 'moderate' },
    severityItems: ['peanut', 'Vegan'],
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
    Check: () => null,
    ChevronRight: () => null,
    Pencil: () => null,
    Plus: () => null,
    Search: () => null,
    ShieldCheck: () => null,
    X: () => null,
}));

jest.mock('@/features/home/components/HomeBackgroundAtmosphere', () => ({
    HomeBackgroundAtmosphere: () => null,
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
    const MockTouchableOpacity = mockReactNative.TouchableOpacity;
    const MockText = mockReactNative.Text;

    return function MockProfileHeader(props: { onSave?: () => void }) {
        return (
            <>
                <MockText>PROFILE_HEADER</MockText>
                {props.onSave ? (
                    <MockTouchableOpacity onPress={props.onSave}>
                        <MockText>SAVE_PROFILE</MockText>
                    </MockTouchableOpacity>
                ) : null}
            </>
        );
    };
});

jest.mock('../../hooks/useProfileScreen', () => ({
    useProfileScreen: () => ({
        ...mockProfileScreenState,
        isDirty: true,
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

    it('renders allergen-only health sections', () => {
        const { getAllByText, getByText, queryByText } = render(<ProfileScreen />);

        expect(getByText('FoodLens safety criteria')).toBeTruthy();
        expect(getByText('Common allergens')).toBeTruthy();
        expect(getByText('Missing from the list')).toBeTruthy();
        expect(getAllByText('Peanut')).toHaveLength(1);
        expect(getByText('Protection ledger')).toBeTruthy();
        expect(queryByText('Dietary restrictions')).toBeNull();
        expect(queryByText('Vegan')).toBeNull();
        expect(queryByText('Help & Support')).toBeNull();
        expect(queryByText('Account & Data')).toBeNull();
    });

    it('saves health profile changes from the header action', () => {
        const { getByText } = render(<ProfileScreen />);

        fireEvent.press(getByText('SAVE_PROFILE'));

        expect(mockSaveProfile).toHaveBeenCalledTimes(1);
    });

    it('does not render canonical other restriction severity', () => {
        mockProfileScreenState = {
            ...createMockProfileScreenState(),
            allergies: [],
            severityMap: { gluten_free: 'severe' },
            severityItems: [],
        };

        const { queryByLabelText, queryByText } = render(<ProfileScreen />);

        expect(queryByLabelText('Gluten Free, Diet, Severe')).toBeNull();
        expect(queryByText('Gluten Free')).toBeNull();
        expect(queryByText('gluten_free')).toBeNull();
    });

    it('does not render custom other restriction severity', () => {
        mockProfileScreenState = {
            ...createMockProfileScreenState(),
            allergies: [],
            severityMap: { 'custom:no raw onion': 'mild' },
            severityItems: [],
        };

        const { queryByLabelText, queryByText } = render(<ProfileScreen />);

        expect(queryByLabelText('no raw onion, Diet, Mild')).toBeNull();
        expect(queryByText('no raw onion')).toBeNull();
        expect(queryByText('custom:no raw onion')).toBeNull();
    });
});
