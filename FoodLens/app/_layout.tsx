import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router as appRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../services/queryClient';
import { SafeStorage, initializeSafeStorage } from '../services/storage';
import { cleanupOrphanedImages } from '../services/imageStorage';
import { clearSession, restoreSession } from '../services/auth/sessionManager';
import { getCurrentUserIdSnapshot } from '../services/auth/currentUser';
import { startPhase2SyncRuntime } from '../services/sync/phase2SyncQueue';
import { hasCompletedOnboarding } from '../services/onboardingGateService';
import { syncI18nSettingsFromProfile } from '../features/i18n/services/i18nStore';
import { AnalysisService } from '../services/analysisService';
import { UserService } from '../services/userService';

import { useTheme, ThemeProvider as CustomThemeProvider } from '../contexts/ThemeContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initSentry, setUser } from '../services/sentry';

SplashScreen.preventAutoHideAsync();

const DEVICE_ID_KEY = '@foodlens_device_id';
const I18N_PROFILE_SYNC_INTERVAL_MS = 15_000;
const CROSS_DEVICE_SYNC_INTERVAL_MS = 15_000;

const useAppActivePolling = (callback: () => void, intervalMs: number): void => {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let isMounted = true;

    const syncNow = () => {
      if (!isMounted) return;
      callbackRef.current();
    };

    syncNow();
    const intervalId = setInterval(syncNow, intervalMs);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncNow();
      }
    });

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [intervalMs]);
};

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
  const runWithAuthenticatedUser = (run: (userId: string) => void | Promise<void>) => {
    const userId = getCurrentUserIdSnapshot();
    if (userId && userId !== 'auth-required') {
      void Promise.resolve(run(userId)).catch(() => {});
      return;
    }

    void restoreSession({
      clearCurrentUserOnMissing: false,
      logWarnings: false,
      refreshIfExpired: true,
    })
      .then((session) => {
        const recoveredUserId = session?.user?.id;
        if (!recoveredUserId) return;
        void Promise.resolve(run(recoveredUserId)).catch(() => {});
      })
      .catch(() => {});
  };

  useAppActivePolling(() => {
    // Keep i18n in sync globally even when user stays off profile-related screens.
    void syncI18nSettingsFromProfile({ pullFromServer: true });
  }, I18N_PROFILE_SYNC_INTERVAL_MS);

  useAppActivePolling(() => {
    runWithAuthenticatedUser((userId) => {
      void AnalysisService.syncHistoryFromCloud(userId, { force: false });
    });
  }, CROSS_DEVICE_SYNC_INTERVAL_MS);

  useAppActivePolling(() => {
    runWithAuthenticatedUser((userId) => {
      void UserService.syncProfileFromCloud(userId, { force: false }).then(() => {
        void syncI18nSettingsFromProfile({ pullFromServer: false });
      });
    });
  }, CROSS_DEVICE_SYNC_INTERVAL_MS);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      let nextRoute: '/login' | '/onboarding' | '/(tabs)' | null = null;
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
          startPhase2SyncRuntime();
          setUser(restoredSession.user.id);
          // Professional background cleanup
          cleanupOrphanedImages().catch(() => {});

          // Check onboarding status
          const seen = await hasCompletedOnboarding(restoredSession.user.id);
          nextRoute = seen ? '/(tabs)' : '/onboarding';
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
        if (nextRoute) {
          appRouter.replace(nextRoute);
          // Keep splash visible until the router applies replacement to avoid stale-route flashes.
          await Promise.resolve();
        }
        await SplashScreen.hideAsync();
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
            <Stack.Screen name="oauth/google-callback" options={{ animation: 'none' }} />
            <Stack.Screen name="oauth/kakao-callback" options={{ animation: 'none' }} />
          </Stack>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <CustomThemeProvider>
          <LayoutContent />
        </CustomThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
