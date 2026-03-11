import { dataStore } from '@/services/dataStore';
import type { AnalyzedData } from '@/services/ai';
import { parseResultRouteFlags, type ResultSearchParams } from '@/services/contracts/resultRoute';
import type { ImageSourcePropType } from 'react-native';
import {
  getBarcodeImageSource,
  getResolvedImageSource,
  isBarcodeResult,
  parseSearchParamObject,
} from './analysisDataUtils';

type AnalysisLocationData = Record<string, unknown> | null;
type AnalysisResultData = (AnalyzedData & { raw_data?: Record<string, unknown> }) | null;

type ImageResolution = {
  imageSource: ImageSourcePropType | null;
  imageDimensions: { width: number; height: number } | null;
};

export type LoadedAnalysisData = {
  isRestoring: boolean;
  result: AnalysisResultData;
  locationData: AnalysisLocationData;
  storedImageRef: string | undefined;
  imageSource: ImageSourcePropType | null;
  imageDimensions: { width: number; height: number } | null;
};

const EMPTY_LOADED_ANALYSIS_DATA: LoadedAnalysisData = {
  isRestoring: false,
  result: null,
  locationData: null,
  storedImageRef: undefined,
  imageSource: null,
  imageDimensions: null,
};

const normalizeBarcodeResult = (
  resultData: AnalysisResultData,
  barcodeParam: string | string[] | undefined
): AnalysisResultData => {
  if (!resultData) return resultData;
  if (!isBarcodeResult(resultData, barcodeParam)) return resultData;
  if (resultData.isBarcode === true) return resultData;
  return { ...resultData, isBarcode: true };
};

const resolveImage = (
  resultData: AnalysisResultData,
  storedImageRef: string | null | undefined,
  barcodeParam: string | string[] | undefined
): ImageResolution => {
  if (isBarcodeResult(resultData, barcodeParam)) {
    return getBarcodeImageSource();
  }
  return getResolvedImageSource(storedImageRef);
};

const buildLoadedAnalysisData = ({
  resultData,
  locationData,
  storedImageRef,
  barcodeParam,
}: {
  resultData: AnalysisResultData;
  locationData: AnalysisLocationData;
  storedImageRef: string | null | undefined;
  barcodeParam: string | string[] | undefined;
}): LoadedAnalysisData => {
  const normalizedResult = normalizeBarcodeResult(resultData, barcodeParam);
  const image = resolveImage(normalizedResult, storedImageRef, barcodeParam);

  return {
    isRestoring: false,
    result: normalizedResult,
    locationData,
    storedImageRef: storedImageRef || undefined,
    imageSource: image.imageSource,
    imageDimensions: image.imageDimensions,
  };
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isAnalyzedData = (value: unknown): value is AnalyzedData =>
  isObjectRecord(value) &&
  typeof value['foodName'] === 'string' &&
  typeof value['safetyStatus'] === 'string' &&
  Array.isArray(value['ingredients']);

const toResultData = (value: unknown): AnalysisResultData =>
  isAnalyzedData(value) ? (value as AnalysisResultData) : null;

const toLocationData = (value: unknown): AnalysisLocationData =>
  isObjectRecord(value) ? (value as AnalysisLocationData) : null;

export const analysisDataService = {
  async load(
    params: ResultSearchParams & {
      isRestoring: boolean;
    }
  ) {
    const routeFlags = parseResultRouteFlags(params);
    const fromStoreMode = routeFlags.fromStoreMode;

    if (params.isRestoring) {
      const success = await dataStore.restoreBackup();
      if (success) {
        const stored = dataStore.getData();
        return buildLoadedAnalysisData({
          resultData: stored.result,
          locationData: toLocationData(stored.location),
          storedImageRef: stored.imageUri,
          barcodeParam: params.isBarcode,
        });
      }

      return EMPTY_LOADED_ANALYSIS_DATA;
    }

    if (fromStoreMode) {
      const stored = dataStore.getData();
      return buildLoadedAnalysisData({
        resultData: stored.result,
        locationData: toLocationData(stored.location),
        storedImageRef: stored.imageUri,
        barcodeParam: params.isBarcode,
      });
    }

    const parsedResult = parseSearchParamObject(params.data);
    const parsedLocation = parseSearchParamObject(params.location);
    const storedData = dataStore.getData();

    return buildLoadedAnalysisData({
      resultData: toResultData(parsedResult),
      locationData: toLocationData(parsedLocation),
      storedImageRef: storedData.imageUri,
      barcodeParam: params.isBarcode,
    });
  },
};
