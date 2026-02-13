export const toConfidenceLabel = (
  confidence?: number,
  matchSuffix: string = '% MATCH',
  naLabel: string = 'N/A'
): string => (typeof confidence === 'number' ? `${confidence}${matchSuffix}` : naLabel);
