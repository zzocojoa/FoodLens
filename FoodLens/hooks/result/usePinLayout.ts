import { useState, useEffect, useMemo } from 'react';
import { Image, Dimensions } from 'react-native';
import { generatePinLayout } from '../../utils/pinLayoutAlgorithm';

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

    
    
    // 44. Calculate layout style for the image itself
    let layoutStyle = undefined;
    if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
        const imageRatio = imageSize.width / imageSize.height;
        const containerRatio = width / HEADER_HEIGHT;
        
        if (imageRatio > containerRatio) {
             // Wider (Letterbox) - Center Vertically
             const renderedH = width / imageRatio;
             layoutStyle = {
                 width: '100%',
                 height: renderedH,
                 marginTop: (HEADER_HEIGHT - renderedH) / 2, 
                 marginLeft: 0
             };
        } else {
             // Taller (Pillarbox) - Center Horizontally
             const renderedW = Math.min(width, HEADER_HEIGHT * imageRatio);
             layoutStyle = {
                 width: renderedW,
                 height: HEADER_HEIGHT,
                 marginTop: 0,
                 marginLeft: (width - renderedW) / 2
             };
        }
    }

    if (!showPins) {
        return { pins: [], layoutStyle: undefined };
    }

    // 1. Generate base pins only if showing pins
    let basePins;
    const hasRealCoordinates = ingredients.some(ing => ing.bbox && Array.isArray(ing.bbox) && ing.bbox.length === 4);

    if (hasRealCoordinates) {
      basePins = ingredients.map(ing => {
        if (!ing.bbox) return { ...ing, cx: 50, cy: 50 };
        const [ymin, xmin, ymax, xmax] = ing.bbox;
        const cx = ((xmin + xmax) / 2) / 10;
        const cy = ((ymin + ymax) / 2) / 10;
        return { ...ing, cx, cy };
      });
    } else {
       basePins = generatePinLayout(ingredients);
    }
    
    // 5. Map pins to image coordinates (existing logic)
    return { 
      pins: basePins.map(pin => {
      // ... existing mapping logic ...
      let centerX = pin.cx; 
      let centerY = pin.cy;

      if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
         // ... reuse layoutStyle calculation concept or just rely on the if block above
         // BUT we need specific render details (renderedWidth, offsetX/Y)
          const imageRatio = imageSize.width / imageSize.height;
          const containerRatio = width / HEADER_HEIGHT;
          
          let renderedWidth = width;
          let renderedHeight = HEADER_HEIGHT;
          let offsetX = 0;
          let offsetY = 0;

          if (imageRatio > containerRatio) {
              renderedWidth = width;
              renderedHeight = width / imageRatio;
              offsetY = 0; 
          } else {
              renderedHeight = HEADER_HEIGHT;
              renderedWidth = HEADER_HEIGHT * imageRatio;
              offsetX = (width - renderedWidth) / 2;
          }

          const pixelX = (centerX / 100) * renderedWidth;
          const pixelY = (centerY / 100) * renderedHeight;
          const finalPixelX = pixelX + offsetX;
          const finalPixelY = pixelY + offsetY;

          centerX = (finalPixelX / width) * 100;
          centerY = (finalPixelY / HEADER_HEIGHT) * 100;
      }

      return {
        ...pin,
        displayX: centerX,
        displayY: centerY
      };
    }), layoutStyle: layoutStyle ?? undefined };
  }, [ingredients, imageSize, showPins, overrideImageSize]);

  // Return structure: { pins: [...], layoutStyle: {...}, imageSize: {...} }
  if (!ingredients) return { pins: [], layoutStyle: undefined, imageSize };
  
  return { 
      pins: pins.pins, 
      layoutStyle: pins.layoutStyle,
      imageSize 
  };
}
