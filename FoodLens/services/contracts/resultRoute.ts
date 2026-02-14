export type BoolString = 'true' | 'false';
export type ResultSourceType = 'camera' | 'library';

export type ResultRouteParams = {
  fromStore: 'true';
  isNew?: 'true';
  isBarcode?: BoolString;
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

export const parseResultRouteFlags = (params: ResultSearchParams) => ({
  fromStoreMode: isTrueParam(params.fromStore),
  isNew: isTrueParam(params.isNew),
  isBarcodeParam: isTrueParam(params.isBarcode),
  sourceType: parseResultSourceType(params.sourceType),
});

export const buildResultRoute = ({
  isNew,
  isBarcode,
  sourceType,
}: {
  isNew?: boolean;
  isBarcode?: boolean;
  sourceType?: ResultSourceType;
} = {}): ResultRoute => ({
  pathname: '/result',
  params: {
    fromStore: 'true',
    ...(isNew ? { isNew: 'true' as const } : {}),
    ...(typeof isBarcode === 'boolean' ? { isBarcode: isBarcode ? 'true' : 'false' } : {}),
    ...(sourceType ? { sourceType } : {}),
  },
});
