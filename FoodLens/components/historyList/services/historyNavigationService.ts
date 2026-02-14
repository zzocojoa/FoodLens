import { Router } from 'expo-router';
import { dataStore } from '@/services/dataStore';
import { buildResultRoute } from '@/features/result/services/resultNavigationService';

export const navigateToResultFromHistory = (router: Router, record: any) => {
  dataStore.setData(record, record.location, record.imageUri || '');
  router.push(buildResultRoute({ isBarcode: !!record?.isBarcode }));
};
