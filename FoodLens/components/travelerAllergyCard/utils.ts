import { ALLERGEN_TERMS, ALLERGY_TRANSLATIONS } from '@/services/staticTranslations';
import { TravelerLanguageMode, mapAiLanguageToTravelerCode } from '@/services/travelerCardLanguage';
import { getRestrictionDefaultLabel } from '@/features/profile/utils/profileSuggestions';
import {
  SEARCHABLE_INGREDIENTS,
  getIngredientI18nKey,
  type SearchableIngredient,
} from '@/data/ingredients';
import { TRANSLATIONS } from '@/features/i18n/constants';
import type { ResolvedLocale } from '@/features/i18n/types';
import { AiTranslation } from './types';

export const isNullAiTranslation = (aiTranslation: AiTranslation, isAiLoaded: boolean) =>
  isAiLoaded && (aiTranslation === null || aiTranslation?.text === null);

const getAllergenDefaultDisplayLabel = (allergen: string): string => {
  return getRestrictionDefaultLabel(allergen);
};

const INGREDIENT_TRANSLATION_LOCALE_BY_COUNTRY_CODE: Readonly<Record<string, ResolvedLocale>> = {
  KR: 'ko-KR',
  US: 'en-US',
  GB: 'en-US',
  AU: 'en-US',
  CA: 'en-US',
  JP: 'ja-JP',
  CN: 'zh-Hans',
  TW: 'zh-Hans',
  TH: 'th-TH',
  VN: 'vi-VN',
  DEFAULT: 'en-US',
};

const normalizeTargetCountryCode = (value: string): string => value.trim().toUpperCase() || 'DEFAULT';

const normalizeIngredientMatchValue = (value: string): string => value.trim().toLowerCase();

const findIngredientByAllergenValue = (
  allergen: string,
  defaultLabel: string
): SearchableIngredient | null => {
  const candidates = [
    normalizeIngredientMatchValue(allergen),
    normalizeIngredientMatchValue(defaultLabel),
  ].filter((value) => value.length > 0);

  return SEARCHABLE_INGREDIENTS.find((ingredient) => {
    const ingredientValues = [
      ingredient.key,
      ingredient.defaultLabel,
      ...ingredient.aliases,
    ].map(normalizeIngredientMatchValue);

    return candidates.some((candidate) => ingredientValues.includes(candidate));
  }) ?? null;
};

const translateAllergenFromIngredientResource = (
  allergen: string,
  defaultLabel: string,
  targetCode: string
): string | null => {
  const locale = INGREDIENT_TRANSLATION_LOCALE_BY_COUNTRY_CODE[normalizeTargetCountryCode(targetCode)];
  if (!locale) return null;

  const ingredient = findIngredientByAllergenValue(allergen, defaultLabel);
  if (!ingredient) return null;

  const dictionary = TRANSLATIONS[locale];
  const translated = dictionary[getIngredientI18nKey(ingredient.key)];
  if (typeof translated !== 'string' || translated.length === 0) return null;

  return translated;
};

export const translateAllergen = (allergen: string, targetCode: string) => {
  const normalizedTargetCode = normalizeTargetCountryCode(targetCode);
  const defaultLabel = getAllergenDefaultDisplayLabel(allergen);
  const lower = defaultLabel.trim().toLowerCase();
  const titleCase = lower.charAt(0).toUpperCase() + lower.slice(1);
  const dict = ALLERGEN_TERMS[defaultLabel] || ALLERGEN_TERMS[titleCase];
  const staticTranslation = dict ? dict[normalizedTargetCode] : undefined;
  if (staticTranslation) return staticTranslation;

  return translateAllergenFromIngredientResource(allergen, defaultLabel, normalizedTargetCode) ?? defaultLabel;
};

export const buildDisplayData = (
  countryCode: string,
  aiTranslation: AiTranslation,
  languageMode: TravelerLanguageMode
) => {
  const code = countryCode || 'DEFAULT';
  const staticData = ALLERGY_TRANSLATIONS[code] || ALLERGY_TRANSLATIONS['DEFAULT'];
  const isAiLoaded = aiTranslation !== undefined;
  const aiLanguageCode = mapAiLanguageToTravelerCode(aiTranslation?.language);
  const hasAiContent = isAiLoaded && !!aiTranslation && (!!aiTranslation?.text) && (
    !aiLanguageCode || aiLanguageCode === code
  );

  if (hasAiContent) {
    return {
      language: aiTranslation.language,
      text: aiTranslation.text || staticData.text,
      sub: languageMode === 'manual'
        ? 'Traveler Safety Card (Manual Language)'
        : 'Traveler Safety Card (Photo Location)',
      isAiLoaded,
      usedAiText: true,
    };
  }

    return {
      language: staticData.language,
      text: staticData.text,
      sub: languageMode === 'manual'
        ? 'Traveler Safety Card (Manual Language)'
        : 'Traveler Safety Card (Photo Location)',
      isAiLoaded,
      usedAiText: false,
    };
};

export const buildTravelerMessage = (
  baseText: string,
  usedAiText: boolean,
  countryCode: string,
  userAllergens: string[]
): string => {
  if (usedAiText || userAllergens.length === 0) return baseText;
  const targetCode = countryCode || 'US';
  const translatedList = userAllergens.map((allergen) => translateAllergen(allergen, targetCode));
  return `${baseText}\n\n⚠️ My Allergies:\n${translatedList.join(', ')}`;
};
