/**
 * Maps food names to relevant emojis.
 */
export const getEmoji = (name: string): string => {
  if (!name) return '🍽️';
  const normalized = name.toLowerCase();
  if (normalized.includes('noodle') || normalized.includes('pad')) return '🍜';
  if (normalized.includes('rice')) return '🍚';
  if (normalized.includes('burger')) return '🍔';
  if (normalized.includes('pizza')) return '🍕';
  if (normalized.includes('salad')) return '🥗';
  if (normalized.includes('fruit')) return '🍎';
  if (normalized.includes('cake') || normalized.includes('gelato')) return '🍰';
  return '🍽️';
};

