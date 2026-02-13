import { useMemo } from 'react';
import { toConfidenceLabel } from '../utils/metaHeader';

export const useResultMetaHeaderModel = (
  confidence?: number,
  t?: (key: string, fallback?: string) => string
) => {
  const confidenceLabel = useMemo(
    () =>
      toConfidenceLabel(
        confidence,
        t?.('result.meta.confidence.matchSuffix', '% MATCH') ?? '% MATCH',
        t?.('common.na', 'N/A') ?? 'N/A'
      ),
    [confidence, t]
  );

  return {
    confidenceLabel,
  };
};
