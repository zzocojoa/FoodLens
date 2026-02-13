import { useMemo, useState } from 'react';
import { BoundingBoxOverlayProps } from '../types';
import { hasRenderableBoundingBoxes, toBoundingBoxRenderItems } from '../utils';

export const useBoundingBoxOverlayState = ({
  imageWidth,
  imageHeight,
  ingredients,
}: BoundingBoxOverlayProps) => {
  const [isVisible, setIsVisible] = useState(true);

  const hasBoxes = hasRenderableBoundingBoxes(ingredients);

  const renderItems = useMemo(
    () => toBoundingBoxRenderItems(ingredients, imageWidth, imageHeight),
    [ingredients, imageWidth, imageHeight]
  );

  const toggleVisibility = () => {
    setIsVisible((prev) => !prev);
  };

  return {
    isVisible,
    hasBoxes,
    renderItems,
    toggleVisibility,
  };
};
