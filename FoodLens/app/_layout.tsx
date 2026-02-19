import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router as appRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../services/queryClient';
import { SafeStorage, initializeSafeStorage, hasSeenOnboarding } from '../services/storage';
import { cleanupOrphanedImages } from '../services/imageStorage';
import { clearSession, restoreSession } from '../services/auth/sessionManager';

import { useTheme, ThemeProvider as CustomThemeProvider } from '../contexts/ThemeContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initSentry, setUser } from '../services/sentry';

SplashScreen.preventAutoHideAsync();

const DEVICE_ID_KEY = '@foodlens_device_id';

// Generate or retrieve a persistent device ID
const initializeDeviceId = async () => {
  try {
    let deviceId = await SafeStorage.get<string | null>(DEVICE_ID_KEY, null);
    if (!deviceId) {
      deviceId = 'device_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
      await SafeStorage.set(DEVICE_ID_KEY, deviceId);
      console.log(`[AUTH] Created new device ID: ${deviceId}`);
    } else {
      console.log(`[AUTH] Using existing device ID: ${deviceId}`);
    }
    return deviceId;
  } catch (error) {
    console.error('[AUTH] Failed to initialize device ID:', error);
    return 'fallback_device_id';
  }
};

export const unstable_settings = {
  anchor: '(tabs)',
};

function LayoutContent() {
  const { colorScheme } = useTheme();

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      let nextRoute: '/login' | '/onboarding' | null = null;
      try {
        initSentry();
        await initializeSafeStorage();
        const deviceId = await initializeDeviceId();
        const restoredSession = await restoreSession();

        if (!active) return;
        if (!restoredSession) {
          setUser(deviceId);
          nextRoute = '/login';
        } else {
          setUser(restoredSession.user.id);
          // Professional background cleanup
          cleanupOrphanedImages().catch(() => {});

          // Check onboarding status
          const seen = await hasSeenOnboarding(restoredSession.user.id);
          if (!seen) {
            nextRoute = '/onboarding';
          }
        }
      } catch (error) {
        console.error('[Auth] Session bootstrap failed', {
          request_id: `auth-layout-${Date.now().toString(36)}`,
          user_id: 'unknown',
          error: error instanceof Error ? error.message : String(error),
        });
        await clearSession().catch(() => {});
        if (!active) return;
        nextRoute = '/login';
      } finally {
        if (!active) return;
        await SplashScreen.hideAsync();
        if (nextRoute) {
          appRouter.replace(nextRoute);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="camera" options={{ animation: 'none' }} />
            <Stack.Screen name="result" options={{ animation: 'fade_from_bottom' }} />
            <Stack.Screen name="profile" />
            <Stack.Screen name="history" />
            <Stack.Screen name="trip-stats" />
            <Stack.Screen name="emoji-picker" />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <CustomThemeProvider>
        <LayoutContent />
      </CustomThemeProvider>
    </QueryClientProvider>
  );
}
