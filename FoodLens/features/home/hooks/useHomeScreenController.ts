import React from 'react';
import { Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { FloatingEmojisHandle } from '../../../components/FloatingEmojis';
import { HapticsService } from '../../../services/haptics';
import { useHomeDashboard } from './useHomeDashboard';
import {
  navigateToAllergies,
  navigateToEmojiPicker,
  navigateToHistory,
  navigateToResultFromHome,
  navigateToScanCamera,
  navigateToTripStats,
} from '../services/homeNavigationService';

export const useHomeScreenController = () => {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { isConnected } = useNetworkStatus();
  const dashboard = useHomeDashboard();

  const floatingEmojisRef = React.useRef<FloatingEmojisHandle>(null);
  const orbAnim = React.useRef(new Animated.Value(1)).current;

  const handleAppleMotion = React.useCallback(() => {
    floatingEmojisRef.current?.trigger();
  }, []);

  React.useEffect(() => {
    Animated.spring(orbAnim, {
      toValue: dashboard.activeModal === 'PROFILE' ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [dashboard.activeModal, orbAnim]);

  const handleOpenProfile = React.useCallback(() => {
    HapticsService.medium();
    dashboard.setActiveModal('PROFILE');
  }, [dashboard]);

  const handleOpenEmojiPicker = React.useCallback(() => {
    HapticsService.light();
    navigateToEmojiPicker(router);
  }, [router]);

  const handleStartAnalysis = React.useCallback(() => {
    HapticsService.tickTick();
    navigateToScanCamera(router);
  }, [router]);

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
    floatingEmojisRef,
    orbAnim,
    dashboard,
    handleAppleMotion,
    handleOpenProfile,
    handleOpenEmojiPicker,
    handleStartAnalysis,
    handleOpenHistory,
    handleOpenResult,
    handleOpenTripStats,
    handleOpenAllergies,
  };
};
