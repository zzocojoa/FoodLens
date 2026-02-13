import {
  getDeviceLocale,
  loadLanguageSettings,
  resolveEffectiveLocale,
} from '@/features/i18n/services/languageService';
import { DEFAULT_FALLBACK_LOCALE } from '@/features/i18n/constants';

export const resolveRequestLocale = async (): Promise<string> => {
  try {
    const settings = await loadLanguageSettings();
    return resolveEffectiveLocale(settings);
  } catch (error) {
    console.warn('[AI] Failed to resolve request locale, using fallback locale.', error);
    return getDeviceLocale() || DEFAULT_FALLBACK_LOCALE;
  }
};
