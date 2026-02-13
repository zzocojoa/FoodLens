const UNKNOWN_DATE = 'Unknown date';
const MINUTES_IN_HOUR = 60;
const HOURS_IN_DAY = 24;
const MS_IN_MINUTE = 60_000;
const EXIF_DATE_PATTERN = /(\d{4})[:/\-](\d{2})[:/\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

const isValidDate = (value: Date): boolean => !isNaN(value.getTime());
const nowIso = (): string => new Date().toISOString();

/**
 * Formats dates into user-friendly strings (e.g., "Just now", "5m ago").
 */
export const formatDate = (date: Date, localeOverride?: string): string => {
  if (!(date instanceof Date) || !isValidDate(date)) return UNKNOWN_DATE;

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / MS_IN_MINUTE);

  const locale = localeOverride || Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  const relativeFormatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (mins < 1) return relativeFormatter.format(0, 'minute');
  if (mins < MINUTES_IN_HOUR) return relativeFormatter.format(-mins, 'minute');

  const hours = Math.floor(mins / MINUTES_IN_HOUR);
  if (hours < HOURS_IN_DAY) return relativeFormatter.format(-hours, 'hour');

  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
};

/**
 * Normalizes various date string formats (especially EXIF) to ISO 8601.
 */
export const normalizeTimestamp = (dateString?: string | null): string => {
  if (!dateString) return nowIso();

  const cleanTs = dateString.trim();

  if (cleanTs.includes('-') && cleanTs.includes('T')) {
    const parsed = new Date(cleanTs);
    if (isValidDate(parsed)) return parsed.toISOString();
  }

  const digits = cleanTs.match(EXIF_DATE_PATTERN);

  if (digits && digits.length >= 7) {
    const isoLike = `${digits[1]}-${digits[2]}-${digits[3]}T${digits[4]}:${digits[5]}:${digits[6]}`;
    const parsed = new Date(isoLike);
    if (isValidDate(parsed)) return parsed.toISOString();
  }

  const fallbackParse = new Date(cleanTs);
  if (isValidDate(fallbackParse)) return fallbackParse.toISOString();

  console.warn('normalizeTimestamp: failed to parse', dateString);
  return nowIso();
};
