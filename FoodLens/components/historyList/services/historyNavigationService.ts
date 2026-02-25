import { Router } from 'expo-router';
import type { AnalysisStoreNavigableRecord } from '@/services/contracts/analysisStore_Structure';
import { navigateToStoredResult } from '@/services/navigation/resultEntryNavigation_Logic';

export const navigateToResultFromHistory = (router: Router, record: AnalysisStoreNavigableRecord) => {
  navigateToStoredResult(router, record, { method: 'push' });
};
