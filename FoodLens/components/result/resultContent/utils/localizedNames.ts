import { ResultContentData, ResultIngredient } from '../types';

const isKoreanLocale = (locale?: string) => (locale || '').toLowerCase().startsWith('ko');

export const resolveLocalizedFoodName = (
  result: ResultContentData,
  locale?: string
): string => {
  if (isKoreanLocale(locale)) {
    return result.foodName_ko || result.foodName_en || result.foodName;
  }
  return result.foodName_en || result.foodName || result.foodName_ko || 'Analyzed Food';
};

export const resolveLocalizedIngredientName = (
  ingredient: ResultIngredient,
  locale?: string
): string => {
  if (isKoreanLocale(locale)) {
    return ingredient.name_ko || ingredient.name_en || ingredient.name;
  }
  return ingredient.name_en || ingredient.name || ingredient.name_ko || 'Unknown';
};

export const resolveLocalizedAiTitle = (
  result: ResultContentData,
  locale?: string
): string | undefined => {
  if (isKoreanLocale(locale)) {
    return result.ai_title_ko || result.ai_title_en;
  }
  return result.ai_title_en || result.ai_title_ko;
};
