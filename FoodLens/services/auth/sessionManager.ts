import { AuthApi, AuthApiError, AuthSessionTokens } from './authApi_Logic';
import { AuthSecureSessionStore } from './secureSessionStore_Logic';
import { clearCurrentUserId, getCurrentUserId, hasAuthenticatedUser, setCurrentUserId } from './currentUser_Logic';
import { queryClient } from '../queryClient';

const REFRESH_SKEW_MS = 30_000;
const BOOTSTRAP_REQUEST_ID = `auth-bootstrap-${Date.now().toString(36)}`;

const isAccessTokenExpired = (session: AuthSessionTokens): boolean => {
  const expiresAt = session.issuedAt + session.expiresIn * 1000;
  return Date.now() >= expiresAt - REFRESH_SKEW_MS;
};

const clearSessionScopedCaches = (): void => {
  queryClient.clear();
};

type PersistSessionOptions = {
  rememberMe?: boolean;
};

type RestoreSessionOptions = {
  clearCurrentUserOnMissing?: boolean;
  logWarnings?: boolean;
  refreshIfExpired?: boolean;
};

export const persistSession = async (
  session: AuthSessionTokens,
  options: PersistSessionOptions = {}
): Promise<void> => {
  const persist = options.rememberMe !== false;
  if (hasAuthenticatedUser() && getCurrentUserId() !== session.user.id) {
    clearSessionScopedCaches();
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
  clearSessionScopedCaches();
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
          code: error.code,
          status: error.status,
          requestId: error.requestId,
        });
      } else {
        console.warn('[AuthSession] Failed to refresh session', {
          request_id: BOOTSTRAP_REQUEST_ID,
          user_id: stored.user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (clearCurrentUserOnMissing) {
      await clearSession();
    }
    return null;
  }
};
