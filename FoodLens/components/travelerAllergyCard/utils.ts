import { ALLERGEN_TERMS, ALLERGY_TRANSLATIONS } from '@/services/staticTranslations';
import { TravelerLanguageMode, mapAiLanguageToTravelerCode } from '@/services/travelerCardLanguage';
import { AiTranslation } from './types';

export const isNullAiTranslation = (aiTranslation: AiTranslation, isAiLoaded: boolean) =>
  isAiLoaded && (aiTranslation === null || aiTranslation?.text === null);

export const translateAllergen = (allergen: string, targetCode: string) => {
  const lower = allergen.trim().toLowerCase();
  const titleCase = lower.charAt(0).toUpperCase() + lower.slice(1);
  const dict = ALLERGEN_TERMS[allergen] || ALLERGEN_TERMS[titleCase];
  return dict ? dict[targetCode] || allergen : allergen;
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
