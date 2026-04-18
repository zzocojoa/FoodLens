import { CanonicalLocale } from '@/features/i18n';
import { normalizeTravelerTargetLanguage } from '@/services/travelerCardLanguage';
import { LanguageOption } from '../types';

type ResolveLanguageLabelParams = {
  language: string | undefined;
  fallbackLabel: string;
  options: LanguageOption[];
};

type ResolveUiLanguageLabelParams = {
  language: string | undefined;
  fallbackLabel: string;
  options: LanguageOption[];
};

const findOptionLabel = (code: string, options: LanguageOption[]): string | null => {
  const matchedOption = options.find((option) => option.code === code);
  return matchedOption?.label ?? null;
};

export const toLanguageLabel = ({
  language,
  fallbackLabel,
  options,
}: ResolveLanguageLabelParams): string => {
  if (!language) {
    return fallbackLabel;
  }

  const normalized = normalizeTravelerTargetLanguage(language);
  if (!normalized) {
    return fallbackLabel;
  }

  const directLabel = findOptionLabel(language, options);
  if (directLabel) {
    return directLabel;
  }

  const normalizedLabel =
    options.find((option) => normalizeTravelerTargetLanguage(option.code) === normalized)?.label ?? null;

  return normalizedLabel ?? fallbackLabel;
};

export const toTargetLanguage = (code: string): string | undefined =>
  code === 'auto' ? undefined : code;

export const toUiLanguageLabel = ({
  language,
  fallbackLabel,
  options,
}: ResolveUiLanguageLabelParams): string => {
  const resolved = (language || 'auto') as CanonicalLocale;
  return findOptionLabel(resolved, options) ?? fallbackLabel;
};
