import { ResultTheme } from '../types';

export const getAllergyAlertCardColors = (colorScheme: 'light' | 'dark') => {
  if (colorScheme === 'dark') {
    return {
      container: {
        backgroundColor: 'rgba(225, 29, 72, 0.15)',
        borderColor: 'rgba(225, 29, 72, 0.3)',
      },
      titleColor: '#FDA4AF',
      descColor: '#FECDD3',
    };
  }

  return {
    container: undefined,
    titleColor: undefined,
    descColor: undefined,
  };
};

export const getAiSummaryCardColors = (colorScheme: 'light' | 'dark', theme: ResultTheme) => ({
  backgroundColor: colorScheme === 'dark' ? theme.surface : '#F0F9FF',
  borderColor: colorScheme === 'dark' ? theme.border : '#E0F2FE',
});

export const resolveAiSummaryText = (summary?: string): string =>
  summary || 'This food appears balanced. Assuming no hidden allergens, it fits well within a moderate diet.';
