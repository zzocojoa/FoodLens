import { BoundingBoxIngredient, BoundingBoxRenderItem } from './types';

export const hasRenderableBoundingBoxes = (ingredients: BoundingBoxIngredient[]): boolean =>
  ingredients.some((ingredient) => ingredient.box_2d && ingredient.box_2d.length >= 4);

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
      if (!ingredient.box_2d || ingredient.box_2d.length < 4) return null;
      return {
        key: `box-${index}`,
        name: ingredient.name,
        isAllergen: ingredient.isAllergen,
        frame: toBoundingBoxFrame(ingredient.box_2d, imageWidth, imageHeight),
      };
    })
    .filter((item): item is BoundingBoxRenderItem => item !== null);
