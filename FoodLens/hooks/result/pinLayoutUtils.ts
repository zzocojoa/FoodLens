import { generatePinLayout } from '../../utils/pinLayoutAlgorithm';

type Size = { width: number; height: number };
type IngredientLike = { bbox?: number[]; cx?: number; cy?: number; [key: string]: any };

export type ImageLayoutStyle = {
  width: string | number;
  height: string | number;
  marginTop: number;
  marginLeft: number;
};

export const hasRealCoordinates = (ingredients: IngredientLike[]): boolean =>
  ingredients.some((ingredient) => ingredient.bbox && Array.isArray(ingredient.bbox) && ingredient.bbox.length === 4);

export const computeImageLayoutStyle = (
  imageSize: Size | null,
  containerWidth: number,
  containerHeight: number
): ImageLayoutStyle | undefined => {
  if (!imageSize || imageSize.width <= 0 || imageSize.height <= 0) return undefined;

  const imageRatio = imageSize.width / imageSize.height;
  const containerRatio = containerWidth / containerHeight;

  if (imageRatio > containerRatio) {
    const renderedHeight = containerWidth / imageRatio;
    return {
      width: '100%',
      height: renderedHeight,
      marginTop: (containerHeight - renderedHeight) / 2,
      marginLeft: 0,
    };
  }

  const renderedWidth = Math.min(containerWidth, containerHeight * imageRatio);
  return {
    width: renderedWidth,
    height: containerHeight,
    marginTop: 0,
    marginLeft: (containerWidth - renderedWidth) / 2,
  };
};

const toRenderedFrame = (imageSize: Size, containerWidth: number, containerHeight: number) => {
  const imageRatio = imageSize.width / imageSize.height;
  const containerRatio = containerWidth / containerHeight;

  let renderedWidth = containerWidth;
  let renderedHeight = containerHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (imageRatio > containerRatio) {
    renderedHeight = containerWidth / imageRatio;
  } else {
    renderedWidth = containerHeight * imageRatio;
    offsetX = (containerWidth - renderedWidth) / 2;
  }

  return { renderedWidth, renderedHeight, offsetX, offsetY };
};

export const toBasePins = (ingredients: IngredientLike[]) => {
  if (!hasRealCoordinates(ingredients)) return generatePinLayout(ingredients);

  return ingredients.map((ingredient) => {
    if (!ingredient.bbox) return { ...ingredient, cx: 50, cy: 50 };
    const [ymin, xmin, ymax, xmax] = ingredient.bbox;
    return {
      ...ingredient,
      cx: ((xmin + xmax) / 2) / 10,
      cy: ((ymin + ymax) / 2) / 10,
    };
  });
};

export const mapPinsToDisplayCoordinates = (
  pins: IngredientLike[],
  imageSize: Size | null,
  containerWidth: number,
  containerHeight: number
) =>
  pins.map((pin) => {
    let centerX = pin.cx ?? 50;
    let centerY = pin.cy ?? 50;

    if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
      const { renderedWidth, renderedHeight, offsetX, offsetY } = toRenderedFrame(
        imageSize,
        containerWidth,
        containerHeight
      );
      const pixelX = (centerX / 100) * renderedWidth;
      const pixelY = (centerY / 100) * renderedHeight;

      centerX = ((pixelX + offsetX) / containerWidth) * 100;
      centerY = ((pixelY + offsetY) / containerHeight) * 100;
    }

    return { ...pin, displayX: centerX, displayY: centerY };
  });
