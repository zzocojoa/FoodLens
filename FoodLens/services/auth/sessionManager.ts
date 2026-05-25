import { AuthApi, AuthApiError, AuthSessionTokens } from './authApi';
import { AuthSecureSessionStore } from './secureSessionStore';
import { clearCurrentUserId, getCurrentUserId, hasAuthenticatedUser, setCurrentUserId } from './currentUser';
import { clearOAuthPendingStates } from './oauthProvider';
import { queryClient } from '../queryClient';
import { SafeStorage } from '../storage';
import { USER_STORAGE_KEY } from '../user/constants';

const REFRESH_SKEW_MS = 30_000;
const BOOTSTRAP_REQUEST_ID = `auth-bootstrap-${Date.now().toString(36)}`;

const isAccessTokenExpired = (session: AuthSessionTokens): boolean => {
  const expiresAt = session.issuedAt + session.expiresIn * 1000;
  return Date.now() >= expiresAt - REFRESH_SKEW_MS;
};

const clearSessionScopedCaches = (): void => {
  queryClient.clear();
};

const clearLegacyProfileSnapshot = async (): Promise<void> => {
  await SafeStorage.remove(USER_STORAGE_KEY);
};

type PersistSessionOptions = {
  rememberMe?: boolean;
};

type RestoreSessionOptions = {
  clearCurrentUserOnMissing?: boolean;
  logWarnings?: boolean;
  refreshIfExpired?: boolean;
};

type RefreshSessionOptions = {
  clearOnFailure?: boolean;
  logWarnings?: boolean;
  reason?: string;
};

const TERMINAL_REFRESH_ERROR_CODES = new Set([
  'AUTH_REFRESH_INVALID',
  'AUTH_REFRESH_REUSED',
  'AUTH_REFRESH_EXPIRED',
  'AUTH_SESSION_REVOKED',
]);

const shouldForceClearOnRefreshFailure = (error: unknown): boolean => {
  if (!(error instanceof AuthApiError)) return false;
  if (TERMINAL_REFRESH_ERROR_CODES.has(error.code)) return true;
  return error.status === 401 && error.code !== 'AUTH_TIMEOUT' && error.code !== 'AUTH_NETWORK_ERROR';
};

let refreshInFlight: Promise<AuthSessionTokens | null> | null = null;

export const persistSession = async (
  session: AuthSessionTokens,
  options: PersistSessionOptions = {}
): Promise<void> => {
  const persist = options.rememberMe !== false;
  if (hasAuthenticatedUser() && getCurrentUserId() !== session.user.id) {
    clearSessionScopedCaches();
    await clearLegacyProfileSnapshot();
    await clearOAuthPendingStates();
  }
  if (persist) {
    await AuthSecureSessionStore.write(session);
  } else {
    await AuthSecureSessionStore.write(session, { persist: false });
  }
  await setCurrentUserId(session.user.id);
};

export const clearSession = async (): Promise<void> => {
  await AuthSecureSessionStore.clear();
  await clearCurrentUserId();
  await clearLegacyProfileSnapshot();
  await clearOAuthPendingStates();
  clearSessionScopedCaches();
};

const runRefreshNow = async (options: RefreshSessionOptions = {}): Promise<AuthSessionTokens | null> => {
  const clearOnFailure = options.clearOnFailure !== false;
  const logWarnings = options.logWarnings !== false;
  const reason = options.reason || 'manual';
  let stored: AuthSessionTokens | null = null;
  try {
    stored = await AuthSecureSessionStore.read();
  } catch (error) {
    if (logWarnings) {
      console.warn('[AuthSession] Secure storage unavailable during refresh', {
        request_id: BOOTSTRAP_REQUEST_ID,
        user_id: 'unknown',
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (clearOnFailure) {
      await clearSession();
    }
    return null;
  }

  if (!stored) {
    if (clearOnFailure) {
      await clearSession();
    }
    return null;
  }

  try {
    const refreshed = await AuthApi.refresh(stored.refreshToken);
    await persistSession(refreshed);
    return refreshed;
  } catch (error) {
    if (logWarnings) {
      if (error instanceof AuthApiError) {
        console.warn('[AuthSession] Failed to refresh session', {
          request_id: BOOTSTRAP_REQUEST_ID,
          user_id: stored.user.id,
          reason,
          code: error.code,
          status: error.status,
          requestId: error.requestId,
        });
      } else {
        console.warn('[AuthSession] Failed to refresh session', {
          request_id: BOOTSTRAP_REQUEST_ID,
          user_id: stored.user.id,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (clearOnFailure || shouldForceClearOnRefreshFailure(error)) {
      await clearSession();
    }
    return null;
  }
};

export const refreshSessionNow = async (
  options: RefreshSessionOptions = {}
): Promise<AuthSessionTokens | null> => {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = runRefreshNow(options).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

export const restoreSession = async (
  options: RestoreSessionOptions = {}
): Promise<AuthSessionTokens | null> => {
  const clearCurrentUserOnMissing = options.clearCurrentUserOnMissing !== false;
  const logWarnings = options.logWarnings !== false;
  const refreshIfExpired = options.refreshIfExpired !== false;
  let stored: AuthSessionTokens | null = null;
  try {
    stored = await AuthSecureSessionStore.read();
  } catch (error) {
    if (logWarnings) {
      console.warn('[AuthSession] Secure storage unavailable during bootstrap', {
        request_id: BOOTSTRAP_REQUEST_ID,
        user_id: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (clearCurrentUserOnMissing) {
      await clearCurrentUserId();
    }
    return null;
  }
  if (!stored) {
    if (clearCurrentUserOnMissing) {
      await clearCurrentUserId();
    }
    return null;
  }

  if (!isAccessTokenExpired(stored)) {
    await setCurrentUserId(stored.user.id);
    return stored;
  }

  if (!refreshIfExpired) {
    return null;
  }
  return refreshSessionNow({
    clearOnFailure: clearCurrentUserOnMissing,
    logWarnings,
    reason: 'restore-expired',
  });
};
