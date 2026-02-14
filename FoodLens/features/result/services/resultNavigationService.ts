type BoolString = 'true' | 'false';

type ResultRouteParams = {
  fromStore: 'true';
  isNew?: 'true';
  isBarcode?: BoolString;
  sourceType?: 'camera' | 'library';
};

type ResultRoute = {
  pathname: '/result';
  params: ResultRouteParams;
};

export const buildResultRoute = ({
  isNew,
  isBarcode,
  sourceType,
}: {
  isNew?: boolean;
  isBarcode?: boolean;
  sourceType?: 'camera' | 'library';
} = {}): ResultRoute => ({
  pathname: '/result',
  params: {
    fromStore: 'true',
    ...(isNew ? { isNew: 'true' as const } : {}),
    ...(typeof isBarcode === 'boolean' ? { isBarcode: isBarcode ? 'true' : 'false' } : {}),
    ...(sourceType ? { sourceType } : {}),
  },
});
