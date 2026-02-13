import { dataStore } from '@/services/dataStore';
import {
  getBarcodeImageSource,
  getResolvedImageSource,
  isBarcodeResult,
  parseSearchParamObject,
} from './analysisDataUtils';

type ImageResolution = {
  imageSource: any;
  imageDimensions: { width: number; height: number } | null;
};

const normalizeBarcodeResult = (
  resultData: any,
  barcodeParam: string | string[] | undefined
) => {
  if (!resultData) return resultData;
  if (!isBarcodeResult(resultData, barcodeParam)) return resultData;
  if (resultData.isBarcode === true) return resultData;
  return { ...resultData, isBarcode: true };
};

const resolveImage = (
  resultData: any,
  storedImageRef: string | null | undefined,
  barcodeParam: string | string[] | undefined
): ImageResolution => {
  if (isBarcodeResult(resultData, barcodeParam)) {
    return getBarcodeImageSource();
  }
  return getResolvedImageSource(storedImageRef);
};

export const analysisDataService = {
  async load(params: {
    isRestoring: boolean;
    fromStore: string | string[] | undefined;
    data: string | string[] | undefined;
    location: string | string[] | undefined;
    isBarcode: string | string[] | undefined;
  }) {
    const fromStoreMode = params.fromStore === 'true';

    if (params.isRestoring) {
      const success = await dataStore.restoreBackup();
      if (success) {
        const stored = dataStore.getData();
        const normalizedResult = normalizeBarcodeResult(stored.result, params.isBarcode);
        const image = resolveImage(normalizedResult, stored.imageUri, params.isBarcode);
        return {
          isRestoring: false,
          result: normalizedResult,
          locationData: stored.location,
          storedImageRef: stored.imageUri || undefined,
          imageSource: image.imageSource,
          imageDimensions: image.imageDimensions,
        };
      }

      return {
        isRestoring: false,
        result: null,
        locationData: null,
        storedImageRef: undefined,
        imageSource: null,
        imageDimensions: null,
      };
    }

    if (fromStoreMode) {
      const stored = dataStore.getData();
      const normalizedResult = normalizeBarcodeResult(stored.result, params.isBarcode);
      const image = resolveImage(normalizedResult, stored.imageUri, params.isBarcode);
      return {
        isRestoring: false,
        result: normalizedResult,
        locationData: stored.location,
        storedImageRef: stored.imageUri || undefined,
        imageSource: image.imageSource,
        imageDimensions: image.imageDimensions,
      };
    }

    const parsedResult = parseSearchParamObject(params.data);
    const parsedLocation = parseSearchParamObject(params.location);
    const storedData = dataStore.getData();
    const normalizedResult = normalizeBarcodeResult(parsedResult, params.isBarcode);
    const image = resolveImage(normalizedResult, storedData.imageUri, params.isBarcode);

    return {
      isRestoring: false,
      result: normalizedResult,
      locationData: parsedLocation,
      storedImageRef: storedData.imageUri || undefined,
      imageSource: image.imageSource,
      imageDimensions: image.imageDimensions,
    };
  },
};
