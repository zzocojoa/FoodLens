/// <reference types="jest" />

import React from 'react';
import { render } from '@testing-library/react-native';
import AllergiesScreen from '../AllergiesScreen';
import { useProfileScreen } from '../../../profile/hooks/useProfileScreen';

jest.mock('expo-router', () => ({
    Stack: {
        Screen: () => null,
    },
    useRouter: () => ({
        back: jest.fn(),
    }),
}));

jest.mock('../../../../components/TravelerAllergyCard', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return function MockTravelerAllergyCard() {
        return <Text>MOCK_TRAVELER_CARD</Text>;
    };
});

jest.mock('@expo/vector-icons', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return {
        Ionicons: () => <Text>MOCK_ICON</Text>,
    };
});

jest.mock('../../../../hooks/use-color-scheme', () => ({
    useColorScheme: () => 'light',
}));

jest.mock('../../constants/allergies.constants', () => ({
    getAllergiesUserId: () => 'test-user-v1',
    ALLERGIES_TITLE: 'My Allergies',
    ALLERGIES_DESCRIPTION: '등록된 알레르기 및 식단 제한 정보입니다.',
    TRAVELER_CARD_PREVIEW_TITLE: 'Traveler Card Preview',
}));

jest.mock('../../../profile/hooks/useProfileScreen', () => ({
    useProfileScreen: jest.fn(),
}));

jest.mock('@/features/profile/components/AllergenGrid', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return function MockAllergenGrid() {
        return <Text>MOCK_ALLERGEN_GRID</Text>;
    };
});

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback || _key,
    }),
}));

describe('AllergiesScreen', () => {
    const mockedUseProfileScreen = useProfileScreen as jest.MockedFunction<typeof useProfileScreen>;

    const createHookValue = (loading: boolean) =>
        ({
            loading,
            inputValue: '',
            customAllergenInputValue: '',
            allergies: ['Peanuts'],
            severityMap: { Peanuts: 'moderate' },
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
            saveProfile: jest.fn(),
        }) as unknown as ReturnType<typeof useProfileScreen>;

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('renders header and description', () => {
        mockedUseProfileScreen.mockReturnValue(createHookValue(true));

        const { getByText } = render(<AllergiesScreen />);

        expect(getByText('My Allergies')).toBeTruthy();
        expect(getByText(/등록된 알레르기 및 식단 제한 정보입니다/)).toBeTruthy();
    });

    test('does not render traveler card section while loading', () => {
        mockedUseProfileScreen.mockReturnValue(createHookValue(true));

        const { queryByText } = render(<AllergiesScreen />);

        expect(queryByText('Traveler Card Preview')).toBeNull();
        expect(queryByText('MOCK_TRAVELER_CARD')).toBeNull();
    });

    test('renders traveler card section after loading', () => {
        mockedUseProfileScreen.mockReturnValue(createHookValue(false));

        const { getByText } = render(<AllergiesScreen />);

        expect(getByText('Traveler Card Preview')).toBeTruthy();
        expect(getByText('MOCK_TRAVELER_CARD')).toBeTruthy();
        expect(getByText('Save Changes')).toBeTruthy();
    });
});
