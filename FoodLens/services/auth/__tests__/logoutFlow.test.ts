jest.mock('../authApi', () => ({
  AuthApi: {
    logout: jest.fn(),
  },
  AuthApiError: class MockAuthApiError extends Error {
    code: string;
    status: number;
    requestId?: string;

    constructor(message: string, code: string, status: number, requestId?: string) {
      super(message);
      this.name = 'AuthApiError';
      this.code = code;
      this.status = status;
      this.requestId = requestId;
    }
  },
}));

jest.mock('../secureSessionStore', () => ({
  AuthSecureSessionStore: {
    read: jest.fn(),
  },
}));

jest.mock('../localFootprint', () => ({
  clearLocalLogoutFootprint: jest.fn(),
}));

jest.mock('../providerLogout', () => ({
  logoutFromOAuthProvider: jest.fn(),
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  dispatchPhase2SyncQueue: jest.fn(),
}));

import { AuthApi, AuthApiError } from '../authApi';
import type { AuthSessionTokens } from '../authApi';
import { AuthSecureSessionStore } from '../secureSessionStore';
import { clearLocalLogoutFootprint } from '../localFootprint';
import { logoutFromOAuthProvider } from '../providerLogout';
import { dispatchPhase2SyncQueue } from '@/services/sync/phase2SyncQueue';
import {
  runFoodLensLogoutFlow,
  startProviderLogoutAfterFoodLensLogout,
} from '../logoutFlow';

const mockedAuthApi = AuthApi as jest.Mocked<typeof AuthApi>;
const mockedStore = AuthSecureSessionStore as jest.Mocked<typeof AuthSecureSessionStore>;
const mockedClearLocalLogoutFootprint = clearLocalLogoutFootprint as jest.MockedFunction<
  typeof clearLocalLogoutFootprint
>;
const mockedProviderLogout = logoutFromOAuthProvider as jest.MockedFunction<typeof logoutFromOAuthProvider>;
const mockedDispatchPhase2SyncQueue = dispatchPhase2SyncQueue as jest.MockedFunction<
  typeof dispatchPhase2SyncQueue
>;

type RetryableServerLogoutFailureCase = {
  label: string;
  error: Error;
  expectedCode: string;
  expectedStatus: number;
  expectedRequestId: string;
};

const storedSession: AuthSessionTokens = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 900,
  issuedAt: 1,
  user: {
    id: 'usr_profile',
    email: 'traveler@example.com',
    provider: 'google',
  },
};

