import { AnalysisRecord } from '@/services/analysisService';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getOptionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export const getLocalizedFoodName = (item: AnalysisRecord, locale?: string): string => {
  const raw = isRecord(item.raw_data) ? item.raw_data : null;

  const foodNameKo = item.foodName_ko || getOptionalString(raw?.['foodName_ko']) || null;
  const foodNameEn = item.foodName_en || getOptionalString(raw?.['foodName_en']) || null;
  const fallback = item.foodName || getOptionalString(raw?.['foodName']) || 'Analyzed Food';

  if ((locale || '').toLowerCase().startsWith('ko')) {
    return foodNameKo || foodNameEn || fallback;
  }

  return foodNameEn || fallback || foodNameKo || 'Analyzed Food';
};
