import { Router } from 'expo-router';
import type { AnalysisStoreNavigableRecord } from '@/services/contracts/analysisStore';
import { navigateToStoredResult } from '@/services/navigation/resultEntryNavigation';

export const navigateToResultFromHistory = (router: Router, record: AnalysisStoreNavigableRecord) => {
  navigateToStoredResult(router, record, { method: 'push' });
};
