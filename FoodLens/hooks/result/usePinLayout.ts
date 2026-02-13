import { useState, useEffect, useMemo } from 'react';
import { Image, Dimensions } from 'react-native';
import {
    computeImageLayoutStyle,
    mapPinsToDisplayCoordinates,
    toBasePins,
} from './pinLayoutUtils';

const { width, height } = Dimensions.get('window');
const HEADER_HEIGHT = height * 0.6;

export function usePinLayout(
    ingredients: any[] | undefined, 
    imageUri: string | undefined, 
    showPins: boolean = true,
    overrideImageSize?: { width: number, height: number } | null
) {
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(overrideImageSize || null);

  useEffect(() => {
    if (overrideImageSize) {
        setImageSize(overrideImageSize);
        return;
    }

    if (imageUri) {
      Image.getSize(imageUri, (w, h) => {
        setImageSize({ width: w, height: h });
      }, (err) => {
        console.warn("[usePinLayout] Failed to load image size", err);
      });
    }
  }, [imageUri, overrideImageSize]);


  const pins = useMemo(() => {
    if (!ingredients) return { pins: [], layoutStyle: {} };

    const layoutStyle = computeImageLayoutStyle(imageSize, width, HEADER_HEIGHT);

    if (!showPins) {
        return { pins: [], layoutStyle: undefined };
    }

    const basePins = toBasePins(ingredients);
    const pinsWithDisplayCoordinates = mapPinsToDisplayCoordinates(
      basePins,
      imageSize,
      width,
      HEADER_HEIGHT
    );

    return {
      pins: pinsWithDisplayCoordinates,
      layoutStyle: layoutStyle ?? undefined,
    };
  }, [ingredients, imageSize, showPins, overrideImageSize]);

  // Return structure: { pins: [...], layoutStyle: {...}, imageSize: {...} }
  if (!ingredients) return { pins: [], layoutStyle: undefined, imageSize };
  
  return { 
      pins: pins.pins, 
      layoutStyle: pins.layoutStyle,
      imageSize 
  };
}
