import { buildResultRoute } from '@/services/contracts/resultRoute';
import type { AnalysisStoreNavigableRecord } from '@/services/contracts/analysisStore';
import { dataStore } from '@/services/dataStore';

type RouterLike = {
  push: (route: any) => void;
  replace?: (route: any) => void;
};

type NavigationMethod = 'push' | 'replace';

type NavigateToResultOptions = {
  method?: NavigationMethod;
  isBarcode?: boolean;
};

const normalizeTimestamp = (timestamp?: string | Date): string | undefined => {
  if (!timestamp) return undefined;
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
};

const resolveImageUri = (imageUri?: string): string => imageUri || '';

export const navigateToStoredResult = (
  router: RouterLike,
  record: AnalysisStoreNavigableRecord,
  options: NavigateToResultOptions = {}
) => {
  dataStore.setData(
    record,
    record.location ?? null,
    resolveImageUri(record.imageUri),
    normalizeTimestamp(record.timestamp)
  );

  const route = buildResultRoute({ isBarcode: options.isBarcode ?? !!record.isBarcode });
  const method: NavigationMethod = options.method ?? 'push';

  if (method === 'replace' && typeof router.replace === 'function') {
    router.replace(route);
    return;
  }

  router.push(route);
};
