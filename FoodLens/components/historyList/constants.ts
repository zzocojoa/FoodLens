export const HISTORY_FILTERS = ['all', 'ok', 'avoid', 'ask'] as const;

export const toFilterLabel = (
  filter: string,
  t?: (key: string, fallback?: string) => string
): string => {
  switch (filter) {
    case 'all': return t?.('history.filter.allScans', 'All Scans') ?? 'All Scans';
    case 'ok': return t?.('result.safety.ok', 'Safe') ?? 'Safe';
    case 'avoid': return t?.('result.safety.avoid', 'Avoid') ?? 'Avoid';
    case 'ask': return t?.('result.safety.ask', 'Ask') ?? 'Ask';
    default: return filter;
  }
};
