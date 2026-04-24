import { AnalysisRecord } from '../../../services/analysisService';
import { navigateToStoredResult } from '@/services/navigation/resultEntryNavigation';

type RouterLike = {
  navigate: (route: any) => void;
  push: (route: any) => void;
};

export const navigateToScanCamera = (router: RouterLike) => {
  router.push('/scan/camera');
};

export const navigateToEmojiPicker = (router: RouterLike) => {
  router.push('/emoji-picker');
};

export const navigateToHistory = (router: RouterLike) => {
  router.navigate('/history');
};

export const navigateToTripStats = (router: RouterLike) => {
  router.push('/trip-stats');
};

export const navigateToAllergies = (router: RouterLike) => {
  router.navigate('/allergies');
};

export const navigateToResultFromHome = (router: RouterLike, item: AnalysisRecord) => {
  navigateToStoredResult(router, item, { method: 'push' });
};
