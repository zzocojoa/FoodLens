/// <reference types="jest" />

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import TripStatsScreen from '../TripStatsScreen';
import { useTripStatsScreen } from '../../hooks/useTripStatsScreen';

const mockedBack = jest.fn();

jest.mock('expo-router', () => ({
    Stack: {
        Screen: () => null,
    },
    useRouter: () => ({
        back: mockedBack,
        push: jest.fn(),
    }),
}));

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({
        top: 16,
        bottom: 24,
        left: 0,
        right: 0,
    }),
}));

jest.mock('../../../home/components/HomeBackgroundAtmosphere', () => {
    return function MockHomeBackgroundAtmosphere() {
        return null;
    };
});

jest.mock('../../components/TripStatsJournalRail', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return function MockTripStatsJournalRail() {
        return <Text>JOURNAL_RAIL</Text>;
    };
});

jest.mock('../../components/TripStatsPassportTotals', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return function MockTripStatsPassportTotals() {
        return <Text>PASSPORT_TOTALS</Text>;
    };
});

jest.mock('../../hooks/useTripStatsScreen', () => ({
    useTripStatsScreen: jest.fn(),
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        locale: 'en-US',
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
    formatCalendarDate: (value: Date | string) => {
        return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    },
}));

jest.mock('@/services/navigation/resultEntryNavigation', () => ({
    navigateToStoredResult: jest.fn(),
}));

describe('TripStatsScreen', () => {
    const mockedUseTripStatsScreen = useTripStatsScreen as jest.MockedFunction<typeof useTripStatsScreen>;

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('renders the simplified trip stats sections and keeps the main actions', () => {
        const handleOpenHistory = jest.fn();
        const handleOpenJourneyEntry = jest.fn();
        const handleStartNewTrip = jest.fn();

        mockedUseTripStatsScreen.mockReturnValue({
            loading: false,
            currentLocation: 'Tokyo, Japan',
            isLocating: false,
            tripStartDate: new Date('2026-01-10T00:00:00.000Z'),
            startFeedbackLocation: null,
            viewModel: {
                hasActiveTrip: true,
                hero: {
                    scope: 'currentTrip',
                    tripStartDate: new Date('2026-01-10T00:00:00.000Z'),
                    locationLabel: 'Tokyo, Japan',
                    tone: 'safe',
                    analysisCount: 3,
                    safeCount: 2,
                    cautionCount: 1,
                    dangerCount: 0,
                    totalCount: 3,
                    chapterCount: 1,
                    recentJourneyCount: 1,
                },
                passportTotals: {
                    totalAnalyses: 8,
                    safeCount: 5,
                    cautionCount: 2,
                    dangerCount: 1,
                    currentTripCount: 3,
                    currentTripSafeCount: 2,
                    currentTripCautionCount: 1,
                    currentTripDangerCount: 0,
                    countriesVisitedCount: 2,
                    citiesVisitedCount: 3,
                },
                countryChapters: [],
                recentJourneyEntries: [
                    {
                        id: 'entry-1',
                        record: {
                            id: 'entry-1',
                            foodName: 'Miso Soup',
                            ingredients: [],
                            safetyStatus: 'SAFE',
                            timestamp: new Date('2026-01-11T00:00:00.000Z'),
                        },
                        foodName: 'Miso Soup',
                        safetyStatus: 'SAFE',
                        tone: 'safe',
                        timestamp: new Date('2026-01-11T00:00:00.000Z'),
                        locationLabel: 'Tokyo, Japan',
                        countryCode: 'JP',
                        countryLabel: 'Japan',
                        cityLabel: 'Tokyo',
                        imageUri: null,
                        isCurrentTrip: true,
                    },
                ],
            },
            handleOpenHistory,
            handleOpenJourneyEntry,
            handleStartNewTrip,
        });

        const { getByText, queryByText } = render(<TripStatsScreen />);

        expect(getByText('Trip Statistics')).toBeTruthy();
        expect(getByText('Safety snapshot')).toBeTruthy();
        expect(getByText('JOURNAL_RAIL')).toBeTruthy();
        expect(getByText('PASSPORT_TOTALS')).toBeTruthy();
        expect(getByText('Start trip')).toBeTruthy();
        expect(getByText('View history')).toBeTruthy();
        expect(queryByText('Travel Journal Atlas')).toBeNull();
        expect(queryByText('COUNTRY_CHAPTERS')).toBeNull();
        expect(queryByText('JOURNEY_FEED')).toBeNull();

        fireEvent.press(getByText('Start trip'));
        fireEvent.press(getByText('View history'));

        expect(handleOpenHistory).toHaveBeenCalledTimes(1);
        expect(handleOpenJourneyEntry).not.toHaveBeenCalled();
        expect(handleStartNewTrip).toHaveBeenCalledTimes(1);
    });

    test('renders the trip start success banner when a new trip has just started', () => {
        mockedUseTripStatsScreen.mockReturnValue({
            loading: false,
            currentLocation: 'Daegu, South Korea',
            isLocating: false,
            tripStartDate: new Date('2026-04-20T00:00:00.000Z'),
            startFeedbackLocation: 'Daegu, South Korea',
            viewModel: {
                hasActiveTrip: true,
                hero: {
                    scope: 'currentTrip',
                    tripStartDate: new Date('2026-04-20T00:00:00.000Z'),
                    locationLabel: 'Daegu, South Korea',
                    tone: 'safe',
                    analysisCount: 0,
                    safeCount: 0,
                    cautionCount: 0,
                    dangerCount: 0,
                    totalCount: 0,
                    chapterCount: 1,
                    recentJourneyCount: 0,
                },
                passportTotals: {
                    totalAnalyses: 1,
                    safeCount: 1,
                    cautionCount: 0,
                    dangerCount: 0,
                    currentTripCount: 0,
                    currentTripSafeCount: 0,
                    currentTripCautionCount: 0,
                    currentTripDangerCount: 0,
                    countriesVisitedCount: 1,
                    citiesVisitedCount: 1,
                },
                countryChapters: [],
                recentJourneyEntries: [],
            },
            handleOpenHistory: jest.fn(),
            handleOpenJourneyEntry: jest.fn(),
            handleStartNewTrip: jest.fn(),
        });

        const { getByText } = render(<TripStatsScreen />);

        expect(getByText('Trip started!')).toBeTruthy();
        expect(getByText('Now exploring Daegu, South Korea')).toBeTruthy();
    });
});
