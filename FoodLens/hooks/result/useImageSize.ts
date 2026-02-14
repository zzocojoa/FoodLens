import { useEffect, useState } from 'react';
import { Image } from 'react-native';

type ImageSize = { width: number; height: number };

export function useImageSize(
  imageUri: string | undefined,
  overrideImageSize?: ImageSize | null,
  shouldMeasure: boolean = true
) {
  const [imageSize, setImageSize] = useState<ImageSize | null>(overrideImageSize || null);

  useEffect(() => {
    if (overrideImageSize) {
      setImageSize(overrideImageSize);
      return;
    }

    if (!shouldMeasure) {
      setImageSize(null);
      return;
    }

    if (!imageUri) {
      setImageSize(null);
      return;
    }

    Image.getSize(
      imageUri,
      (width, height) => {
        setImageSize({ width, height });
      },
      (error) => {
        console.warn('[useImageSize] Failed to load image size', error);
      }
    );
  }, [imageUri, overrideImageSize, shouldMeasure]);

  return imageSize;
}
