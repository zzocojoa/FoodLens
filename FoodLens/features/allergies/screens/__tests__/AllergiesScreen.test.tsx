/// <reference types="jest" />

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import AllergiesScreen from '../AllergiesScreen';
import { useAllergiesData } from '../../hooks/useAllergiesData';
import { useTravelerAllergyCardModel } from '../../../../components/travelerAllergyCard/hooks/useTravelerAllergyCardModel';
import { homeDashboardDarkColors } from '../../../home/components/homeDashboardTokens';

const mockedBack = jest.fn();
const mockedPush = jest.fn();
const mockedNavigate = jest.fn();
const mockedPrefetch = jest.fn();
let mockedColorScheme: 'light' | 'dark' = 'light';

jest.mock('expo-router', () => ({
    Stack: {
        Screen: () => null,
    },
    useRouter: () => ({
        back: mockedBack,
        navigate: mockedNavigate,
        prefetch: mockedPrefetch,
        push: mockedPush,
    }),
}));

jest.mock('@react-navigation/native', () => ({
    useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({
        top: 12,
        bottom: 24,
        left: 0,
        right: 0,
    }),
}));

jest.mock('../../../../components/TravelerAllergyCard', () => {
    const mockReact = jest.requireActual<typeof React>('react');
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');

    return function MockTravelerAllergyCard() {
        return mockReact.createElement(MockText, null, 'MOCK_TRAVELER_CARD');
    };
});

jest.mock('../../../../hooks/use-color-scheme', () => ({
    useColorScheme: () => mockedColorScheme,
}));

jest.mock('../../constants/allergies.constants', () => ({
    getAllergiesUserId: () => 'test-user-v1',
    ALLERGIES_COPY: {
        title: { key: 'allergies.title', fallback: 'My Allergies' },
        description: {
            key: 'allergies.description',
            fallback: '등록된 알레르기 정보입니다.',
        },
        emptyTitle: { key: 'allergies.empty.title', fallback: 'All Clear!' },
        emptyDescription: { key: 'allergies.empty.description', fallback: '등록된 알레르기 정보가 없습니다.' },
    },
}));

jest.mock('../../hooks/useAllergiesData', () => ({
    useAllergiesData: jest.fn(),
}));

jest.mock('../../../../components/travelerAllergyCard/hooks/useTravelerAllergyCardModel', () => ({
    useTravelerAllergyCardModel: jest.fn(),
}));

