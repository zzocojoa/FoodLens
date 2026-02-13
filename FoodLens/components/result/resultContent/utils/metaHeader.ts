export const toConfidenceLabel = (confidence?: number): string =>
  typeof confidence === 'number' ? `${confidence}% MATCH` : 'N/A';
