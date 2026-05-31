import { dispatchPhase2SyncQueue } from '@/services/sync/phase2SyncQueue';

import { AuthApi, AuthApiError } from './authApi';
import { AuthSecureSessionStore } from './secureSessionStore';
import { clearLocalLogoutFootprint } from './localFootprint';
import { logoutFromOAuthProvider } from './providerLogout';

const SERVER_LOGOUT_MAX_ATTEMPTS = 2;

export type FoodLensLogoutFailureReason = 'server_logout_failed' | 'local_clear_failed';

export type FoodLensLogoutSuccess = {
  status: 'success';
  requestId: string;
  userId: string;
  provider: string | undefined;
  preLogoutSyncFlushFailed: boolean;
};

export type FoodLensLogoutFailure = {
  status: 'failure';
  reason: FoodLensLogoutFailureReason;
  requestId: string;
  userId: string;
  provider: string | undefined;
  preLogoutSyncFlushFailed: boolean;
  error: unknown;
};

export type FoodLensLogoutResult = FoodLensLogoutSuccess | FoodLensLogoutFailure;

type LogoutErrorLogFields = {
  error: string;
  code?: string;
  status?: number;
  server_request_id?: string;
};

type ServerLogoutInput = {
  accessToken: string;
  refreshToken: string;
  requestId: string;
  userId: string;
  provider: string | undefined;
};

const createLogoutRequestId = (): string => `auth-logout-${Date.now().toString(36)}`;

const toLogoutErrorLogFields = (error: unknown): LogoutErrorLogFields => {
  if (error instanceof AuthApiError) {
    return {
      error: error.message,
      code: error.code,
      status: error.status,
      server_request_id: error.requestId,
    };
  }

  return {
    error: error instanceof Error ? error.message : String(error),
  };
};

const warnPreLogoutSyncFlushFailure = (input: {
  requestId: string;
  userId: string;
  error: unknown;
}): void => {
  console.warn('[Phase2Sync] Pre-logout queue flush failed', {
    request_id: input.requestId,
    user_id: input.userId,
    phase: 'pre_logout_sync_flush',
    ...toLogoutErrorLogFields(input.error),
  });
};

const warnServerLogoutFailure = (input: {
  requestId: string;
  userId: string;
  provider: string | undefined;
  error: unknown;
}): void => {
  console.warn('[AuthSession] FoodLens server logout failed', {
    request_id: input.requestId,
    user_id: input.userId,
    provider: input.provider ?? 'none',
    phase: 'server_refresh_token_revoke',
    ...toLogoutErrorLogFields(input.error),
  });
};

const warnServerLogoutRetry = (input: {
  requestId: string;
  userId: string;
  provider: string | undefined;
  attempt: number;
  error: unknown;
}): void => {
  console.warn('[AuthSession] Retrying FoodLens server logout', {
    request_id: input.requestId,
    user_id: input.userId,
    provider: input.provider ?? 'none',
    phase: 'server_refresh_token_revoke',
    attempt: input.attempt,
    ...toLogoutErrorLogFields(input.error),
  });
};

const warnProviderLogoutFailure = (input: {
  requestId: string;
  userId: string;
  provider: string | undefined;
  error: unknown;
}): void => {
  console.warn('[AuthSession] Provider logout failed after FoodLens logout', {
    request_id: input.requestId,
    user_id: input.userId,
    provider: input.provider ?? 'none',
    phase: 'provider_logout',
    ...toLogoutErrorLogFields(input.error),
  });
};

const errorLocalLogoutFootprintFailure = (input: {
  requestId: string;
  provider: string | undefined;
  error: unknown;
}): void => {
  console.error('[AuthSession] Local logout footprint wipe failed', {
    request_id: input.requestId,
    provider: input.provider ?? 'none',
    ...toLogoutErrorLogFields(input.error),
  });
};

const isRetryableServerLogoutError = (error: unknown): boolean => {
  if (!(error instanceof AuthApiError)) {
    return false;
  }

  return error.code === 'AUTH_TIMEOUT' || error.code === 'AUTH_NETWORK_ERROR' || error.status >= 500;
};

const logoutFromFoodLensServer = async (input: ServerLogoutInput): Promise<void> => {
  for (let attempt = 1; attempt <= SERVER_LOGOUT_MAX_ATTEMPTS; attempt += 1) {
    try {
      await AuthApi.logout({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
      });
      return;
    } catch (error) {
      const shouldRetry = attempt < SERVER_LOGOUT_MAX_ATTEMPTS && isRetryableServerLogoutError(error);
      if (!shouldRetry) {
        throw error;
      }

      warnServerLogoutRetry({
        requestId: input.requestId,
        userId: input.userId,
        provider: input.provider,
        attempt,
        error,
      });
    }
  }
};

export const runFoodLensLogoutFlow = async (): Promise<FoodLensLogoutResult> => {
  const requestId = createLogoutRequestId();
  const storedSession = await AuthSecureSessionStore.read();
  const userId = storedSession?.user?.id ?? 'unknown';
  const provider = storedSession?.user?.provider;
  let preLogoutSyncFlushFailed = false;

  try {
    await dispatchPhase2SyncQueue();
  } catch (error) {
    preLogoutSyncFlushFailed = true;
    warnPreLogoutSyncFlushFailure({
      requestId,
      userId,
      error,
    });
  }

  if (storedSession) {
    try {
      await logoutFromFoodLensServer({
        accessToken: storedSession.accessToken,
        refreshToken: storedSession.refreshToken,
        requestId,
        userId,
        provider,
      });
    } catch (error) {
      warnServerLogoutFailure({
        requestId,
        userId,
        provider,
        error,
      });
      return {
        status: 'failure',
        reason: 'server_logout_failed',
        requestId,
        userId,
        provider,
        preLogoutSyncFlushFailed,
        error,
      };
    }
  }

  try {
    await clearLocalLogoutFootprint();
  } catch (error) {
    errorLocalLogoutFootprintFailure({
      requestId,
      provider,
      error,
    });
    return {
      status: 'failure',
      reason: 'local_clear_failed',
      requestId,
      userId,
      provider,
      preLogoutSyncFlushFailed,
      error,
    };
  }

  return {
    status: 'success',
    requestId,
    userId,
    provider,
    preLogoutSyncFlushFailed,
  };
};

export const startProviderLogoutAfterFoodLensLogout = (logout: FoodLensLogoutSuccess): void => {
  void logoutFromOAuthProvider(logout.provider).catch((error) => {
    warnProviderLogoutFailure({
      requestId: logout.requestId,
      userId: logout.userId,
      provider: logout.provider,
      error,
    });
  });
};
