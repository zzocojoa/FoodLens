import type { AnalysisRecord } from '@/services/analysisService';
import { isSameDay } from './homeDashboard';
import { DEFAULT_FALLBACK_LOCALE } from '@/features/i18n/constants';

type TranslationFunction = (key: string, fallback?: string) => string;

type HomeScanStatus = AnalysisRecord['safetyStatus'];

type ScanBadge = {
  label: string;
  backgroundColor: string;
  textColor: string;
};

export const getHomeScanStatusBadge = (
  status: HomeScanStatus,
  t: TranslationFunction
): ScanBadge => {
  switch (status) {
    case 'SAFE':
      return {
        label: t('result.safety.ok', 'OK'),
        backgroundColor: '#DCFCE7',
        textColor: '#15803D',
      };
    case 'DANGER':
      return {
        label: t('result.safety.avoid', 'AVOID'),
        backgroundColor: '#FFE4E6',
        textColor: '#BE123C',
      };
    default:
      return {
        label: t('result.safety.ask', 'ASK'),
        backgroundColor: '#FEF3C7',
        textColor: '#B45309',
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
