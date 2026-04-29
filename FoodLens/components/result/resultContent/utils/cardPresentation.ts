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

export type AiSummaryCardColors = {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  titleColor: string;
  textColor: string;
};

export const getAiSummaryCardColors = (
  colorScheme: 'light' | 'dark',
  theme: ResultTheme
): AiSummaryCardColors => {
  if (colorScheme === 'dark') {
    return {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      iconColor: theme.primary,
      titleColor: theme.primary,
      textColor: theme.textPrimary,
    };
  }

  return {
    backgroundColor: '#F0F9FF',
    borderColor: '#E0F2FE',
    iconColor: '#0F766E',
    titleColor: '#0F766E',
    textColor: theme.textPrimary,
  };
};

export const resolveAiSummaryText = (
  summary: string | undefined,
  fallbackSummary: string
): string => {
  if (summary === undefined) {
    return fallbackSummary;
  }

  const trimmedSummary = summary.trim();

  if (trimmedSummary.length === 0) {
    return fallbackSummary;
  }

  return trimmedSummary;
};
