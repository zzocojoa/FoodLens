import type { AnalysisOrigin } from '@/services/aiCore/types';

export type BoolString = 'true' | 'false';
export type ResultSourceType = 'camera' | 'library';

export type ResultRouteParams = {
  fromStore: 'true';
  isNew?: 'true';
  isBarcode?: BoolString;
  analysisOrigin?: AnalysisOrigin;
  sourceType?: ResultSourceType;
};

export type ResultRoute = {
  pathname: '/result';
  params: ResultRouteParams;
};

export type ResultSearchParams = {
  data?: string | string[];
  location?: string | string[];
  fromStore?: string | string[];
  isNew?: string | string[];
  isBarcode?: string | string[];
  analysisOrigin?: string | string[];
  sourceType?: string | string[];
};

const toSingle = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const isTrueParam = (value: string | string[] | undefined): boolean => toSingle(value) === 'true';

export const parseResultSourceType = (
  value: string | string[] | undefined
): ResultSourceType | undefined => {
  const single = toSingle(value);
  if (single === 'camera' || single === 'library') return single;
  return undefined;
};

export const parseResultAnalysisOrigin = (
  value: string | string[] | undefined
): AnalysisOrigin | undefined => {
  const single = toSingle(value);
  if (
    single === 'food_photo' ||
    single === 'label_photo' ||
    single === 'barcode_lookup' ||
    single === 'barcode_to_label_fallback'
  ) {
    return single;
  }
  return undefined;
};

export const parseResultRouteFlags = (params: ResultSearchParams) => ({
  fromStoreMode: isTrueParam(params.fromStore),
  isNew: isTrueParam(params.isNew),
  isBarcodeParam: isTrueParam(params.isBarcode),
  analysisOrigin: parseResultAnalysisOrigin(params.analysisOrigin),
  sourceType: parseResultSourceType(params.sourceType),
});

export const buildResultRoute = ({
  isNew,
  isBarcode,
  analysisOrigin,
  sourceType,
}: {
  isNew?: boolean;
  isBarcode?: boolean;
  analysisOrigin?: AnalysisOrigin;
  sourceType?: ResultSourceType;
} = {}): ResultRoute => ({
  pathname: '/result',
  params: {
    fromStore: 'true',
    ...(isNew ? { isNew: 'true' as const } : {}),
    ...(typeof isBarcode === 'boolean' ? { isBarcode: isBarcode ? 'true' : 'false' } : {}),
    ...(analysisOrigin ? { analysisOrigin } : {}),
    ...(sourceType ? { sourceType } : {}),
  },
});
