import type { AnalysisRecord } from '@/services/analysisService';
import { isSameDay } from './homeDashboard';
import { DEFAULT_FALLBACK_LOCALE } from '@/features/i18n/constants';
import type { HomeDashboardColors } from '../components/homeDashboardTokens';

type TranslationFunction = (key: string, fallback?: string) => string;

type HomeScanStatus = AnalysisRecord['safetyStatus'];

type ScanBadge = {
  label: string;
  backgroundColor: string;
  textColor: string;
};

export const getHomeScanStatusBadge = (
  status: HomeScanStatus,
  t: TranslationFunction,
  colors: HomeDashboardColors
): ScanBadge => {
  switch (status) {
    case 'SAFE':
      return {
        label: t('result.safety.ok', 'OK'),
        backgroundColor: colors.accentGreenSoft,
        textColor: colors.accentGreen,
      };
    case 'DANGER':
      return {
        label: t('result.safety.avoid', 'AVOID'),
        backgroundColor: colors.accentRedSoft,
        textColor: colors.accentRed,
      };
    default:
      return {
        label: t('result.safety.ask', 'ASK'),
        backgroundColor: colors.accentAmberSoft,
        textColor: colors.accentAmber,
      };
  }
};

export const formatHomeSectionTitle = (
  selectedDate: Date,
  t: TranslationFunction,
  locale: string
): string => {
  if (isSameDay(selectedDate, new Date())) return t('home.scans.recentTitle', 'Recent Scans');
  return t('home.scans.onDateTemplate', 'Scans on {date}').replace(
    '{date}',
    new Intl.DateTimeFormat(locale || DEFAULT_FALLBACK_LOCALE, { month: 'short', day: 'numeric' }).format(
      selectedDate
    )
  );
};
