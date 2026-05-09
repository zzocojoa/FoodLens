export type CanonicalLocale =
  | 'auto'
  | 'ko-KR'
  | 'en-US'
  | 'ja-JP'
  | 'zh-Hans'
  | 'th-TH'
  | 'vi-VN'
  | 'fr-FR';

export type ResolvedLocale = Exclude<CanonicalLocale, 'auto'>;

export type LanguageSettings = {
  language: CanonicalLocale;
  targetLanguage: ResolvedLocale | null;
};

export type TranslationDictionary = Record<string, string>;

export type I18nState = {
  settings: LanguageSettings;
  locale: ResolvedLocale;
  ready: boolean;
};
