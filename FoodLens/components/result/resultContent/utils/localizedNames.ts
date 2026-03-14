import { ResultContentData, ResultIngredient } from '../types';
import { resolveLocalizedOptionalText, resolveLocalizedText } from '@/services/i18n/nameResolver';

export const resolveLocalizedFoodName = (
  result: ResultContentData,
  locale?: string
): string => {
  return resolveLocalizedText({
    locale,
    ko: result.foodName_ko,
    en: result.foodName_en,
    fallback: result.foodName,
    defaultValue: 'Analyzed Food',
  });
};

export const resolveLocalizedIngredientName = (
  ingredient: ResultIngredient,
  locale?: string
): string => {
  return resolveLocalizedText({
    locale,
    ko: ingredient.name_ko,
    en: ingredient.name_en,
    fallback: ingredient.name,
    defaultValue: 'Unknown',
  });
};

export const resolveLocalizedSummary = (
  result: ResultContentData,
  locale?: string
): string | undefined => {
  return resolveLocalizedOptionalText({
    locale,
    ko: result.raw_result_ko,
    en: result.raw_result_en,
    fallback: result.raw_result,
  });
};
