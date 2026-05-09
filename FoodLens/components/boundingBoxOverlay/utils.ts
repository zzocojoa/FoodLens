import { BoundingBoxIngredient, BoundingBoxRenderItem } from './types';

export const isRenderableBoundingBox = (box: unknown): box is number[] => {
  if (!Array.isArray(box) || box.length !== 4) return false;
  const hasValidCoordinates = box.every(
    (coordinate) =>
      typeof coordinate === 'number' &&
      Number.isFinite(coordinate) &&
      coordinate >= 0 &&
      coordinate <= 1000
  );
  if (!hasValidCoordinates) return false;
  const [ymin, xmin, ymax, xmax] = box;
  return ymin < ymax && xmin < xmax;
};

export const getRenderableBoundingBox = (ingredient: BoundingBoxIngredient): number[] | null => {
  if (isRenderableBoundingBox(ingredient.box_2d)) return ingredient.box_2d;
  if (isRenderableBoundingBox(ingredient.bbox)) return ingredient.bbox;
  return null;
};

export const hasRenderableBoundingBoxes = (ingredients: BoundingBoxIngredient[]): boolean =>
  ingredients.some((ingredient) => getRenderableBoundingBox(ingredient) !== null);

export const toBoundingBoxFrame = (
  box: number[],
  imageWidth: number,
  imageHeight: number
) => {
  const [ymin, xmin, ymax, xmax] = box;
  const top = (ymin / 1000) * imageHeight;
  const left = (xmin / 1000) * imageWidth;
  const bottom = (ymax / 1000) * imageHeight;
  const right = (xmax / 1000) * imageWidth;

  return {
    top,
    left,
    width: right - left,
    height: bottom - top,
  };
};

export const getBoundingBoxColors = (isAllergen: boolean) => ({
  boxColor: isAllergen ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.3)',
  borderColor: isAllergen ? '#EF4444' : '#3B82F6',
});

export const toBoundingBoxRenderItems = (
  ingredients: BoundingBoxIngredient[],
  imageWidth: number,
  imageHeight: number
): BoundingBoxRenderItem[] =>
  ingredients
    .map((ingredient, index) => {
      const box = getRenderableBoundingBox(ingredient);
      if (!box) return null;
      return {
        key: `box-${index}`,
        name: ingredient.name,
        isAllergen: ingredient.isAllergen,
        frame: toBoundingBoxFrame(box, imageWidth, imageHeight),
      };
    })
    .filter((item): item is BoundingBoxRenderItem => item !== null);
