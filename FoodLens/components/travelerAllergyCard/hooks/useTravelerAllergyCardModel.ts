import { useTravelerAllergens } from './useTravelerAllergens';
import { buildDisplayData, buildTravelerMessage, isNullAiTranslation } from '../utils';
import { AiTranslation } from '../types';
import { useTravelerCardTargetLanguage } from './useTravelerCardTargetLanguage';
import { resolveTravelerCardCountryCode, resolveTravelerLanguageMode } from '@/services/travelerCardLanguage';

export const useTravelerAllergyCardModel = (
  countryCode: string | null | undefined,
  aiTranslation: AiTranslation
) => {
  const userAllergens = useTravelerAllergens();
  const targetLanguage = useTravelerCardTargetLanguage();

  if (!countryCode && !aiTranslation) return null;

  const isAiLoaded = aiTranslation !== undefined;
  if (isNullAiTranslation(aiTranslation, isAiLoaded)) return null;

  const resolvedCountryCode = resolveTravelerCardCountryCode({
    photoCountryCode: countryCode,
    targetLanguage,
  });
  const languageMode = resolveTravelerLanguageMode(targetLanguage);
  const displayData = buildDisplayData(resolvedCountryCode, aiTranslation, languageMode);
  const finalMessage = buildTravelerMessage(
    displayData.text,
    displayData.usedAiText,
    resolvedCountryCode,
    userAllergens
  );

  return {
    displayData,
    finalMessage,
    isAiLoaded,
  };
};
