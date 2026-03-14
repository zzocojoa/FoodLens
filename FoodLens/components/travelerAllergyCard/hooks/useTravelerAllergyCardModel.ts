import { useEffect, useState } from 'react';
import { useTravelerAllergens } from './useTravelerAllergens';
import { buildDisplayData, buildTravelerMessage, isNullAiTranslation } from '../utils';
import { AiTranslation } from '../types';
import { useTravelerCardTargetLanguage } from './useTravelerCardTargetLanguage';
import { useI18nSnapshot } from '@/features/i18n/services/i18nStore';
import { getLocationData } from '@/services/utils';
import {
  resolveTravelerCardCountryCode,
  resolveTravelerLanguageMode,
  resolveTravelerLocaleFallbackCountryCode,
} from '@/services/travelerCardLanguage';

export const useTravelerAllergyCardModel = (
  countryCode: string | null | undefined,
  aiTranslation: AiTranslation
) => {
  const userAllergens = useTravelerAllergens();
  const targetLanguage = useTravelerCardTargetLanguage();
  const { locale } = useI18nSnapshot();
  const [gpsCountryCode, setGpsCountryCode] = useState<string | null>(null);
  const photoCountryCode = countryCode?.trim().toUpperCase() || null;

  useEffect(() => {
    let active = true;
    if (photoCountryCode || resolveTravelerLanguageMode(targetLanguage) === 'manual') {
      setGpsCountryCode(null);
      return () => {
        active = false;
      };
    }

    void getLocationData()
      .then((location) => {
        if (!active) return;
        const nextCountryCode = location?.isoCountryCode?.trim().toUpperCase() || null;
        setGpsCountryCode(nextCountryCode);
      })
      .catch(() => {
        if (!active) return;
        setGpsCountryCode(null);
      });

    return () => {
      active = false;
    };
  }, [photoCountryCode, targetLanguage]);

  const isAiLoaded = aiTranslation !== undefined;
  if (isNullAiTranslation(aiTranslation, isAiLoaded)) return null;

  const resolvedCountryCode = resolveTravelerCardCountryCode({
    photoCountryCode: photoCountryCode || gpsCountryCode,
    targetLanguage,
    fallbackCountryCode: resolveTravelerLocaleFallbackCountryCode(locale),
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
