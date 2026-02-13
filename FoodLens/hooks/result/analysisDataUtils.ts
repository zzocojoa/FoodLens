import { Image } from 'react-native';
import { resolveImageUri } from '../../services/imageStorage';

type AnyObject = any;

export const isBarcodeResult = (result: AnyObject, isBarcodeParam: string | string[] | undefined) =>
  result?.isBarcode === true ||
  result?.raw_data?.isBarcode === true ||
  isBarcodeParam === 'true';

export const getBarcodeImageSource = () => {
  return {
    imageSource: null,
    imageDimensions: null,
  };
};

export const getResolvedImageSource = (storedImageRef: string | null | undefined) => {
  if (!storedImageRef) {
    return { imageSource: null, imageDimensions: null };
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

export const toDisplayImageUri = (imageSource: any): string | undefined => {
  if (typeof imageSource === 'number' && imageSource) {
    return Image.resolveAssetSource(imageSource).uri;
  }
  return imageSource?.uri;
};
