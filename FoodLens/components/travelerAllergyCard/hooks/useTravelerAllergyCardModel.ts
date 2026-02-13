import { useTravelerAllergens } from './useTravelerAllergens';
import { buildDisplayData, buildTravelerMessage, isNullAiTranslation } from '../utils';
import { AiTranslation } from '../types';

export const useTravelerAllergyCardModel = (
  countryCode: string | null | undefined,
  aiTranslation: AiTranslation
) => {
  const userAllergens = useTravelerAllergens();

  if (!countryCode && !aiTranslation) return null;

  const isAiLoaded = aiTranslation !== undefined;
  if (isNullAiTranslation(aiTranslation, isAiLoaded)) return null;

  const displayData = buildDisplayData(countryCode, aiTranslation);
  const finalMessage = buildTravelerMessage(displayData.text, aiTranslation, countryCode, userAllergens);

  return {
    displayData,
    finalMessage,
    isAiLoaded,
  };
};
