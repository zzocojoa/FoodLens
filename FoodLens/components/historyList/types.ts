import { CountryData } from '@/models/History';
import { FilterType } from '@/hooks/useHistoryFilter';

export interface HistoryListProps {
    data: CountryData[];
    loading: boolean;
    refreshing: boolean;
    onRefresh: () => Promise<void>;
    filter: FilterType;
    setFilter: (filter: FilterType) => void;
    matchesFilter: (type: string | undefined) => boolean;
    isAllowedItemType: (type: string | undefined) => boolean;
    expandedCountries: Set<string>;
    onToggleCountry: (id: string) => void;
    isEditMode: boolean;
    selectedItems: Set<string>;
    onToggleItem: (id: string) => void;
    onDelete: (id: string) => void;
    onBulkDelete: (ids: Set<string>) => void;
}
