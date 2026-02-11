import {
    buildLocationLabel,
    countSafeAnalysesFromStart,
    countSafeAnalysesTotal,
} from '../tripStatsCalculations';

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
});
