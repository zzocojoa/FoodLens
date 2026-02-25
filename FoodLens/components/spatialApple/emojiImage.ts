const TWEMOJI_PNG_BASE_URL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

const toTwemojiCodepoint = (emoji: string): string | null => {
  const trimmed = emoji.trim();
  if (!trimmed) {
    return null;
  }

  const codepoints = Array.from(trimmed)
    .map((char) => char.codePointAt(0))
    .filter((codepoint): codepoint is number => codepoint !== undefined)
    // Twemoji asset names omit VS16.
    .filter((codepoint) => codepoint !== 0xfe0f)
    .map((codepoint) => codepoint.toString(16).toLowerCase());

  if (codepoints.length === 0) {
    return null;
  }

  return codepoints.join('-');
};

export const getEmojiImageUri = (emoji: string): string | null => {
  const codepoint = toTwemojiCodepoint(emoji);
  if (!codepoint) {
    return null;
  }

  return `${TWEMOJI_PNG_BASE_URL}/${codepoint}.png`;
};

