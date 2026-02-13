import { AnalysisRecord } from '../../../services/analysisService';
import { dataStore } from '../../../services/dataStore';

type RouterLike = {
  push: (route: any) => void;
};

export const navigateToScanCamera = (router: RouterLike) => {
  router.push('/scan/camera');
};

export const navigateToEmojiPicker = (router: RouterLike) => {
  router.push('/emoji-picker');
};

export const navigateToHistory = (router: RouterLike) => {
  router.push('/history');
};

export const navigateToTripStats = (router: RouterLike) => {
  router.push('/trip-stats');
};

export const navigateToAllergies = (router: RouterLike) => {
  router.push('/allergies');
};

export const navigateToResultFromHome = (router: RouterLike, item: AnalysisRecord) => {
  dataStore.setData(item, item.location, item.imageUri || '');
  router.push({
    pathname: '/result',
    params: {
      fromStore: 'true',
      isBarcode: item.isBarcode ? 'true' : 'false',
    },
  });
};
