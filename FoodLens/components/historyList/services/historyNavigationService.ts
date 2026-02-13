import { Router } from 'expo-router';
import { dataStore } from '@/services/dataStore';

export const navigateToResultFromHistory = (router: Router, record: any) => {
  dataStore.setData(record, record.location, record.imageUri || '');
  router.push({
    pathname: '/result',
    params: {
      fromStore: 'true',
      isBarcode: record?.isBarcode ? 'true' : 'false',
    },
  });
};
