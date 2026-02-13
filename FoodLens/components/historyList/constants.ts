export const HISTORY_FILTERS = ['all', 'ok', 'avoid', 'ask'] as const;

export const toFilterLabel = (filter: string): string => {
  switch (filter) {
    case 'all': return 'All Scans';
    case 'ok': return 'Safe';
    case 'avoid': return 'Avoid';
    case 'ask': return 'Ask';
    default: return filter;
  }
};
