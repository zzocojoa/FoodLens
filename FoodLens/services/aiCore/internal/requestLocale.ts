import {
  getDeviceLocale,
  loadLanguageSettings,
  resolveEffectiveLocale,
} from '@/features/i18n/services/languageService_Logic';
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

const toIsoCountryCodeFromLocale = (locale: string): string => {
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith('ko')) return 'KR';
  if (normalized.startsWith('ja')) return 'JP';
  if (normalized.startsWith('zh')) return 'CN';
  if (normalized.startsWith('th')) return 'TH';
  if (normalized.startsWith('vi')) return 'VN';
  return 'US';
};

export const resolveRequestIsoCountryCode = async (): Promise<string> => {
  const locale = await resolveRequestLocale();
  return toIsoCountryCodeFromLocale(locale);
};
