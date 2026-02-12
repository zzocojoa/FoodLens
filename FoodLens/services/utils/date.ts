/**
 * Formats dates into user-friendly strings (e.g., "Just now", "5m ago").
 */
export const formatDate = (date: Date): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'Unknown date';

  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  return date.toLocaleDateString();
};

/**
 * Normalizes various date string formats (especially EXIF) to ISO 8601.
 */
export const normalizeTimestamp = (dateString?: string | null): string => {
  if (!dateString) return new Date().toISOString();

  const cleanTs = dateString.trim();

  if (cleanTs.includes('-') && cleanTs.includes('T')) {
    const parsed = new Date(cleanTs);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const digits = cleanTs.match(/(\d{4})[:/\-](\d{2})[:/\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);

  if (digits && digits.length >= 7) {
    const isoLike = `${digits[1]}-${digits[2]}-${digits[3]}T${digits[4]}:${digits[5]}:${digits[6]}`;
    const parsed = new Date(isoLike);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const fallbackParse = new Date(cleanTs);
  if (!isNaN(fallbackParse.getTime())) return fallbackParse.toISOString();

  console.warn('normalizeTimestamp: failed to parse', dateString);
  return new Date().toISOString();
};

