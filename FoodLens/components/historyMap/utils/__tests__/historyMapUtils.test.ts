import {
    flattenMarkers,
    buildRegionKey,
    getVisitedPercentage,
    isValidLatitude,
    isValidLongitude,
    toApproxZoom,
} from '../historyMapUtils';

jest.mock('expo-file-system/legacy', () => ({
    cacheDirectory: '/tmp/',
    documentDirectory: '/tmp/',
    EncodingType: {
        UTF8: 'utf8',
    },
    writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/imageStorage', () => ({
    resolveImageUri: jest.fn((value: string | undefined) => value || null),
}));

describe('historyMapUtils', () => {
    it('validates coordinates', () => {
        expect(isValidLatitude(37.5)).toBe(true);
        expect(isValidLatitude(120)).toBe(false);
        expect(isValidLongitude(127.0)).toBe(true);
        expect(isValidLongitude(-190)).toBe(false);
    });

    it('builds stable region key', () => {
        const key = buildRegionKey({
            latitude: 37.5665,
            longitude: 126.978,
            latitudeDelta: 0.12345,
            longitudeDelta: 0.54321,
        });
        expect(key).toBe('37.566:126.978:0.123:0.543');
    });

    it('computes approximate zoom and visit percentage', () => {
        const zoom = toApproxZoom({
            latitude: 0,
            longitude: 0,
            latitudeDelta: 1,
            longitudeDelta: 0.5,
        });

        expect(zoom).toBeGreaterThan(1);
        expect(getVisitedPercentage(20, 200)).toBe(10);
    });

    it('keeps marker country ids aligned with journal chapter ids', () => {
        const markers = flattenMarkers([
            {
                country: 'Japan',
                flag: '🇯🇵',
                total: 1,
                coordinates: [139.6917, 35.6895],
                regions: [
                    {
                        name: 'Tokyo',
                        items: [
                            {
                                id: 'record-1',
                                name: 'Miso Soup',
                                type: 'ok',
                                timestamp: new Date('2026-04-20T00:00:00.000Z'),
                                emoji: '🍲',
                                originalRecord: {
                                    id: 'record-1',
                                    foodName: 'Miso Soup',
                                    ingredients: [],
                                    safetyStatus: 'SAFE',
                                    timestamp: new Date('2026-04-20T00:00:00.000Z'),
                                    location: {
                                        latitude: 35.6895,
                                        longitude: 139.6917,
                                        country: 'Japan',
                                        city: 'Tokyo',
                                        isoCountryCode: 'JP',
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        ]);

        expect(markers).toHaveLength(1);
        expect(markers[0]?.countryId).toBe('Japan');
    });
});
