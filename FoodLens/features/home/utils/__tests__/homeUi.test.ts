import type { AnalysisRecord } from '@/services/analysisService';

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

    expect(getHomeScanStatusBadge('SAFE', t)).toEqual({
      label: 'localized-ok',
      backgroundColor: '#DCFCE7',
      textColor: '#15803D',
    });
  });

  it('localizes the home scan badge label for danger status', () => {
    const t = createTranslator({
      'result.safety.avoid': 'localized-avoid',
    });

    expect(getHomeScanStatusBadge('DANGER', t)).toEqual({
      label: 'localized-avoid',
      backgroundColor: '#FFE4E6',
      textColor: '#BE123C',
    });
  });

  it('falls back to the ask translation for unsupported statuses', () => {
    const t = createTranslator({
      'result.safety.ask': 'localized-ask',
    });
    const unexpectedStatus = 'UNEXPECTED' as AnalysisRecord['safetyStatus'];

    expect(getHomeScanStatusBadge(unexpectedStatus, t)).toEqual({
      label: 'localized-ask',
      backgroundColor: '#FEF3C7',
      textColor: '#B45309',
    });
  });
});
