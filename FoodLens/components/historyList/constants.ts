import { FilterType } from '../../hooks/useHistoryFilter';

export const HISTORY_FILTERS: FilterType[] = ['all', 'ok', 'avoid', 'ask'];

export const toFilterLabel = (filter: FilterType): string =>
  filter === 'ask' ? 'ASK' : filter.toUpperCase();

export const FLOATING_DELETE_COLOR = '#EF4444';
export const FLOATING_BAR_HEIGHT = 120;
export const FLOATING_BAR_BOTTOM_PADDING = 40;