jest.mock('../../../../components/travelerAllergyCard/hooks/useTravelerAllergens', () => ({
    TravelerAllergensProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../../home/components/HomeBackgroundAtmosphere', () => {
    function MockHomeBackgroundAtmosphere() {
        return null;
    }

    return {
        __esModule: true,
        default: MockHomeBackgroundAtmosphere,
        HomeBackgroundAtmosphere: MockHomeBackgroundAtmosphere,
    };
});

jest.mock('@/features/i18n', () => {
    const en = jest.requireActual('../../../i18n/resources/en.json') as Record<string, string>;

    const requiresResource = (key: string): boolean =>
        key.startsWith('allergies.') || key.startsWith('onboarding.severity.') || key.startsWith('travelerCard.');

    return {
        useI18n: () => ({
            t: (key: string, fallback?: string) => {
                const value = en[key];
                if (typeof value === 'string') return value;
                if (requiresResource(key)) {
                    throw new Error(`Missing test i18n resource: ${key}`);
                }
                return fallback ?? key;
            },
        }),
    };
});

describe('AllergiesScreen', () => {
    const mockedUseAllergiesData = useAllergiesData as jest.MockedFunction<typeof useAllergiesData>;
    const mockedUseTravelerAllergyCardModel =
        useTravelerAllergyCardModel as jest.MockedFunction<typeof useTravelerAllergyCardModel>;

    afterEach(() => {
        mockedColorScheme = 'light';
        jest.clearAllMocks();
    });

    test('renders loading shell without traveler preview or add CTA', () => {
        mockedUseTravelerAllergyCardModel.mockReturnValue(null);
        mockedUseAllergiesData.mockReturnValue({
            loading: true,
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
        });

        const { getByText, queryByText } = render(<AllergiesScreen />);

        expect(getByText('My Allergies')).toBeTruthy();
        expect(getByText('Preparing your traveler card')).toBeTruthy();
        expect(queryByText('Add allergy info')).toBeNull();
    });

    test('renders empty state with the add-allergy CTA', () => {
        mockedUseTravelerAllergyCardModel.mockReturnValue(null);
        mockedUseAllergiesData.mockReturnValue({
            loading: false,
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
        });

        const { getByText, queryByText } = render(<AllergiesScreen />);

        expect(getByText('No saved items yet')).toBeTruthy();
        expect(getByText('Add your allergies before analyzing food.')).toBeTruthy();
        expect(getByText('Add allergy info')).toBeTruthy();
        expect(queryByText('Traveler Card Preview')).toBeNull();
    });

    test('renders the traveler passport hero and closes the modal from the backdrop', () => {
        mockedUseTravelerAllergyCardModel.mockReturnValue({
            displayData: {
                isAiLoaded: false,
                language: 'English',
                sub: 'Traveler Safety Card (Manual Language)',
                text: 'I have food allergies. Please check ingredients carefully.',
                usedAiText: false,
            },
            finalMessage: 'I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nPeanuts, Vegan',
            isAiLoaded: false,
        });
        mockedUseAllergiesData.mockReturnValue({
            loading: false,
            allergies: ['Peanuts'],
            dietaryRestrictions: ['Vegan'],
            severityMap: { Peanuts: 'severe' },
        });

        const { getByTestId, getByText, queryByText, queryByTestId } = render(<AllergiesScreen />);

        expect(getByText('Your passport card is ready')).toBeTruthy();
        expect(getByText('Severe 1')).toBeTruthy();
        expect(getByText('Restrictions 1')).toBeTruthy();
        expect(queryByText('View larger')).toBeNull();
        expect(queryByText('Edit profile')).toBeNull();
        expect(getByText('I have food allergies. Please check ingredients carefully.\n\n⚠️ My allergies:\nPeanuts, Vegan')).toBeTruthy();
        expect(queryByText('I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nPeanuts, Vegan')).toBeNull();

        fireEvent.press(getByText('Traveler Passport'));

        expect(getByTestId('allergies-traveler-card-body')).toBeTruthy();
        expect(queryByText('Traveler Card Preview')).toBeNull();
        expect(queryByText('Expanded view')).toBeNull();
        expect(queryByText('Close')).toBeNull();

        fireEvent.press(getByTestId('allergies-traveler-card-close'));

        expect(queryByTestId('allergies-traveler-card-body')).toBeNull();
    });

    test('uses dark tokens for the expanded traveler card modal', () => {
        mockedColorScheme = 'dark';
        mockedUseTravelerAllergyCardModel.mockReturnValue({
            displayData: {
                isAiLoaded: false,
                language: 'English',
                sub: 'Traveler Safety Card (Manual Language)',
                text: 'I have food allergies. Please check ingredients carefully.',
                usedAiText: false,
            },
            finalMessage: 'I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nPeanuts',
            isAiLoaded: false,
        });
        mockedUseAllergiesData.mockReturnValue({
            loading: false,
            allergies: ['Peanuts'],
            dietaryRestrictions: [],
            severityMap: { Peanuts: 'severe' },
        });

        const { getByTestId, getByText } = render(<AllergiesScreen />);

        fireEvent.press(getByText('Traveler Passport'));

        expect(StyleSheet.flatten(getByTestId('allergies-traveler-card-sheet').props.style)).toMatchObject({
            backgroundColor: homeDashboardDarkColors.surfaceStrong,
            borderColor: homeDashboardDarkColors.lineStrong,
        });
        expect(StyleSheet.flatten(getByTestId('allergies-traveler-card-close').props.style)).toMatchObject({
            backgroundColor: homeDashboardDarkColors.surfaceMuted,
            borderColor: homeDashboardDarkColors.lineStrong,
        });
    });

    test('renders canonical and custom values in the risk ledger without storage tokens', () => {
        mockedUseTravelerAllergyCardModel.mockReturnValue({
            displayData: {
                isAiLoaded: false,
                language: 'English',
                sub: 'Traveler Safety Card (Manual Language)',
                text: 'I have food allergies. Please check ingredients carefully.',
                usedAiText: false,
            },
            finalMessage:
                'I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nPeach, Gluten Free, no raw onion',
            isAiLoaded: false,
        });
        mockedUseAllergiesData.mockReturnValue({
            loading: false,
            allergies: ['peach'],
            dietaryRestrictions: ['gluten_free', 'custom:no raw onion'],
            severityMap: { peach: 'moderate' },
        });

        const { getAllByText, queryByText } = render(<AllergiesScreen />);

        expect(getAllByText('Peach').length).toBeGreaterThan(0);
        expect(getAllByText('Gluten Free').length).toBeGreaterThan(0);
        expect(getAllByText('no raw onion').length).toBeGreaterThan(0);
        expect(queryByText('gluten_free')).toBeNull();
        expect(queryByText('custom:no raw onion')).toBeNull();
    });

    test('surfaces explicit dietary restriction severity while keeping restrictions section', () => {
        mockedUseTravelerAllergyCardModel.mockReturnValue({
            displayData: {
                isAiLoaded: false,
                language: 'English',
                sub: 'Traveler Safety Card (Manual Language)',
                text: 'I have food allergies. Please check ingredients carefully.',
                usedAiText: false,
            },
            finalMessage: 'I have food allergies. Please check ingredients carefully.\n\n⚠️ My Allergies:\nVegan',
            isAiLoaded: false,
        });
        mockedUseAllergiesData.mockReturnValue({
            loading: false,
            allergies: [],
            dietaryRestrictions: ['Vegan'],
            severityMap: { Vegan: 'severe' },
        });

        const { getByText } = render(<AllergiesScreen />);

        expect(getByText('Severe 1')).toBeTruthy();
        expect(getByText('Restrictions 1')).toBeTruthy();
        expect(getByText('Severe · Vegan')).toBeTruthy();
    });
});
