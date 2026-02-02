export interface PinPosition {
  cx: number;
  cy: number;
  originalCx: number;
  originalCy: number;
  box_2d?: number[];
  [key: string]: any;
}

/**
 * Calculates grid-based positions for ingredients to ensure even distribution.
 * Strategy: Distribute pins in a visually balanced pattern.
 */
function calculateInitialPosition(idx: number, total: number): [number, number] {
  if (total === 1) return [50, 50];
  if (total === 2) return [idx === 0 ? 30 : 70, 50];
  
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
export function generatePinLayout(ingredients: any[]): PinPosition[] {
  if (!ingredients || ingredients.length === 0) return [];
  
  const count = ingredients.length;

  // 1. Initial Positions
  let pins: PinPosition[] = ingredients.map((item, index) => {
      const [cx, cy] = calculateInitialPosition(index, count);
      return { ...item, cx, cy, originalCx: cx, originalCy: cy };
  });

  // 2. Collision Resolution (Iterative repulsion)
  const MIN_DIST = 18; // %
  const ITERATIONS = 8;
  
  for (let iter = 0; iter < ITERATIONS; iter++) {
      for (let i = 0; i < pins.length; i++) {
          for (let j = i + 1; j < pins.length; j++) {
              const p1 = pins[i];
              const p2 = pins[j];

              const dx = p1.cx - p2.cx;
              const dy = p1.cy - p2.cy;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < MIN_DIST && dist > 0) {
                  // Push apart
                  const overlap = MIN_DIST - dist;
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
      p.cx = Math.max(10, Math.min(90, p.cx));
      p.cy = Math.max(10, Math.min(85, p.cy));
  });

  // 4. Convert to box_2d format
  return pins.map((p) => ({
      ...p,
      box_2d: [p.cy * 10 - 50, p.cx * 10 - 50, p.cy * 10 + 50, p.cx * 10 + 50]
  }));
}
