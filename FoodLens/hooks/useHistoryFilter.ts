import { useState, useCallback } from 'react';
import { CountryData, RegionData } from '../models/History';

export type FilterType = 'all' | 'ok' | 'avoid' | 'ask';

export const useHistoryFilter = () => {
    const [archiveFilter, setArchiveFilter] = useState<FilterType>('all');

    const matchesFilter = useCallback((type: string | undefined) => {
        if (archiveFilter === 'all') return true;
        if (archiveFilter === 'ok') return type === 'ok';
        if (archiveFilter === 'avoid') return type === 'avoid';
        if (archiveFilter === 'ask') return type === 'ask';
        return false;
    }, [archiveFilter]);

    const isAllowedItemType = useCallback((type: string | undefined) => {
        return type === 'ok' || type === 'avoid' || type === 'ask';
    }, []);

    const getFilteredItemsCount = useCallback((country: CountryData) => {
        let count = 0;
        (country.regions || []).forEach(r => {
            const items = r.items || [];
            if (archiveFilter === 'all') {
                count += items.filter(i => isAllowedItemType(i.type)).length;
            } else {
                count += items.filter(i => matchesFilter(i.type)).length;
            }
        });
        return count;
    }, [archiveFilter, matchesFilter, isAllowedItemType]);

    return {
        archiveFilter,
        setArchiveFilter,
        matchesFilter,
        getFilteredItemsCount,
        isAllowedItemType
    };
};
