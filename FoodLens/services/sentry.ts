import * as Sentry from '@sentry/react-native';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SENTRY_DSN = process.env['EXPO_PUBLIC_SENTRY_DSN'] ?? '';

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize Sentry for React Native.
 * Call this once at app startup (e.g., in _layout.tsx).
 *
 * Sentry is disabled in development mode (__DEV__) and when no DSN is configured.
 */
export const initSentry = () => {
  if (__DEV__) {
    console.log('[Sentry] Skipped in dev mode');
    return;
  }

  if (!SENTRY_DSN) {
    console.warn('[Sentry] No DSN configured. Error tracking disabled.');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableNativeFramesTracking: true,
    enableAutoSessionTracking: true,
    attachScreenshot: true,
    environment: __DEV__ ? 'development' : 'production',
  });

  console.log('[Sentry] Initialized');
};

// ---------------------------------------------------------------------------
// Manual capture helpers
// ---------------------------------------------------------------------------

/** Capture an error with optional context. */
export const captureError = (error: unknown, context?: Record<string, unknown>) => {
  if (__DEV__) return;

  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
};

/** Capture a warning-level message as a breadcrumb. */
export const captureWarning = (message: string, data?: Record<string, unknown>) => {
  if (__DEV__) return;
  Sentry.addBreadcrumb({
    message,
    data,
    level: 'warning',
  });
};

/** Set user context for all subsequent events. */
export const setUser = (deviceId: string) => {
  if (__DEV__) return;
  Sentry.setUser({ id: deviceId });
};

/** Wrap the root component with Sentry's error boundary. */
export const SentryErrorBoundary = Sentry.wrap;
