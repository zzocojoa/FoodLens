import { FilterType } from '../../hooks/useHistoryFilter';
import { CountryData } from '../../models/History';

export interface HistoryListProps {
  data: CountryData[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
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
  onBulkDelete: () => void;
}
