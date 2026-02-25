import { AnalysisRecord } from '../../../services/analysisService_Logic';
import { navigateToStoredResult } from '@/services/navigation/resultEntryNavigation_Logic';

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
  navigateToStoredResult(router, item, { method: 'push' });
};
