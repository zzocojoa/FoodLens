import { AuthApi, AuthApiError, AuthSessionTokens } from './authApi';
import { AuthSecureSessionStore } from './secureSessionStore';
import { clearCurrentUserId, getCurrentUserId, hasAuthenticatedUser, setCurrentUserId } from './currentUser';
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

export const persistSession = async (session: AuthSessionTokens): Promise<void> => {
  if (hasAuthenticatedUser() && getCurrentUserId() !== session.user.id) {
    clearSessionScopedCaches();
  }
  await AuthSecureSessionStore.write(session);
  await setCurrentUserId(session.user.id);
};

export const clearSession = async (): Promise<void> => {
  await AuthSecureSessionStore.clear();
  await clearCurrentUserId();
  clearSessionScopedCaches();
};

export const restoreSession = async (): Promise<AuthSessionTokens | null> => {
  let stored: AuthSessionTokens | null = null;
  try {
    stored = await AuthSecureSessionStore.read();
  } catch (error) {
    console.warn('[AuthSession] Secure storage unavailable during bootstrap', {
      request_id: BOOTSTRAP_REQUEST_ID,
      user_id: 'unknown',
      error: error instanceof Error ? error.message : String(error),
    });
    await clearCurrentUserId();
    return null;
  }
  if (!stored) {
    await clearCurrentUserId();
    return null;
  }

  if (!isAccessTokenExpired(stored)) {
    await setCurrentUserId(stored.user.id);
    return stored;
  }

  try {
    const refreshed = await AuthApi.refresh(stored.refreshToken);
    await persistSession(refreshed);
    return refreshed;
  } catch (error) {
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
    await clearSession();
    return null;
  }
};
