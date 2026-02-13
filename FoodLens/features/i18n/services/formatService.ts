const FALLBACK_LOCALE = 'en-US';

const toDate = (value: Date | string | number): Date => {
  if (value instanceof Date) return value;
  return new Date(value);
};

const safeLocale = (locale?: string): string => locale || FALLBACK_LOCALE;

export const formatCalendarDate = (
  value: Date | string | number,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(safeLocale(locale), options).format(date);
};

export const formatDateTime = (
  value: Date | string | number,
  locale?: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(safeLocale(locale), options).format(date);
};

export const formatNumber = (
  value: number,
  locale?: string,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 1 }
): string => {
  return new Intl.NumberFormat(safeLocale(locale), options).format(value);
};

export const formatPercent = (
  value: number,
  locale?: string,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }
): string => {
  return new Intl.NumberFormat(safeLocale(locale), {
    style: 'percent',
    ...options,
  }).format(value / 100);
};

export const formatWeekdayShort = (value: Date | string | number, locale?: string): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(safeLocale(locale), { weekday: 'short' }).format(date);
};

