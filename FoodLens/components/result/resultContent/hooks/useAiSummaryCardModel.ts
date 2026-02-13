import { useMemo } from 'react';
import { ResultTheme } from '../types';
import { getAiSummaryCardColors, resolveAiSummaryText } from '../utils/cardPresentation';

export const useAiSummaryCardModel = (
  colorScheme: 'light' | 'dark',
  theme: ResultTheme,
  summary?: string
) => {
  const colors = useMemo(
    () => getAiSummaryCardColors(colorScheme, theme),
    [colorScheme, theme]
  );
  const summaryText = useMemo(() => resolveAiSummaryText(summary), [summary]);

  return {
    colors,
    summaryText,
  };
};
