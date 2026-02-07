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
    if (!ingredients) return { pins: [], layoutStyle: {} };
    
    // 1. Generate core layout
    let basePins;

    // Check if backend provided real coordinates (bbox: [ymin, xmin, ymax, xmax] on 0-1000 scale)
    const hasRealCoordinates = ingredients.some(ing => ing.bbox && Array.isArray(ing.bbox) && ing.bbox.length === 4);

    if (hasRealCoordinates) {
      basePins = ingredients.map(ing => {
        if (!ing.bbox) return { ...ing, cx: 50, cy: 50 };
        const [ymin, xmin, ymax, xmax] = ing.bbox;
        // Convert 0-1000 scale center to 0-100 scale
        const cx = ((xmin + xmax) / 2) / 10;
        const cy = ((ymin + ymax) / 2) / 10;
        return { ...ing, cx, cy };
      });
    } else {
       basePins = generatePinLayout(ingredients);
    }
    
    console.log("[usePinLayout] Ingredients count:", ingredients.length);
    console.log("[usePinLayout] Has Real Coordinates:", hasRealCoordinates);
    console.log("[usePinLayout] Base Pins:", JSON.stringify(basePins, null, 2));
    
    // Calculate layout style for the image itself to match pin logic
    let layoutStyle = {};
    if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
        const imageRatio = imageSize.width / imageSize.height;
        const containerRatio = width / HEADER_HEIGHT;
        
        if (imageRatio > containerRatio) {
             // Wider (Letterbox) - Top Align
             layoutStyle = {
                 width: width,
                 height: width / imageRatio,
                 marginTop: 0, 
                 marginLeft: 0
             };
        } else {
             // Taller (Pillarbox) - Center Horizontally
             const renderedW = HEADER_HEIGHT * imageRatio;
             layoutStyle = {
                 width: renderedW,
                 height: HEADER_HEIGHT,
                 marginTop: 0,
                 marginLeft: (width - renderedW) / 2
             };
        }
    }

    return { 
      pins: basePins.map(pin => {
      let centerX = pin.cx; 
      let centerY = pin.cy;

      if (imageSize && imageSize.width > 0 && imageSize.height > 0) {
          const imageRatio = imageSize.width / imageSize.height;
          // HEADER_HEIGHT is fixed height, width is screen width
          const containerRatio = width / HEADER_HEIGHT;
          
          let renderedWidth = width;
          let renderedHeight = HEADER_HEIGHT;
          let offsetX = 0;
          let offsetY = 0;

          if (imageRatio > containerRatio) {
              // Image is wider relative to container -> Fits width, letterboxed vertically
              renderedWidth = width;
              renderedHeight = width / imageRatio;
              // offsetY = (HEADER_HEIGHT - renderedHeight) / 2; // Old: Center
              offsetY = 0; // New: Top Align
          } else {
              // Image is taller relative to container -> Fits height, pillarboxed horizontally
              renderedHeight = HEADER_HEIGHT;
              renderedWidth = HEADER_HEIGHT * imageRatio;
              offsetX = (width - renderedWidth) / 2;
          }

          // Map image tokens (0-100%) to container container percentage
          // 1. Convert % to pixel in rendered image
          const pixelX = (centerX / 100) * renderedWidth;
          const pixelY = (centerY / 100) * renderedHeight;

          // 2. Add offset (black bars)
          const finalPixelX = pixelX + offsetX;
          const finalPixelY = pixelY + offsetY;

          // 3. Convert back to % relative to container
          centerX = (finalPixelX / width) * 100;
          centerY = (finalPixelY / HEADER_HEIGHT) * 100;
      }

      return {
        ...pin,
        displayX: centerX,
        displayY: centerY
      };
    }), layoutStyle };
  }, [ingredients, imageSize]);

  // Return structure: { pins: [...], layoutStyle: {...}, imageSize: {...} }
  if (!ingredients) return { pins: [], layoutStyle: {}, imageSize };
  
  return { 
      pins: pins.pins, 
      layoutStyle: pins.layoutStyle,
      imageSize 
  };
}
