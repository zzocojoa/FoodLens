import { LANGUAGE_OPTIONS } from '../constants';

export const toLanguageLabel = (language: string | undefined): string => {
  if (!language) return 'Auto (GPS)';
  return LANGUAGE_OPTIONS.find((option) => option.code === language)?.label || 'Auto (GPS)';
};

export const toTargetLanguage = (code: string): string | undefined =>
  code === 'GPS' ? undefined : code;
