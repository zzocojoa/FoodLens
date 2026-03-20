import { useState, useCallback, useEffect } from 'react';
import { CountryData } from '../models/History';

export type FilterType = 'all' | 'ok' | 'avoid' | 'ask';

export const useHistoryFilter = ({
    initialFilter,
    onFilterChange,
}: {
    initialFilter?: FilterType;
    onFilterChange?: (value: FilterType) => void;
}) => {
    const normalizedInitialFilter = initialFilter || 'all';
    const [archiveFilterState, setArchiveFilterState] = useState<FilterType>(normalizedInitialFilter);

    useEffect(() => {
        setArchiveFilterState((prev) => (prev === normalizedInitialFilter ? prev : normalizedInitialFilter));
    }, [normalizedInitialFilter]);

    const setArchiveFilter = useCallback((value: FilterType) => {
        setArchiveFilterState(value);
        onFilterChange?.(value);
    }, [onFilterChange]);

    const matchesFilter = useCallback((type: string | undefined) => {
        const archiveFilter = archiveFilterState;
        if (archiveFilter === 'all') return true;
        if (archiveFilter === 'ok') return type === 'ok';
        if (archiveFilter === 'avoid') return type === 'avoid';
        if (archiveFilter === 'ask') return type === 'ask';
        return false;
    }, [archiveFilterState]);

    const isAllowedItemType = useCallback((type: string | undefined) => {
        return type === 'ok' || type === 'avoid' || type === 'ask';
    }, []);

    const getFilteredItemsCount = useCallback((country: CountryData) => {
        const archiveFilter = archiveFilterState;
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
    }, [archiveFilterState, matchesFilter, isAllowedItemType]);

    return {
        archiveFilter: archiveFilterState,
        setArchiveFilter,
        matchesFilter,
        getFilteredItemsCount,
        isAllowedItemType
    };
};
