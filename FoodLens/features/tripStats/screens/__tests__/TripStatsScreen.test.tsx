/// <reference types="jest" />

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TripStatsScreen from '../TripStatsScreen';
import { useTripStatsScreen } from '../../hooks/useTripStatsScreen';
import type { AnalysisRecord } from '@/services/analysis/types';
import { navigateToStoredResult } from '@/services/navigation/resultEntryNavigation';

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

jest.mock('../../components/TripStatsAtlasHero', () => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return function MockTripStatsAtlasHero(props: {
        isLocating: boolean;
        onPressHistory: () => void;
        onPressStartTrip: () => void;
    }) {
        return (
            <View>
                <Text>{props.isLocating ? 'ATLAS_HERO_LOCATING' : 'ATLAS_HERO_READY'}</Text>
                <Pressable onPress={props.onPressStartTrip}>
                    <Text>MOCK_START_TRIP</Text>
                </Pressable>
                <Pressable onPress={props.onPressHistory}>
                    <Text>MOCK_OPEN_HISTORY</Text>
                </Pressable>
            </View>
        );
    };
});

jest.mock('../../components/TripStatsCountryChapters', () => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return function MockTripStatsCountryChapters(props: {
        onPressChapter?: (chapterId: string) => void;
    }) {
        return (
            <View>
                <Text>COUNTRY_CHAPTERS</Text>
                <Pressable onPress={() => props.onPressChapter?.('chapter-1')}>
                    <Text>MOCK_OPEN_CHAPTER</Text>
                </Pressable>
            </View>
        );
    };
});

jest.mock('../../components/TripStatsJourneyFeed', () => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return function MockTripStatsJourneyFeed(props: {
        items: Array<{ id: string }>;
        onPressItem?: (itemId: string) => void;
    }) {
        return (
            <View>
                <Text>JOURNEY_FEED</Text>
                <Pressable onPress={() => props.onPressItem?.(props.items[0]?.id)}>
                    <Text>MOCK_OPEN_JOURNEY</Text>
                </Pressable>
            </View>
        );
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
    const mockedNavigateToStoredResult = navigateToStoredResult as jest.MockedFunction<
        typeof navigateToStoredResult
    >;

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('renders the redesigned atlas sections and wires primary interactions', () => {
        const handleOpenHistory = jest.fn();
        const handleStartNewTrip = jest.fn();
        const clearStartFeedback = jest.fn();
        const recentJourneyRecord: AnalysisRecord = {
            id: 'entry-1',
            foodName: 'Miso Soup',
            ingredients: [],
            safetyStatus: 'SAFE',
            timestamp: new Date('2026-01-11T00:00:00.000Z'),
        };

        mockedUseTripStatsScreen.mockImplementation((handlers) => ({
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
                        record: recentJourneyRecord,
                    },
                ],
            },
            handleOpenHistory,
            handleOpenJourneyEntry: handlers.onOpenJourneyEntry,
            handleStartNewTrip,
            clearStartFeedback,
        }));

        const { getByText, queryByText } = render(<TripStatsScreen />);

        expect(getByText('Trip Statistics')).toBeTruthy();
        expect(getByText('Safety snapshot')).toBeTruthy();
        expect(getByText('JOURNAL_RAIL')).toBeTruthy();
        expect(getByText('ATLAS_HERO_READY')).toBeTruthy();
        expect(getByText('PASSPORT_TOTALS')).toBeTruthy();
        expect(getByText('COUNTRY_CHAPTERS')).toBeTruthy();
        expect(getByText('JOURNEY_FEED')).toBeTruthy();
        expect(queryByText('Start trip')).toBeNull();

        fireEvent.press(getByText('MOCK_START_TRIP'));
        fireEvent.press(getByText('MOCK_OPEN_HISTORY'));
        fireEvent.press(getByText('MOCK_OPEN_CHAPTER'));
        fireEvent.press(getByText('MOCK_OPEN_JOURNEY'));

        expect(handleOpenHistory).toHaveBeenCalledTimes(2);
        expect(handleStartNewTrip).toHaveBeenCalledTimes(1);
        expect(mockedNavigateToStoredResult).toHaveBeenCalledWith(
            expect.any(Object),
            recentJourneyRecord,
            { isBarcode: undefined },
        );
    });

    test('renders the trip start success toast when a new trip has just started', async () => {
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
            clearStartFeedback: jest.fn(),
        });

        const { getByText } = render(<TripStatsScreen />);

        await waitFor(() => {
            expect(getByText('Trip started!')).toBeTruthy();
            expect(getByText('Now exploring Daegu, South Korea')).toBeTruthy();
        });
    });

    test('shows verifying location copy while the trip start is in progress', () => {
        mockedUseTripStatsScreen.mockReturnValue({
            loading: false,
            currentLocation: null,
            isLocating: true,
            tripStartDate: null,
            startFeedbackLocation: null,
            viewModel: {
                hasActiveTrip: false,
                hero: {
                    scope: 'currentTrip',
                    tripStartDate: null,
                    locationLabel: null,
                    tone: 'neutral',
                    analysisCount: 0,
                    safeCount: 0,
                    cautionCount: 0,
                    dangerCount: 0,
                    totalCount: 0,
                    chapterCount: 0,
                    recentJourneyCount: 0,
                },
                passportTotals: {
                    totalAnalyses: 0,
                    safeCount: 0,
                    cautionCount: 0,
                    dangerCount: 0,
                    currentTripCount: 0,
                    currentTripSafeCount: 0,
                    currentTripCautionCount: 0,
                    currentTripDangerCount: 0,
                    countriesVisitedCount: 0,
                    citiesVisitedCount: 0,
                },
                countryChapters: [],
                recentJourneyEntries: [],
            },
            handleOpenHistory: jest.fn(),
            handleOpenJourneyEntry: jest.fn(),
            handleStartNewTrip: jest.fn(),
            clearStartFeedback: jest.fn(),
        });

        const { getByText, queryByText } = render(<TripStatsScreen />);

        expect(getByText('ATLAS_HERO_LOCATING')).toBeTruthy();
        expect(queryByText('Start trip')).toBeNull();
        expect(getByText('MOCK_OPEN_HISTORY')).toBeTruthy();
    });
});
