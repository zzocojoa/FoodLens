export const AUTO_TRAVELER_LANGUAGE = 'auto';
export const DEFAULT_TRAVELER_COUNTRY_CODE = 'US';

const LEGACY_LANGUAGE_CODES = new Set(['GPS', 'KR', 'US', 'JP', 'CN', 'TH', 'VN']);
const CANONICAL_TO_LEGACY: Record<string, string> = {
  'ko-KR': 'KR',
  'en-US': 'US',
  'ja-JP': 'JP',
  'zh-Hans': 'CN',
  'th-TH': 'TH',
  'vi-VN': 'VN',
};
const LEGACY_TO_CANONICAL: Record<string, string> = {
  KR: 'ko-KR',
  US: 'en-US',
  JP: 'ja-JP',
  CN: 'zh-Hans',
  TH: 'th-TH',
  VN: 'vi-VN',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  korean: 'KR',
  english: 'US',
  japanese: 'JP',
  chinese: 'CN',
  thai: 'TH',
  vietnamese: 'VN',
  auto: AUTO_TRAVELER_LANGUAGE,
  gps: AUTO_TRAVELER_LANGUAGE,
};

export type TravelerLanguageMode = 'auto' | 'manual';

export const normalizeTravelerTargetLanguage = (value?: string | null): string | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  if (raw === AUTO_TRAVELER_LANGUAGE || raw === 'GPS') return null;
  if (LEGACY_LANGUAGE_CODES.has(raw)) return raw === 'GPS' ? null : raw;
  if (raw in CANONICAL_TO_LEGACY) return CANONICAL_TO_LEGACY[raw];

  const lower = raw.toLowerCase();
  if (lower in LANGUAGE_ALIASES) {
    const mapped = LANGUAGE_ALIASES[lower];
    return mapped === AUTO_TRAVELER_LANGUAGE ? null : mapped;
  }

  return raw.toUpperCase();
};

export const resolveTravelerCardCountryCode = ({
  photoCountryCode,
  targetLanguage,
  fallbackCountryCode = DEFAULT_TRAVELER_COUNTRY_CODE,
}: {
  photoCountryCode?: string | null;
  targetLanguage?: string | null;
  fallbackCountryCode?: string;
}): string => {
  const manualLanguage = normalizeTravelerTargetLanguage(targetLanguage);
  if (manualLanguage) return manualLanguage;

  const byLocation = (photoCountryCode || '').trim().toUpperCase();
  return byLocation || fallbackCountryCode;
};

export const resolveTravelerLanguageMode = (targetLanguage?: string | null): TravelerLanguageMode =>
  normalizeTravelerTargetLanguage(targetLanguage) ? 'manual' : 'auto';

export const mapAiLanguageToTravelerCode = (aiLanguage?: string | null): string | null => {
  if (!aiLanguage) return null;
  return normalizeTravelerTargetLanguage(aiLanguage) || DEFAULT_TRAVELER_COUNTRY_CODE;
};

export const resolveRequestLocaleFromTravelerTargetLanguage = (
  targetLanguage?: string | null
): string | null => {
  if (!targetLanguage) return null;

  if (targetLanguage in CANONICAL_TO_LEGACY) return targetLanguage;

  const normalized = normalizeTravelerTargetLanguage(targetLanguage);
  if (!normalized) return null;

  return LEGACY_TO_CANONICAL[normalized] || null;
};
