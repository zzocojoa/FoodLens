import { FilterType } from '../../hooks/useHistoryFilter';

export const HISTORY_FILTERS: FilterType[] = ['all', 'ok', 'avoid', 'ask'];

export const toFilterLabel = (filter: FilterType): string =>
  filter === 'ask' ? 'ASK' : filter.toUpperCase();
