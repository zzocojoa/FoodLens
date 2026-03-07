import { SafeStorage } from '@/services/storage_Logic';
import { NativeModules, Platform } from 'react-native';
import {
  DEFAULT_FALLBACK_LOCALE,
  DEFAULT_LANGUAGE,
  I18N_SETTINGS_KEY,
  LEGACY_TO_CANONICAL_LOCALE,
  SUPPORTED_LOCALES,
} from '../constants';
import { CanonicalLocale, LanguageSettings, ResolvedLocale } from '../types';

const AUTO_LANGUAGE: CanonicalLocale = 'auto';
let lastLocaleDebugSignature: string | null = null;

const emitDeviceLocaleDebugLog = (payload: Record<string, unknown>) => {
  if (!__DEV__) return;
  const signature = JSON.stringify(payload);
  if (signature === lastLocaleDebugSignature) return;
  lastLocaleDebugSignature = signature;
  console.log('[i18n][device-locale]', signature);
};

const getIosPreferredLocale = (): string | null => {
  if (Platform.OS !== 'ios') return null;
  const settingsModule = (NativeModules as any)?.SettingsManager;
  const settings = settingsModule?.settings && typeof settingsModule.settings === 'object'
    ? settingsModule.settings
    : settingsModule;

  if (!settings || typeof settings !== 'object') return null;

  const appleLanguages = settings['AppleLanguages'];
  if (Array.isArray(appleLanguages) && typeof appleLanguages[0] === 'string') {
    const preferred = appleLanguages[0].trim();
    if (preferred.length > 0) return preferred;
  }

  const appleLocale = typeof settings['AppleLocale'] === 'string' ? settings['AppleLocale'] : null;
  if (appleLocale && appleLocale.trim().length > 0) return appleLocale;

  const localeIdentifier = (NativeModules as any)?.I18nManager?.localeIdentifier;
  if (typeof localeIdentifier === 'string' && localeIdentifier.trim().length > 0) {
    return localeIdentifier;
  }

  return null;
};

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

const toResolvedLocaleFromRegion = (value: string): ResolvedLocale | null => {
  const normalized = value.replace(/_/g, '-');
  const parts = normalized.split('-');
  if (parts.length < 2) return null;
  const region = parts[parts.length - 1]?.toUpperCase();
  if (!region) return null;

  if (region === 'KR') return 'ko-KR';
  if (region === 'US') return 'en-US';
  if (region === 'JP') return 'ja-JP';
  if (region === 'CN' || region === 'TW' || region === 'HK') return 'zh-Hans';
  if (region === 'TH') return 'th-TH';
  if (region === 'VN') return 'vi-VN';
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
  const iosPreferred = getIosPreferredLocale();
  const hasJsi = typeof (globalThis as { nativeCallSyncHook?: unknown }).nativeCallSyncHook === 'function';
  const intlLocale = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      return null;
    }
  })();

  if (iosPreferred) {
    const resolvedIosLocale = toResolvedLocale(iosPreferred);
    if (resolvedIosLocale) {
      emitDeviceLocaleDebugLog({
        source: 'iosPreferred',
        platform: Platform.OS,
        hasJsi,
        iosPreferred,
        intlLocale,
        resolved: resolvedIosLocale,
      });
      return resolvedIosLocale;
    }
  }

  if (intlLocale) {
    if (Platform.OS === 'ios' && !hasJsi) {
      const resolvedFromRegion = toResolvedLocaleFromRegion(intlLocale);
      if (resolvedFromRegion) {
        emitDeviceLocaleDebugLog({
          source: 'intl-region-fallback',
          platform: Platform.OS,
          hasJsi,
          iosPreferred,
          intlLocale,
          resolved: resolvedFromRegion,
        });
        return resolvedFromRegion;
      }
    }

    const resolvedIntlLocale = toResolvedLocale(intlLocale);
    if (resolvedIntlLocale) {
      emitDeviceLocaleDebugLog({
        source: 'intl',
        platform: Platform.OS,
        hasJsi,
        iosPreferred,
        intlLocale,
        resolved: resolvedIntlLocale,
      });
      return resolvedIntlLocale;
    }
  }

  emitDeviceLocaleDebugLog({
    source: 'fallback',
    platform: Platform.OS,
    hasJsi,
    iosPreferred,
    intlLocale,
    resolved: DEFAULT_FALLBACK_LOCALE,
  });

  return DEFAULT_FALLBACK_LOCALE;
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
