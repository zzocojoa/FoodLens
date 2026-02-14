type BoolString = 'true' | 'false';

type ResultRouteParams = {
  fromStore: 'true';
  isNew?: 'true';
  isBarcode?: BoolString;
};

type ResultRoute = {
  pathname: '/result';
  params: ResultRouteParams;
};

export const buildResultRoute = ({
  isNew,
  isBarcode,
}: {
  isNew?: boolean;
  isBarcode?: boolean;
} = {}): ResultRoute => ({
  pathname: '/result',
  params: {
    fromStore: 'true',
    ...(isNew ? { isNew: 'true' as const } : {}),
    ...(typeof isBarcode === 'boolean' ? { isBarcode: isBarcode ? 'true' : 'false' } : {}),
  },
});
