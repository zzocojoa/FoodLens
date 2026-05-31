import { AuthApi, AuthApiError, AuthSessionTokens } from './authApi';
import { AuthSecureSessionStore } from './secureSessionStore';
import { clearCurrentUserId, getCurrentUserId, hasAuthenticatedUser, setCurrentUserId } from './currentUser';
import { clearOAuthPendingStates } from './oauthProvider';
import { clearStoredAnalysesForUser } from '../analysis/storage';
import { clearAiCache } from '../aiCore/cache';
import { BarcodeCache } from '../aiCore/internal/barcodeCache';
import { clearInflightBarcodeLookups } from '../aiCore/internal/barcodeLookup';
import { clearPendingAnalysisJobForUser } from '../aiCore/pendingAnalysisStore';
import { dataStore } from '../dataStore';
import { clearManagedImagesForUser } from '../imageStorage';
import { queryClient } from '../queryClient';
import { SafeStorage } from '../storage';
import {
  clearPhase2RuntimeCaches,
  clearPhase2SyncQueueForUser,
} from '../sync/phase2SyncLocalState';
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

type AccountSwitchWipeTask = {
  name: string;
  run: () => Promise<void>;
};

type AccountSwitchWipeFailure = {
  name: string;
  error: unknown;
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

const runAccountSwitchWipeTasks = async (tasks: AccountSwitchWipeTask[]): Promise<void> => {
  const failures: AccountSwitchWipeFailure[] = [];

  for (const task of tasks) {
    try {
      await task.run();
    } catch (error) {
      failures.push({
        name: task.name,
        error,
      });
    }
  }

  if (failures.length > 0) {
    console.error('[AuthSession] Account switch local footprint wipe failed', {
      failedTasks: failures.map((failure) => failure.name),
      errors: failures.map((failure) => ({
        task: failure.name,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
      })),
    });
    throw new Error(`Account switch local footprint wipe failed: ${failures.map((failure) => failure.name).join(', ')}`);
  }
};

const clearAccountSwitchLocalFootprint = async (previousUserId: string): Promise<void> => {
  clearSessionScopedCaches();
  clearInflightBarcodeLookups();
  clearPhase2RuntimeCaches();
  await runAccountSwitchWipeTasks([
    {
      name: 'dataStore.clear',
      run: () => dataStore.clear(),
    },
    {
      name: 'clearOAuthPendingStates',
      run: clearOAuthPendingStates,
    },
    {
      name: 'clearPendingAnalysisJobForUser',
      run: () => clearPendingAnalysisJobForUser(previousUserId),
    },
    {
      name: 'clearAiCache',
      run: clearAiCache,
    },
    {
      name: 'BarcodeCache.clear',
      run: () => BarcodeCache.clear(),
    },
    {
      name: 'clearPhase2SyncQueueForUser',
      run: () => clearPhase2SyncQueueForUser(previousUserId),
    },
    {
      name: 'clearManagedImagesForUser',
      run: () => clearManagedImagesForUser(previousUserId),
    },
  ]);
  await runAccountSwitchWipeTasks([
    {
      name: 'clearStoredAnalysesForUser',
      run: () => clearStoredAnalysesForUser(previousUserId),
    },
    {
      name: 'clearLegacyProfileSnapshot',
      run: clearLegacyProfileSnapshot,
    },
  ]);
};

export const persistSession = async (
  session: AuthSessionTokens,
  options: PersistSessionOptions = {}
): Promise<void> => {
  const persist = options.rememberMe !== false;
  if (hasAuthenticatedUser() && getCurrentUserId() !== session.user.id) {
    await clearAccountSwitchLocalFootprint(getCurrentUserId());
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
