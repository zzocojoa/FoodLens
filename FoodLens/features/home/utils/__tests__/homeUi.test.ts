import type { AnalysisRecord } from '@/services/analysisService';

import { homeDashboardColors, homeDashboardDarkColors } from '../../components/homeDashboardTokens';
import { getHomeScanStatusBadge } from '../homeUi';

type TranslationFunction = (key: string, fallback?: string) => string;

const createTranslator = (dictionary: Record<string, string>): TranslationFunction => {
  return (key: string, fallback?: string): string => {
    return dictionary[key] ?? fallback ?? key;
  };
};

describe('homeUi', () => {
  it('localizes the home scan badge label for safe status', () => {
    const t = createTranslator({
      'result.safety.ok': 'localized-ok',
    });

    expect(getHomeScanStatusBadge('SAFE', t, homeDashboardColors)).toEqual({
      label: 'localized-ok',
      backgroundColor: homeDashboardColors.accentGreenSoft,
      textColor: homeDashboardColors.accentGreen,
    });
  });

  it('localizes the home scan badge label for danger status', () => {
    const t = createTranslator({
      'result.safety.avoid': 'localized-avoid',
    });

    expect(getHomeScanStatusBadge('DANGER', t, homeDashboardColors)).toEqual({
      label: 'localized-avoid',
      backgroundColor: homeDashboardColors.accentRedSoft,
      textColor: homeDashboardColors.accentRed,
    });
  });

  it('falls back to the ask translation for unsupported statuses', () => {
    const t = createTranslator({
      'result.safety.ask': 'localized-ask',
    });
    const unexpectedStatus = 'UNEXPECTED' as AnalysisRecord['safetyStatus'];

    expect(getHomeScanStatusBadge(unexpectedStatus, t, homeDashboardColors)).toEqual({
      label: 'localized-ask',
      backgroundColor: homeDashboardColors.accentAmberSoft,
      textColor: homeDashboardColors.accentAmber,
    });
  });

  it('uses the supplied dark dashboard colors for badge tones', () => {
    const t = createTranslator({
      'result.safety.ok': 'localized-ok',
    });

    expect(getHomeScanStatusBadge('SAFE', t, homeDashboardDarkColors)).toEqual({
      label: 'localized-ok',
      backgroundColor: homeDashboardDarkColors.accentGreenSoft,
      textColor: homeDashboardDarkColors.accentGreen,
    });
  });
});
