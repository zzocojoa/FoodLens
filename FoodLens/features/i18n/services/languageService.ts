import { SafeStorage } from '@/services/storage';
import {
  DEFAULT_FALLBACK_LOCALE,
  DEFAULT_LANGUAGE,
  I18N_SETTINGS_KEY,
  LEGACY_TO_CANONICAL_LOCALE,
  SUPPORTED_LOCALES,
} from '../constants';
import { CanonicalLocale, LanguageSettings, ResolvedLocale } from '../types';

const AUTO_LANGUAGE: CanonicalLocale = 'auto';

const toResolvedLocale = (value: string): ResolvedLocale | null => {
  const normalized = value.toLowerCase();

  if (normalized.startsWith('ko')) return 'ko-KR';
  if (normalized.startsWith('en')) return 'en-US';
  if (normalized.startsWith('ja')) return 'ja-JP';
  if (normalized.startsWith('zh')) return 'zh-Hans';
  if (normalized.startsWith('th')) return 'th-TH';
  if (normalized.startsWith('vi')) return 'vi-VN';

  return null;
};

export const normalizeCanonicalLocale = (value: string | null | undefined): CanonicalLocale => {
  if (!value) return DEFAULT_LANGUAGE;

  if (value in LEGACY_TO_CANONICAL_LOCALE) {
    return LEGACY_TO_CANONICAL_LOCALE[value];
  }

  if (value === AUTO_LANGUAGE) return AUTO_LANGUAGE;

  const resolved = toResolvedLocale(value);
  if (!resolved) return DEFAULT_LANGUAGE;
  return resolved;
};

export const normalizeLanguageSettings = (
  raw: Partial<LanguageSettings> | null | undefined
): LanguageSettings => {
  const canonicalLanguage = normalizeCanonicalLocale(raw?.language);
  const canonicalTarget = normalizeCanonicalLocale(raw?.targetLanguage);

  if (canonicalLanguage === AUTO_LANGUAGE) {
    return {
      language: AUTO_LANGUAGE,
      targetLanguage: canonicalTarget === AUTO_LANGUAGE ? null : canonicalTarget,
    };
  }

  return {
    language: canonicalLanguage,
    targetLanguage: canonicalTarget === AUTO_LANGUAGE ? canonicalLanguage : canonicalTarget,
  };
};

export const getDeviceLocale = (): ResolvedLocale => {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return toResolvedLocale(locale) || DEFAULT_FALLBACK_LOCALE;
};

export const resolveEffectiveLocale = (settings: LanguageSettings): ResolvedLocale => {
  if (settings.language === AUTO_LANGUAGE) {
    return getDeviceLocale();
  }
  if (SUPPORTED_LOCALES.includes(settings.language as ResolvedLocale)) {
    return settings.language as ResolvedLocale;
  }
  return DEFAULT_FALLBACK_LOCALE;
};

export const loadLanguageSettings = async (): Promise<LanguageSettings> => {
  const raw = await SafeStorage.get<Partial<LanguageSettings> | null>(I18N_SETTINGS_KEY, null);
  return normalizeLanguageSettings(raw);
};

export const saveLanguageSettings = async (settings: LanguageSettings): Promise<void> => {
  await SafeStorage.set<LanguageSettings>(I18N_SETTINGS_KEY, normalizeLanguageSettings(settings));
};
