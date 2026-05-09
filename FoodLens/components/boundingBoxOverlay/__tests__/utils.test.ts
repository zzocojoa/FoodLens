import {
  getRenderableBoundingBox,
  hasRenderableBoundingBoxes,
  toBoundingBoxRenderItems,
} from '../utils';

describe('boundingBoxOverlay utils', () => {
  it('renders bbox when box_2d is absent', () => {
    const ingredients = [
      {
        name: 'shrimp',
        isAllergen: true,
        bbox: [100, 200, 300, 600],
      },
    ];

    expect(hasRenderableBoundingBoxes(ingredients)).toBe(true);
    expect(toBoundingBoxRenderItems(ingredients, 400, 200)).toEqual([
      {
        key: 'box-0',
        name: 'shrimp',
        isAllergen: true,
        frame: {
          top: 20,
          left: 80,
          width: 160,
          height: 40,
        },
      },
    ]);
  });

  it('ignores invalid bbox coordinates', () => {
    const ingredients = [
      { name: 'reversed-y', isAllergen: false, bbox: [300, 200, 100, 600] },
      { name: 'reversed-x', isAllergen: false, bbox: [100, 600, 300, 200] },
      { name: 'out-of-range', isAllergen: false, bbox: [100, -1, 300, 600] },
      { name: 'too-short', isAllergen: false, bbox: [100, 200, 300] },
      { name: 'not-number', isAllergen: false, bbox: [100, 200, Number.NaN, 600] },
    ];

    expect(hasRenderableBoundingBoxes(ingredients)).toBe(false);
    expect(toBoundingBoxRenderItems(ingredients, 400, 200)).toEqual([]);
  });

  it('falls back to bbox when box_2d is invalid', () => {
    const ingredient = {
      name: 'sauce',
      isAllergen: false,
      box_2d: [500, 500, 400, 800],
      bbox: [400, 500, 500, 800],
    };

    expect(getRenderableBoundingBox(ingredient)).toEqual([400, 500, 500, 800]);
  });

  it('prefers valid box_2d over bbox', () => {
    const ingredient = {
      name: 'rice',
      isAllergen: false,
      box_2d: [10, 20, 30, 40],
      bbox: [400, 500, 500, 800],
    };

    expect(getRenderableBoundingBox(ingredient)).toEqual([10, 20, 30, 40]);
  });
});
