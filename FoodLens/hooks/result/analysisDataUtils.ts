import { Image } from 'react-native';
import { resolveImageUri } from '../../services/imageStorage';

type AnyObject = any;

export const isBarcodeResult = (result: AnyObject, isBarcodeParam: string | string[] | undefined) =>
  !!result?.isBarcode || isBarcodeParam === 'true';

export const getBarcodeImageSource = () => {
  const barcodeBackground = require('@/assets/images/barcode_bg.png');
  const assetSource = Image.resolveAssetSource(barcodeBackground);
  return {
    imageSource: barcodeBackground,
    imageDimensions: { width: assetSource.width, height: assetSource.height },
  };
};

export const getResolvedImageSource = (storedImageRef: string | null | undefined) => ({
  imageSource: storedImageRef ? { uri: resolveImageUri(storedImageRef) } : null,
  imageDimensions: null,
});

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
