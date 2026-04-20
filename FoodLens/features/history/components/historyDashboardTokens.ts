import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardShadows,
  homeDashboardSpacing,
  homeDashboardTypography,
} from '../../home/components/homeDashboardTokens';

export type HistoryDashboardTone = 'accent' | 'caution' | 'danger' | 'neutral' | 'safe';

export const historyDashboardColors = homeDashboardColors;

export const historyDashboardSpacing = {
  ...homeDashboardSpacing,
  lg: 18,
  md: 14,
  sm: 10,
  xxl: 30,
  xxxl: 36,
} as const;

export const historyDashboardRadii = homeDashboardRadii;

export const historyDashboardTypography = homeDashboardTypography;

export const historyDashboardShadows = homeDashboardShadows;

export const historyDashboardSectionSpacing = {
  compactStack: historyDashboardSpacing.sm,
  pageTop: historyDashboardSpacing.sm,
  redlineInset: historyDashboardSpacing.lg,
  sectionInset: historyDashboardSpacing.lg,
  sectionStack: historyDashboardSpacing.md,
} as const;

export const historyDashboardRedline = {
  color: homeDashboardColors.lineStrong,
  height: 1,
  opacity: 0.72,
} as const;

export const historyDashboardToneTokens: Record<
  HistoryDashboardTone,
  {
    backgroundColor: string;
    borderColor: string;
    textColor: string;
  }
> = {
  accent: {
    backgroundColor: homeDashboardColors.pearlMist,
    borderColor: homeDashboardColors.lineStrong,
    textColor: homeDashboardColors.accentBlue,
  },
  caution: {
    backgroundColor: homeDashboardColors.accentAmberSoft,
    borderColor: homeDashboardColors.accentAmber,
    textColor: homeDashboardColors.accentAmber,
  },
  danger: {
    backgroundColor: homeDashboardColors.accentRedSoft,
    borderColor: homeDashboardColors.accentRed,
    textColor: homeDashboardColors.accentRed,
  },
  neutral: {
    backgroundColor: homeDashboardColors.surfaceMuted,
    borderColor: homeDashboardColors.line,
    textColor: homeDashboardColors.inkSoft,
  },
  safe: {
    backgroundColor: homeDashboardColors.accentGreenSoft,
    borderColor: homeDashboardColors.accentGreen,
    textColor: homeDashboardColors.accentGreen,
  },
};
