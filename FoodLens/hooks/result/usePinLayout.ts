import { useMemo } from 'react';
import { Dimensions } from 'react-native';
import {
    computeImageLayoutStyle,
    mapPinsToDisplayCoordinates,
    toBasePins,
} from './pinLayoutUtils';
import { useImageSize } from './useImageSize';

const { width, height } = Dimensions.get('window');

// Base height for the header container (Parallax area)
const HEADER_HEIGHT = height * 0.6; 

export function usePinLayout(
    ingredients: any[] | undefined, 
    imageUri: string | undefined, 
    showPins: boolean = true,
    overrideImageSize?: { width: number, height: number } | null
) {
  const shouldMeasureImage = showPins || !!overrideImageSize;
  const imageSize = useImageSize(imageUri, overrideImageSize, shouldMeasureImage);


  const pins = useMemo(() => {
    // Standard height for photos, but for barcodes we account for the 160px sheet overlap
    // to ensure the illustration is centered in the visible area.
    const effectiveHeight = !showPins ? (HEADER_HEIGHT - 160) : HEADER_HEIGHT;
    const layoutStyle = computeImageLayoutStyle(imageSize, width, effectiveHeight);

    if (!showPins) {
        return { 
            pins: [], 
            layoutStyle: layoutStyle ?? undefined
        };
    }

    if (!ingredients) return { pins: [], layoutStyle: layoutStyle ?? undefined };

    const basePins = toBasePins(ingredients as any[]);
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
  }, [ingredients, imageSize, showPins]);

  // Return structure: { pins: [...], layoutStyle: {...}, imageSize: {...} }
  if (!ingredients) return { pins: [], layoutStyle: undefined, imageSize };
  
  return { 
      pins: pins.pins, 
      layoutStyle: pins.layoutStyle,
      imageSize 
  };
}
