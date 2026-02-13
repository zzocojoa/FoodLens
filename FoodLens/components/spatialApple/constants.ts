export const GLOW_COLORS: Record<string, string> = {
  '🍎': '#F43F5E',
  '🍏': '#84CC16',
  '🍊': '#F97316',
  '🍋': '#EAB308',
  '🍇': '#8B5CF6',
  '🍓': '#EF4444',
  '🥝': '#65A30D',
  '🥑': '#16A34A',
  '🍑': '#F87171',
  '🍒': '#DC2626',
  '🫐': '#4F46E5',
  '🍌': '#F59E0B',
  '🍉': '#FB7185',
  '🥭': '#F59E0B',
  '🍐': '#A3E635',
  '🍈': '#A3E635',
  '🫒': '#65A30D',
  '🥥': '#A8A29E',
};

export const SENSOR_SENSITIVITY = 1.5;
export const OFFSET_DECAY = 0.9;
export const OFFSET_LIMIT = 20;
export const MOTION_THRESHOLD = 5;

export const APPLE_SPRING_CONFIG = { mass: 4.0, damping: 30, stiffness: 30 } as const;
export const GLOW_SPRING_CONFIG = { mass: 3.5, damping: 35, stiffness: 50 } as const;
