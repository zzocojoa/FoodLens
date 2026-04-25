import { AnalysisRecord } from '../../../services/analysisService';
import { navigateToStoredResult } from '@/services/navigation/resultEntryNavigation';
import { markHomeNavigationTrace } from './homeNavigationTrace';

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
  markHomeNavigationTrace('history', 'navigation_dispatch');
  router.navigate('/history');
};

export const navigateToTripStats = (router: RouterLike) => {
  markHomeNavigationTrace('trip_stats', 'navigation_dispatch');
  router.navigate('/trip-stats');
};

export const navigateToAllergies = (router: RouterLike) => {
  markHomeNavigationTrace('allergies', 'navigation_dispatch');
  router.navigate('/allergies');
};

export const navigateToResultFromHome = (router: RouterLike, item: AnalysisRecord) => {
  navigateToStoredResult(router, item, { method: 'push' });
};
