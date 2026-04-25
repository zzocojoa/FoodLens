import React from 'react';
import { useRouter } from 'expo-router';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useHomeDashboard } from './useHomeDashboard';
import {
  navigateToAllergies,
  navigateToHistory,
  navigateToResultFromHome,
  navigateToTripStats,
} from '../services/homeNavigationService';
import { markHomeNavigationTrace } from '../services/homeNavigationTrace';

export const useHomeScreenController = () => {
  const router = useRouter();
  const { isConnected } = useNetworkStatus();
  const dashboard = useHomeDashboard();

  React.useEffect(() => {
    router.prefetch('/trip-stats');
  }, [router]);

  const handleOpenHistory = React.useCallback(() => {
    markHomeNavigationTrace('history', 'handler_entry');
    navigateToHistory(router);
  }, [router]);

  const handleOpenResult = React.useCallback(
    (item: Parameters<typeof navigateToResultFromHome>[1]) => {
      navigateToResultFromHome(router, item);
    },
    [router]
  );

  const handleOpenTripStats = React.useCallback(() => {
    markHomeNavigationTrace('trip_stats', 'handler_entry');
    navigateToTripStats(router);
  }, [router]);

  const handleOpenAllergies = React.useCallback(() => {
    markHomeNavigationTrace('allergies', 'handler_entry');
    navigateToAllergies(router);
  }, [router]);

  return {
    isConnected,
    dashboard,
    handleOpenHistory,
    handleOpenResult,
    handleOpenTripStats,
    handleOpenAllergies,
  };
};
