export type PinLayoutInput = Record<string, unknown> & {
  box_2d?: number[];
};

export interface PinPosition {
  cx: number;
  cy: number;
  originalCx: number;
  originalCy: number;
  box_2d?: number[];
  [key: string]: unknown;
}

const SINGLE_PIN_POSITION: [number, number] = [50, 50];
const TWO_PIN_LEFT_X = 30;
const TWO_PIN_RIGHT_X = 70;
const PIN_CENTER_Y = 50;
const MIN_DISTANCE = 18;
const ITERATION_COUNT = 8;
const BOUNDS = { minX: 10, maxX: 90, minY: 10, maxY: 85 } as const;
const BOX_HALF_SIZE = 50;
const COORD_SCALE = 10;

/**
 * Calculates grid-based positions for ingredients to ensure even distribution.
 * Strategy: Distribute pins in a visually balanced pattern.
 */
function calculateInitialPosition(idx: number, total: number): [number, number] {
  if (total === 1) return SINGLE_PIN_POSITION;
  if (total === 2) return [idx === 0 ? TWO_PIN_LEFT_X : TWO_PIN_RIGHT_X, PIN_CENTER_Y];
  
  if (total === 3) {
      const positions: [number, number][] = [[50, 30], [30, 65], [70, 65]];
      return positions[idx];
  }
  if (total === 4) {
      const positions: [number, number][] = [[30, 35], [70, 35], [30, 65], [70, 65]];
      return positions[idx];
  }
  
  if (total <= 6) {
      const row = idx < 3 ? 0 : 1;
      const col = idx < 3 ? idx : idx - 3;
      const itemsInRow = idx < 3 ? 3 : total - 3;
      const spacing = 80 / (itemsInRow + 1);
      return [10 + spacing * (col + 1), row === 0 ? 35 : 65];
  }
  
  const row = Math.floor(idx / 3);
  const col = idx % 3;
  const rowOffset = (row % 2) * 10;
  return [
      20 + col * 30 + rowOffset,
      Math.min(75, 25 + row * 20)
  ];
}

/**
 * Main function to generate layout for pins.
 * applies initial grid -> collision resolution -> boundary clamping.
 */
export function generatePinLayout<T extends PinLayoutInput>(ingredients: T[]): Array<T & PinPosition> {
  if (!ingredients || ingredients.length === 0) return [];
  
  const count = ingredients.length;

  // 1. Initial Positions
  let pins: Array<T & PinPosition> = ingredients.map((item, index) => {
      const [cx, cy] = calculateInitialPosition(index, count);
      return { ...item, cx, cy, originalCx: cx, originalCy: cy };
  });

  // 2. Collision Resolution (Iterative repulsion)
  for (let iter = 0; iter < ITERATION_COUNT; iter++) {
      for (let i = 0; i < pins.length; i++) {
          for (let j = i + 1; j < pins.length; j++) {
              const p1 = pins[i];
              const p2 = pins[j];

              const dx = p1.cx - p2.cx;
              const dy = p1.cy - p2.cy;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < MIN_DISTANCE && dist > 0) {
                  // Push apart
                  const overlap = MIN_DISTANCE - dist;
                  const adjustX = (dx / dist) * overlap * 0.5;
                  const adjustY = (dy / dist) * overlap * 0.5;

                  p1.cx += adjustX;
                  p1.cy += adjustY;
                  p2.cx -= adjustX;
                  p2.cy -= adjustY;
              } else if (dist === 0) {
                  // Exact overlap -> jitter
                  p1.cx += 5;
                  p1.cy += 3;
              }
          }
      }
  }

  // 3. Keep within bounds
  pins.forEach((p) => {
      p.cx = Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.cx));
      p.cy = Math.max(BOUNDS.minY, Math.min(BOUNDS.maxY, p.cy));
  });

  // 4. Convert to box_2d format
  return pins.map((p) => ({
      ...p,
      box_2d: [
        p.cy * COORD_SCALE - BOX_HALF_SIZE,
        p.cx * COORD_SCALE - BOX_HALF_SIZE,
        p.cy * COORD_SCALE + BOX_HALF_SIZE,
        p.cx * COORD_SCALE + BOX_HALF_SIZE,
      ],
  }));
}
