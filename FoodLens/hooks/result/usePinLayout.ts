import { useState, useEffect, useMemo } from 'react';
import { Image, Dimensions } from 'react-native';
import { generatePinLayout } from '../../utils/pinLayoutAlgorithm';

const { width, height } = Dimensions.get('window');
const HEADER_HEIGHT = height * 0.6;

export function usePinLayout(ingredients: any[] | undefined, imageUri: string | undefined) {
  const [imageSize, setImageSize] = useState<{width: number, height: number} | null>(null);

  useEffect(() => {
    if (imageUri) {
      Image.getSize(imageUri, (w, h) => {
        setImageSize({ width: w, height: h });
      }, (err) => {
        console.warn("[usePinLayout] Failed to load image size", err);
      });
    }
  }, [imageUri]);

  const pins = useMemo(() => {
    if (!ingredients) return [];
    
    // 1. Generate core layout (0-100% coordinates)
    const basePins = generatePinLayout(ingredients);
    
    // 2. Apply Aspect Ratio Correction for resizeMode="cover"
    return basePins.map(pin => {
      // If we don't have box_2d, skip rendering by returning null or filtering later
      // But generatePinLayout guarantees box_2d
      
      let centerX = pin.cx; 
      let centerY = pin.cy;

      if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
          const imageRatio = imageSize.width / imageSize.height;
          // HEADER_HEIGHT is fixed height, width is screen width
          const containerRatio = width / HEADER_HEIGHT;
          
          if (imageRatio > containerRatio) {
              // Image is wider: horizontal crop
              const scale = imageRatio / containerRatio;
              // Adjust X: expand from center
              centerX = (centerX - 50) * scale + 50;
          } else {
              // Image is taller: vertical crop
              const scale = containerRatio / imageRatio;
              // Adjust Y: expand from center
              centerY = (centerY - 50) * scale + 50;
          }
      }

      return {
        ...pin,
        displayX: centerX,
        displayY: centerY
      };
    });
  }, [ingredients, imageSize]);

  return { pins, imageSize };
}
