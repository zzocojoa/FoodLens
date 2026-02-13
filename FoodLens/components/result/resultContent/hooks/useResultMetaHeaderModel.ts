import { useMemo } from 'react';
import { toConfidenceLabel } from '../utils/metaHeader';

export const useResultMetaHeaderModel = (confidence?: number) => {
  const confidenceLabel = useMemo(() => toConfidenceLabel(confidence), [confidence]);

  return {
    confidenceLabel,
  };
};
