import { useMemo } from 'react';
import { ResultTheme } from '../types';
import { getAiSummaryCardColors, resolveAiSummaryText } from '../utils/cardPresentation';

export const useAiSummaryCardModel = (
  colorScheme: 'light' | 'dark',
  theme: ResultTheme,
  summary?: string,
  defaultSummary?: string
) => {
  const summaryFallback =
    defaultSummary ??
    'This food appears balanced. Assuming no hidden allergens, it fits well within a moderate diet.';
  const colors = useMemo(
    () => getAiSummaryCardColors(colorScheme, theme),
    [colorScheme, theme]
  );
  const summaryText = useMemo(
    () => resolveAiSummaryText(summary, summaryFallback),
    [summary, summaryFallback]
  );

  return {
    colors,
    summaryText,
  };
};
