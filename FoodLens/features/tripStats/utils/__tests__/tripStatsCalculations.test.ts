import {
    buildLocationLabel,
    buildTripStatsScreenViewModel,
    countSafeAnalysesFromStart,
    countSafeAnalysesTotal,
} from '../tripStatsCalculations';
import { UserProfile } from '@/models/User';
import { AnalysisRecord } from '@/services/analysis/types';

const buildAnalysisRecord = (
    input: {
        id: string;
        foodName: string;
        location?: AnalysisRecord['location'];
        safetyStatus: AnalysisRecord['safetyStatus'];
        timestamp: string;
    },
): AnalysisRecord => {
    return {
        id: input.id,
        foodName: input.foodName,
        ingredients: [],
        safetyStatus: input.safetyStatus,
        timestamp: new Date(input.timestamp),
        location: input.location,
    };
};

const buildUserProfile = (
    input: {
        currentTripLocation?: string;
        currentTripStart?: string;
    },
): UserProfile => {
    return {
        uid: 'user-1',
        email: 'traveler@example.com',
        safetyProfile: {
            allergies: [],
            dietaryRestrictions: [],
        },
        settings: {
            language: 'en-US',
            autoPlayAudio: false,
            clientState: {},
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...input,
    };
};

describe('tripStatsCalculations', () => {
    it('counts safe analyses from trip start', () => {
        const analyses = [
            { timestamp: '2026-01-01T00:00:00.000Z', safetyStatus: 'SAFE' },
            { timestamp: '2026-01-03T00:00:00.000Z', safetyStatus: 'UNSAFE' },
            { timestamp: '2026-01-04T00:00:00.000Z', safetyStatus: 'SAFE' },
        ];

        const start = new Date('2026-01-02T00:00:00.000Z').getTime();
        expect(countSafeAnalysesFromStart(analyses, start)).toBe(1);
    });

    it('counts total safe analyses', () => {
        const analyses = [
            { safetyStatus: 'SAFE' },
            { safetyStatus: 'UNSAFE' },
            { safetyStatus: 'SAFE' },
        ];

        expect(countSafeAnalysesTotal(analyses)).toBe(2);
    });

    it('builds location label from city/country', () => {
        const result = buildLocationLabel({ city: 'Seoul', country: 'KR' }, 'fallback');
        expect(result).toBe('Seoul, KR');
    });

    it('falls back when place is missing', () => {
        expect(buildLocationLabel(null, 'Lat: 1.00, Lon: 2.00')).toBe('Lat: 1.00, Lon: 2.00');
    });

    it('builds a current-trip view model with grouped country chapters', () => {
        const user = buildUserProfile({
            currentTripStart: '2026-01-10T00:00:00.000Z',
            currentTripLocation: 'Tokyo, Japan',
        });
        const analyses = [
            buildAnalysisRecord({
                id: 'a-1',
                foodName: 'Miso Soup',
                safetyStatus: 'SAFE',
                timestamp: '2026-01-11T09:00:00.000Z',
                location: {
                    latitude: 35.6764,
                    longitude: 139.65,
                    city: 'Tokyo',
                    country: 'Japan',
                    isoCountryCode: 'JP',
                },
            }),
            buildAnalysisRecord({
                id: 'a-2',
                foodName: 'Curry',
                safetyStatus: 'CAUTION',
                timestamp: '2026-01-12T09:00:00.000Z',
                location: {
                    latitude: 35.6764,
                    longitude: 139.65,
                    city: 'Tokyo',
                    country: 'Japan',
                    isoCountryCode: 'JP',
                },
            }),
            buildAnalysisRecord({
                id: 'a-3',
                foodName: 'Bun',
                safetyStatus: 'DANGER',
                timestamp: '2026-01-05T09:00:00.000Z',
                location: {
                    latitude: 37.5665,
                    longitude: 126.978,
                    city: 'Seoul',
                    country: 'South Korea',
                    isoCountryCode: 'KR',
                },
            }),
        ];

        const viewModel = buildTripStatsScreenViewModel(user, analyses);

        expect(viewModel.hasActiveTrip).toBe(true);
        expect(viewModel.hero.scope).toBe('currentTrip');
        expect(viewModel.hero.analysisCount).toBe(2);
        expect(viewModel.passportTotals.countriesVisitedCount).toBe(2);
        expect(viewModel.passportTotals.citiesVisitedCount).toBe(2);
        expect(viewModel.countryChapters[0]?.countryCode).toBe('JP');
        expect(viewModel.countryChapters[0]?.currentTripCount).toBe(2);
        expect(viewModel.recentJourneyEntries).toHaveLength(3);
    });

    it('builds an all-time hero when there is no active trip', () => {
        const user = buildUserProfile({});
        const analyses = [
            buildAnalysisRecord({
                id: 'a-1',
                foodName: 'Pad Thai',
                safetyStatus: 'SAFE',
                timestamp: '2026-01-11T09:00:00.000Z',
                location: {
                    latitude: 13.7563,
                    longitude: 100.5018,
                    city: 'Bangkok',
                    country: 'Thailand',
                    isoCountryCode: 'TH',
                },
            }),
        ];

        const viewModel = buildTripStatsScreenViewModel(user, analyses);

        expect(viewModel.hasActiveTrip).toBe(false);
        expect(viewModel.hero.scope).toBe('allTime');
        expect(viewModel.hero.tone).toBe('safe');
        expect(viewModel.hero.chapterCount).toBe(1);
    });
});
