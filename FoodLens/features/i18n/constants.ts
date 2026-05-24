import { CanonicalLocale, ResolvedLocale, TranslationDictionary } from './types';
const enResource = require('./resources/en.json') as TranslationDictionary;
const koResource = require('./resources/ko.json') as TranslationDictionary;
const jaResource = require('./resources/ja-JP.json') as TranslationDictionary;
const zhHansResource = require('./resources/zh-Hans.json') as TranslationDictionary;

export const I18N_SETTINGS_KEY = 'foodlens_i18n_settings_v1';

export const DEFAULT_LANGUAGE: CanonicalLocale = 'auto';
export const DEFAULT_FALLBACK_LOCALE: ResolvedLocale = 'en-US';

export const SUPPORTED_LOCALES: ResolvedLocale[] = [
  'ko-KR',
  'en-US',
  'ja-JP',
  'zh-Hans',
  'th-TH',
  'vi-VN',
  'fr-FR',
];

export const LEGACY_TO_CANONICAL_LOCALE: Record<string, CanonicalLocale> = {
  GPS: 'auto',
  KR: 'ko-KR',
  US: 'en-US',
  JP: 'ja-JP',
  CN: 'zh-Hans',
  TH: 'th-TH',
  VN: 'vi-VN',
  FR: 'fr-FR',
};

export const LANGUAGE_LABELS: Record<CanonicalLocale, string> = {
  auto: 'Auto (Device)',
  'ko-KR': 'Korean',
  'en-US': 'English',
  'ja-JP': 'Japanese',
  'zh-Hans': 'Chinese (Simplified)',
  'th-TH': 'Thai',
  'vi-VN': 'Vietnamese',
  'fr-FR': 'French',
};

export const TRANSLATIONS: Record<ResolvedLocale, TranslationDictionary> = {
  'en-US': enResource,
  'ko-KR': koResource,
  'ja-JP': jaResource,
  'zh-Hans': zhHansResource,
  'th-TH': enResource,
  'vi-VN': enResource,
  'fr-FR': enResource,
};
