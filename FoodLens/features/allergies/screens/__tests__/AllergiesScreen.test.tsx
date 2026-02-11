/// <reference types="jest" />

import React from 'react';
import { render } from '@testing-library/react-native';
import AllergiesScreen from '../AllergiesScreen';
import { useAllergiesData } from '../../hooks/useAllergiesData';

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

jest.mock('../../hooks/useAllergiesData', () => ({
    useAllergiesData: jest.fn(),
}));

describe('AllergiesScreen', () => {
    const mockedUseAllergiesData = useAllergiesData as jest.MockedFunction<typeof useAllergiesData>;

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('renders header and description', () => {
        mockedUseAllergiesData.mockReturnValue({ loading: true, allergies: [] });

        const { getByText } = render(<AllergiesScreen />);

        expect(getByText('My Allergies')).toBeTruthy();
        expect(getByText(/등록된 알레르기 및 식단 제한 정보입니다/)).toBeTruthy();
    });

    test('does not render traveler card section while loading', () => {
        mockedUseAllergiesData.mockReturnValue({ loading: true, allergies: [] });

        const { queryByText } = render(<AllergiesScreen />);

        expect(queryByText('Traveler Card Preview')).toBeNull();
        expect(queryByText('MOCK_TRAVELER_CARD')).toBeNull();
    });

    test('renders traveler card section after loading', () => {
        mockedUseAllergiesData.mockReturnValue({ loading: false, allergies: ['Peanuts'] });

        const { getByText } = render(<AllergiesScreen />);

        expect(getByText('Traveler Card Preview')).toBeTruthy();
        expect(getByText('MOCK_TRAVELER_CARD')).toBeTruthy();
    });
});
