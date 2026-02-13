import { LANGUAGE_OPTIONS } from '../constants';
import { normalizeTravelerTargetLanguage } from '@/services/travelerCardLanguage';
import { CanonicalLocale } from '@/features/i18n';
import { UI_LANGUAGE_OPTIONS } from '../constants';

export const toLanguageLabel = (language: string | undefined): string => {
  if (!language) return 'Auto (Photo/GPS)';
  const normalized = normalizeTravelerTargetLanguage(language);

  if (!normalized) {
    return 'Auto (Photo/GPS)';
  }

  return LANGUAGE_OPTIONS.find((option) => option.code === language)?.label ||
    LANGUAGE_OPTIONS.find((option) => normalizeTravelerTargetLanguage(option.code) === normalized)?.label ||
    'Auto (Photo/GPS)';
};

export const toTargetLanguage = (code: string): string | undefined =>
  code === 'auto' ? undefined : code;

export const toUiLanguageLabel = (language: string | undefined): string => {
  const resolved = (language || 'auto') as CanonicalLocale;
  return UI_LANGUAGE_OPTIONS.find((option) => option.code === resolved)?.label || 'Auto (Device)';
};
