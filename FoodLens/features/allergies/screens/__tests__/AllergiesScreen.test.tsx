/// <reference types="jest" />

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AllergiesScreen from '../AllergiesScreen';
import { useAllergiesData } from '../../hooks/useAllergiesData';

const mockedBack = jest.fn();
const mockedPush = jest.fn();

jest.mock('expo-router', () => ({
    Stack: {
        Screen: () => null,
    },
    useRouter: () => ({
        back: mockedBack,
        push: mockedPush,
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
    ALLERGIES_COPY: {
        title: { key: 'allergies.title', fallback: 'My Allergies' },
        description: {
            key: 'allergies.description',
            fallback: '등록된 알레르기 및 식단 제한 정보입니다.',
        },
        emptyTitle: { key: 'allergies.empty.title', fallback: 'All Clear!' },
        emptyDescription: { key: 'allergies.empty.description', fallback: '등록된 알레르기 정보가 없습니다.' },
        travelerCardPreviewTitle: {
            key: 'allergies.travelerCardPreviewTitle',
            fallback: 'Traveler Card Preview',
        },
    },
}));

jest.mock('../../hooks/useAllergiesData', () => ({
    useAllergiesData: jest.fn(),
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

describe('AllergiesScreen', () => {
    const mockedUseAllergiesData = useAllergiesData as jest.MockedFunction<typeof useAllergiesData>;

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('renders header and description', () => {
        mockedUseAllergiesData.mockReturnValue({
            loading: true,
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
        });

        const { getByText } = render(<AllergiesScreen />);

        expect(getByText('My Allergies')).toBeTruthy();
        expect(getByText(/등록된 알레르기 및 식단 제한 정보입니다/)).toBeTruthy();
        expect(getByText('Edit Health Profile')).toBeTruthy();
    });

    test('does not render traveler card section while loading', () => {
        mockedUseAllergiesData.mockReturnValue({
            loading: true,
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
        });

        const { queryByText } = render(<AllergiesScreen />);

        expect(queryByText('Traveler Card Preview')).toBeNull();
        expect(queryByText('MOCK_TRAVELER_CARD')).toBeNull();
    });

    test('renders traveler card section after loading', () => {
        mockedUseAllergiesData.mockReturnValue({
            loading: false,
            allergies: ['Peanuts'],
            dietaryRestrictions: [],
            severityMap: { Peanuts: 'moderate' },
        });

        const { getByText } = render(<AllergiesScreen />);

        expect(getByText('Traveler Card Preview')).toBeTruthy();
        expect(getByText('MOCK_TRAVELER_CARD')).toBeTruthy();
    });

    test('navigates to profile when edit CTA is pressed', () => {
        mockedUseAllergiesData.mockReturnValue({
            loading: false,
            allergies: ['Peanuts'],
            dietaryRestrictions: [],
            severityMap: { Peanuts: 'moderate' },
        });

        const { getByText } = render(<AllergiesScreen />);

        fireEvent.press(getByText('Edit Health Profile'));

        expect(mockedPush).toHaveBeenCalledWith('/profile');
    });
});
