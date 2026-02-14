import { AnalysisRecord } from '@/services/analysisService';
import { getOptionalString, resolveLocalizedText } from '@/services/i18n/nameResolver';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const getLocalizedFoodName = (item: AnalysisRecord, locale?: string): string => {
  const raw = isRecord(item.raw_data) ? item.raw_data : null;

  return resolveLocalizedText({
    locale,
    ko: item.foodName_ko || getOptionalString(raw?.['foodName_ko']),
    en: item.foodName_en || getOptionalString(raw?.['foodName_en']),
    fallback: item.foodName || getOptionalString(raw?.['foodName']),
    defaultValue: 'Analyzed Food',
  });
};
