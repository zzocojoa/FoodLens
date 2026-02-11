import { CountryData } from '@/models/History';
import { StatusMeta } from '../types';

export const getFilteredItemsCount = (
    country: CountryData,
    filter: string,
    matchesFilter: (type: string | undefined) => boolean,
    isAllowedItemType: (type: string | undefined) => boolean
): number => {
    let count = 0;
    (country.regions || []).forEach((region) => {
        const items = region.items || [];
        if (filter === 'all') {
            count += items.filter((item) => isAllowedItemType(item.type)).length;
        } else {
            count += items.filter((item) => matchesFilter(item.type)).length;
        }
    });
    return count;
};

export const getStatusMeta = (type: string | undefined): StatusMeta => {
    if (type === 'ok') {
        return {
            containerStyle: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
            kind: 'ok',
        };
    }

    if (type === 'avoid') {
        return {
            containerStyle: { backgroundColor: '#FFE4E6', borderColor: '#FECDD3' },
            kind: 'avoid',
        };
    }

    return {
        containerStyle: { backgroundColor: '#FEF9C3', borderColor: '#FDE047' },
        kind: 'ask',
    };
};
