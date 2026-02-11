import {
    buildRegionKey,
    getVisitedPercentage,
    isValidLatitude,
    isValidLongitude,
    toApproxZoom,
} from '../historyMapUtils';

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
});
