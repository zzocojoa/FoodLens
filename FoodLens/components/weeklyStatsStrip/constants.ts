export const DAY_ITEM_WIDTH = 60;
export const DAY_ITEM_GAP = 8;
export const SNAP_INTERVAL = DAY_ITEM_WIDTH + DAY_ITEM_GAP;
export const DAY_ITEM_HALF_WIDTH = DAY_ITEM_WIDTH / 2;

export const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

export const STATUS_DOT_COLORS = {
  safe: '#22C55E',
  danger: '#EF4444',
  warning: '#EAB308',
} as const;

