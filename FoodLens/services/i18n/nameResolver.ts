export const isKoreanLocale = (locale?: string): boolean =>
  (locale || '').toLowerCase().startsWith('ko');

export const getOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

type LocalizedTextParams = {
  locale?: string;
  ko?: string | null;
  en?: string | null;
  fallback?: string | null;
  defaultValue: string;
};

type OptionalLocalizedTextParams = Omit<LocalizedTextParams, 'defaultValue'>;

export const resolveLocalizedText = ({
  locale,
  ko,
  en,
  fallback,
  defaultValue,
}: LocalizedTextParams): string => {
  if (isKoreanLocale(locale)) {
    return ko || en || fallback || defaultValue;
  }
  return en || fallback || ko || defaultValue;
};

export const resolveLocalizedOptionalText = ({
  locale,
  ko,
  en,
  fallback,
}: OptionalLocalizedTextParams): string | undefined => {
  if (isKoreanLocale(locale)) {
    return ko || en || fallback || undefined;
  }
  return en || fallback || ko || undefined;
};
