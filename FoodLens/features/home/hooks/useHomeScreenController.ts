import React from 'react';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useHomeDashboard } from './useHomeDashboard';
import {
  navigateToAllergies,
  navigateToHistory,
  navigateToResultFromHome,
  navigateToTripStats,
} from '../services/homeNavigationService';

export const useHomeScreenController = () => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { isConnected } = useNetworkStatus();
  const dashboard = useHomeDashboard();

  const handleOpenHistory = React.useCallback(() => {
    navigateToHistory(router);
  }, [router]);

  const handleOpenResult = React.useCallback(
    (item: Parameters<typeof navigateToResultFromHome>[1]) => {
      navigateToResultFromHome(router, item);
    },
    [router]
  );

  const handleOpenTripStats = React.useCallback(() => {
    navigateToTripStats(router);
  }, [router]);

  const handleOpenAllergies = React.useCallback(() => {
    navigateToAllergies(router);
  }, [router]);

  return {
    colorScheme,
    theme,
    isConnected,
    dashboard,
    handleOpenHistory,
    handleOpenResult,
    handleOpenTripStats,
    handleOpenAllergies,
  };
};