describe('logoutFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStore.read.mockResolvedValue(storedSession);
    mockedDispatchPhase2SyncQueue.mockResolvedValue(undefined);
    mockedAuthApi.logout.mockResolvedValue(undefined);
    mockedClearLocalLogoutFootprint.mockResolvedValue(undefined);
    mockedProviderLogout.mockResolvedValue(undefined);
  });

  it('clears local logout footprint only after FoodLens server logout succeeds', async () => {
    const result = await runFoodLensLogoutFlow();

    if (result.status !== 'success') {
      throw new Error('Expected logout flow to succeed');
    }

    expect(mockedAuthApi.logout).toHaveBeenCalledWith({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(mockedClearLocalLogoutFootprint).toHaveBeenCalledTimes(1);
    expect(mockedAuthApi.logout.mock.invocationCallOrder[0]).toBeLessThan(
      mockedClearLocalLogoutFootprint.mock.invocationCallOrder[0],
    );

    startProviderLogoutAfterFoodLensLogout(result);

    expect(mockedProviderLogout).toHaveBeenCalledWith('google');
  });

  it('keeps local session when FoodLens server logout fails', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedAuthApi.logout.mockRejectedValue(
      new AuthApiError('Auth request timed out.', 'AUTH_TIMEOUT', 408, 'req-timeout'),
    );

    const result = await runFoodLensLogoutFlow();

    expect(result).toMatchObject({
      status: 'failure',
      reason: 'server_logout_failed',
      userId: 'usr_profile',
      provider: 'google',
    });
    expect(mockedAuthApi.logout).toHaveBeenCalledTimes(2);
    expect(mockedClearLocalLogoutFootprint).not.toHaveBeenCalled();
    expect(mockedProviderLogout).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AuthSession] Retrying FoodLens server logout',
      expect.objectContaining({
        phase: 'server_refresh_token_revoke',
        attempt: 1,
        code: 'AUTH_TIMEOUT',
        status: 408,
      }),
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AuthSession] FoodLens server logout failed',
      expect.objectContaining({
        phase: 'server_refresh_token_revoke',
        code: 'AUTH_TIMEOUT',
        status: 408,
        server_request_id: 'req-timeout',
      }),
    );

    consoleWarnSpy.mockRestore();
  });

  it.each<RetryableServerLogoutFailureCase>([
    {
      label: 'network',
      error: new AuthApiError('Network unavailable.', 'AUTH_NETWORK_ERROR', 0, 'req-network'),
      expectedCode: 'AUTH_NETWORK_ERROR',
      expectedStatus: 0,
      expectedRequestId: 'req-network',
    },
    {
      label: '5xx',
      error: new AuthApiError('Auth request failed (503).', 'AUTH_REQUEST_FAILED', 503, 'req-503'),
      expectedCode: 'AUTH_REQUEST_FAILED',
      expectedStatus: 503,
      expectedRequestId: 'req-503',
    },
  ])('keeps local session when $label server logout failures exhaust retry', async (input) => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedAuthApi.logout.mockRejectedValue(input.error);

    const result = await runFoodLensLogoutFlow();

    expect(result).toMatchObject({
      status: 'failure',
      reason: 'server_logout_failed',
      userId: 'usr_profile',
      provider: 'google',
    });
    expect(mockedAuthApi.logout).toHaveBeenCalledTimes(2);
    expect(mockedClearLocalLogoutFootprint).not.toHaveBeenCalled();
    expect(mockedProviderLogout).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AuthSession] FoodLens server logout failed',
      expect.objectContaining({
        phase: 'server_refresh_token_revoke',
        code: input.expectedCode,
        status: input.expectedStatus,
        server_request_id: input.expectedRequestId,
      }),
    );

    consoleWarnSpy.mockRestore();
  });

  it('separates pre-logout sync flush failure from server logout failure', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedDispatchPhase2SyncQueue.mockRejectedValueOnce(new Error('sync queue unavailable'));

    const result = await runFoodLensLogoutFlow();

    expect(result).toMatchObject({
      status: 'success',
      preLogoutSyncFlushFailed: true,
    });
    expect(mockedAuthApi.logout).toHaveBeenCalledTimes(1);
    expect(mockedClearLocalLogoutFootprint).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[Phase2Sync] Pre-logout queue flush failed',
      expect.objectContaining({
        phase: 'pre_logout_sync_flush',
        error: 'sync queue unavailable',
      }),
    );

    consoleWarnSpy.mockRestore();
  });

  it('does not rollback local logout when provider logout fails after FoodLens logout', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockedProviderLogout.mockRejectedValueOnce(
      new AuthApiError('Provider logout was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400),
    );

    const result = await runFoodLensLogoutFlow();

    if (result.status !== 'success') {
      throw new Error('Expected logout flow to succeed before provider logout');
    }

    startProviderLogoutAfterFoodLensLogout(result);
    await Promise.resolve();

    expect(mockedClearLocalLogoutFootprint).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[AuthSession] Provider logout failed after FoodLens logout',
      expect.objectContaining({
        phase: 'provider_logout',
        code: 'AUTH_PROVIDER_CANCELLED',
        status: 400,
      }),
    );

    consoleWarnSpy.mockRestore();
  });

  it('skips server logout when there is no stored FoodLens session', async () => {
    mockedStore.read.mockResolvedValueOnce(null);

    const result = await runFoodLensLogoutFlow();

    expect(result).toMatchObject({
      status: 'success',
      userId: 'unknown',
      provider: undefined,
    });
    expect(mockedAuthApi.logout).not.toHaveBeenCalled();
    expect(mockedClearLocalLogoutFootprint).toHaveBeenCalledTimes(1);
  });
});
