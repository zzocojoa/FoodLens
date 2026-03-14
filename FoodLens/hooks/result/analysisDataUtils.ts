import { Image } from 'react-native';
import { resolveImageUri } from '../../services/imageStorage';
import type { ImageSourcePropType } from 'react-native';
import type { AnalyzedData } from '@/services/ai';

type ResultLike = (AnalyzedData & { raw_data?: Record<string, unknown> }) | null | undefined;
const EMPTY_IMAGE_RESOLUTION = {
  imageSource: null,
  imageDimensions: null,
};

export const isBarcodeResult = (result: ResultLike, isBarcodeParam: string | string[] | undefined) =>
  result?.isBarcode === true ||
  result?.raw_data?.['isBarcode'] === true ||
  isBarcodeParam === 'true';

export const getBarcodeImageSource = () => {
  return EMPTY_IMAGE_RESOLUTION;
};

export const getResolvedImageSource = (storedImageRef: string | null | undefined) => {
  if (!storedImageRef) {
    return EMPTY_IMAGE_RESOLUTION;
  }
  const resolvedUri = resolveImageUri(storedImageRef);
  return {
    imageSource: resolvedUri ? { uri: resolvedUri } : null,
    imageDimensions: null,
  };
};

export const parseSearchParamObject = (value: string | string[] | undefined) => {
  if (typeof value !== 'string') return null;
  return JSON.parse(value);
};

export const toDisplayImageUri = (imageSource: ImageSourcePropType | null): string | undefined => {
  if (typeof imageSource === 'number' && imageSource) {
    return Image.resolveAssetSource(imageSource).uri;
  }
  if (imageSource && typeof imageSource === 'object' && 'uri' in imageSource) {
    const uri = imageSource.uri;
    return typeof uri === 'string' ? uri : undefined;
  }
  return undefined;
};
