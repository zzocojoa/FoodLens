import { getFilteredItemsCount, getStatusMeta } from '../countryCardUtils';
import { CountryData } from '@/models/History';

describe('countryCardUtils', () => {
    const country = {
        country: 'Korea',
        flag: '🇰🇷',
        total: 3,
        coordinates: [0, 0],
        regions: [
            {
                name: 'Seoul',
                items: [
                    { id: '1', name: 'a', type: 'ok', date: '', emoji: '🍚', originalRecord: {} },
                    { id: '2', name: 'b', type: 'avoid', date: '', emoji: '🍜', originalRecord: {} },
                ],
            },
            {
                name: 'Busan',
                items: [{ id: '3', name: 'c', type: 'ask', date: '', emoji: '🐟', originalRecord: {} }],
            },
        ],
    } as unknown as CountryData;

    it('counts all allowed items for all filter', () => {
        const count = getFilteredItemsCount(country, 'all', () => true, () => true);
        expect(count).toBe(3);
    });

    it('counts only matched items for specific filter', () => {
        const count = getFilteredItemsCount(country, 'ok', (type) => type === 'ok', () => true);
        expect(count).toBe(1);
    });

    it('returns status style metadata', () => {
        expect(getStatusMeta('ok').kind).toBe('ok');
        expect(getStatusMeta('avoid').kind).toBe('avoid');
        expect(getStatusMeta('ask').kind).toBe('ask');
    });
});
