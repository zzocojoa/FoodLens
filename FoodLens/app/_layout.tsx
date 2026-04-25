import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router as appRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { useEffect, useRef } from 'react';
import { AppState, BackHandler, Platform, ToastAndroid } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
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
import { initializeGoogleAdsRuntime } from '../services/ads/googleAdsRuntime';
import { syncReleasePresentationStateVersion } from '../services/appVersionState';
import { Colors } from '../constants/theme';

import { ThemeProvider as CustomThemeProvider } from '../contexts/ThemeContext';
import { useColorScheme } from '../hooks/use-color-scheme';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initSentry, setUser } from '../services/sentry';
import {
  shouldUseAndroidExitFlow,
  shouldExitOnSecondBack,
} from '../components/navigation/androidTopLevelNavigation';
import { useI18n } from '../features/i18n';
import { homeDashboardColors } from '../features/home/components/homeDashboardTokens';

SplashScreen.preventAutoHideAsync();

const DEVICE_ID_KEY = '@foodlens_device_id';
const I18N_PROFILE_SYNC_INTERVAL_MS = 15_000;
const CROSS_DEVICE_SYNC_INTERVAL_MS = 15_000;
export const PROFILE_SYNC_STARTUP_DELAY_MS = 5_000;
const ANDROID_TOP_LEVEL_SCREEN_OPTIONS =
  Platform.OS === 'android' ? { animation: 'none' as const } : undefined;

type AppActivePollingOptions = {
  initialDelayMs: number;
  minimumGapMs: number;
  runImmediately: boolean;
};

const shouldSkipPollingRun = (
  lastRunAtMs: number | null,
  nowMs: number,
  minimumGapMs: number
): boolean => {
  if (typeof lastRunAtMs !== 'number') {
    return false;
  }

  return nowMs - lastRunAtMs < minimumGapMs;
};

const useAppActivePolling = (
  callback: () => void,
  intervalMs: number,
  options: AppActivePollingOptions
): void => {
  const callbackRef = useRef(callback);
  const lastRunAtRef = useRef<number | null>(null);
  callbackRef.current = callback;

  useEffect(() => {
    let isMounted = true;
    let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let startupDelayEndsAtMs: number | null =
      options.runImmediately || options.initialDelayMs <= 0
        ? null
        : Date.now() + options.initialDelayMs;

    const syncNow = () => {
      if (!isMounted) return;
      const nowMs = Date.now();
      if (typeof startupDelayEndsAtMs === 'number') {
        if (nowMs < startupDelayEndsAtMs) {
          return;
        }
        startupDelayEndsAtMs = null;
      }

      if (shouldSkipPollingRun(lastRunAtRef.current, nowMs, options.minimumGapMs)) {
        return;
      }

      lastRunAtRef.current = nowMs;
      callbackRef.current();
    };

    if (options.runImmediately) {
      syncNow();
    } else if (options.initialDelayMs > 0) {
      initialTimeoutId = setTimeout(() => {
        startupDelayEndsAtMs = null;
        syncNow();
      }, options.initialDelayMs);
    }

    const intervalId = setInterval(syncNow, intervalMs);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncNow();
      }
    });

    return () => {
      isMounted = false;
      if (initialTimeoutId) {
        clearTimeout(initialTimeoutId);
      }
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [intervalMs, options.initialDelayMs, options.minimumGapMs, options.runImmediately]);
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
  const colorScheme = useColorScheme();
  const { t } = useI18n();
  const pathname = usePathname();
  const lastAndroidBackPressAtRef = useRef<number>(0);
  const androidProfileEditScreenOptions =
    Platform.OS === 'android'
      ? {
          animation: 'none' as const,
          contentStyle: {
            backgroundColor:
              colorScheme === 'dark' ? Colors.dark.background : homeDashboardColors.paper,
          },
        }
      : undefined;
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
  }, I18N_PROFILE_SYNC_INTERVAL_MS, {
    initialDelayMs: PROFILE_SYNC_STARTUP_DELAY_MS,
    minimumGapMs: PROFILE_SYNC_STARTUP_DELAY_MS,
    runImmediately: false,
  });

  useAppActivePolling(() => {
    runWithAuthenticatedUser((userId) => {
      void AnalysisService.syncHistoryFromCloud(userId, { force: false });
    });
  }, CROSS_DEVICE_SYNC_INTERVAL_MS, {
    initialDelayMs: PROFILE_SYNC_STARTUP_DELAY_MS,
    minimumGapMs: PROFILE_SYNC_STARTUP_DELAY_MS,
    runImmediately: false,
  });

  useAppActivePolling(() => {
    runWithAuthenticatedUser((userId) => {
      void UserService.syncProfileFromCloud(userId, { force: false }).then(() => {
        void syncI18nSettingsFromProfile({ pullFromServer: false });
      });
    });
  }, CROSS_DEVICE_SYNC_INTERVAL_MS, {
    initialDelayMs: PROFILE_SYNC_STARTUP_DELAY_MS,
    minimumGapMs: PROFILE_SYNC_STARTUP_DELAY_MS,
    runImmediately: false,
  });

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
          setUser(restoredSession.user.id);
          try {
            await syncReleasePresentationStateVersion(restoredSession.user.id, new Date());
          } catch (error) {
            console.error('[AppVersionState] Release presentation migration failed', {
              request_id: `app-version-state-${Date.now().toString(36)}`,
              user_id: restoredSession.user.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          startPhase2SyncRuntime();
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

  useEffect(() => {
    void initializeGoogleAdsRuntime();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    lastAndroidBackPressAtRef.current = 0;

    const onBackPress = () => {
      if (appRouter.canGoBack()) {
        appRouter.back();
        return true;
      }

      if (!shouldUseAndroidExitFlow(pathname, false)) {
        return false;
      }

      const nowMs = Date.now();
      if (shouldExitOnSecondBack(nowMs, lastAndroidBackPressAtRef.current)) {
        BackHandler.exitApp();
        return true;
      }

      lastAndroidBackPressAtRef.current = nowMs;
      ToastAndroid.show(
        t('bottomNav.exitPrompt', '뒤로가기를 한 번 더 누르면 앱이 종료됩니다.'),
        ToastAndroid.SHORT,
      );
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => {
      subscription.remove();
    };
  }, [pathname, t]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="camera" options={{ animation: 'none' }} />
            <Stack.Screen name="result" options={{ animation: 'fade_from_bottom' }} />
            <Stack.Screen name="health-profile" />
            <Stack.Screen name="profile-edit" options={androidProfileEditScreenOptions} />
            <Stack.Screen name="emoji-picker" />
            <Stack.Screen name="oauth/google-callback" options={{ animation: 'none' }} />
            <Stack.Screen name="oauth/kakao-callback" options={{ animation: 'none' }} />
            <Stack.Screen name="(tabs)" options={ANDROID_TOP_LEVEL_SCREEN_OPTIONS} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <QueryClientProvider client={queryClient}>
        <CustomThemeProvider>
          <LayoutContent />
        </CustomThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
