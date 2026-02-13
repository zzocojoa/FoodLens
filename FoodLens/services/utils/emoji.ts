const DEFAULT_FOOD_EMOJI = '🍽️';

type EmojiRule = {
  emoji: string;
  keywords: readonly string[];
};

const EMOJI_RULES: readonly EmojiRule[] = [
  { emoji: '🍜', keywords: ['noodle', 'pad'] },
  { emoji: '🍚', keywords: ['rice'] },
  { emoji: '🍔', keywords: ['burger'] },
  { emoji: '🍕', keywords: ['pizza'] },
  { emoji: '🥗', keywords: ['salad'] },
  { emoji: '🍎', keywords: ['fruit'] },
  { emoji: '🍰', keywords: ['cake', 'gelato'] },
] as const;

/**
 * Maps food names to relevant emojis.
 */
export const getEmoji = (name: string): string => {
  if (!name) return DEFAULT_FOOD_EMOJI;
  const normalized = name.toLowerCase();

  for (const rule of EMOJI_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.emoji;
    }
  }

  return DEFAULT_FOOD_EMOJI;
};
