import { useEffect } from 'react';
import { router } from 'expo-router';
import { restoreSession } from '../services/auth/sessionManager';
import { hasCompletedOnboarding } from '../services/onboardingGateService';

type AppEntryRoute = '/login' | '/onboarding' | '/(tabs)';

const resolveRootRoute = async (): Promise<AppEntryRoute> => {
  const restoredSession = await restoreSession({
    clearCurrentUserOnMissing: false,
    logWarnings: false,
    refreshIfExpired: true,
  });

  if (!restoredSession?.user?.id) {
    return '/login';
  }

  const hasSeenOnboarding = await hasCompletedOnboarding(restoredSession.user.id);
  return hasSeenOnboarding ? '/(tabs)' : '/onboarding';
};

export default function Index() {
  useEffect(() => {
    let active = true;

    const redirectToEntryRoute = async (): Promise<void> => {
      try {
        const nextRoute = await resolveRootRoute();
        if (!active) {
          return;
        }
        router.replace(nextRoute);
      } catch (error) {
        console.error('[RootIndex] Failed to resolve deeplink entry route', {
          request_id: `root-index-${Date.now().toString(36)}`,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!active) {
          return;
        }
        router.replace('/login');
      }
    };

    void redirectToEntryRoute();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
