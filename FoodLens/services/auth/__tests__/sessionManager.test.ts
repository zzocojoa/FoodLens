import { AuthApi, AuthApiError, AuthSessionTokens } from '../authApi';
import { AuthSecureSessionStore } from '../secureSessionStore';
import { clearCurrentUserId, getCurrentUserId, hasAuthenticatedUser, setCurrentUserId } from '../currentUser';
import { queryClient } from '../../queryClient';
import { dispatchPhase2SyncQueue, enqueuePhase2Sync } from '../../sync/phase2SyncQueue';
import { clearSession, persistSession, refreshSessionNow, restoreSession } from '../sessionManager';
import { SafeStorage } from '../../storage';

jest.mock('../authApi', () => ({
  AuthApi: {
    refresh: jest.fn(),
  },
  AuthApiError: class MockAuthApiError extends Error {
    code: string;
    status: number;
    requestId?: string;

    constructor(message: string, code: string, status: number, requestId?: string) {
      super(message);
      this.code = code;
      this.status = status;
      this.requestId = requestId;
    }
  },
}));

jest.mock('../secureSessionStore', () => ({
  AuthSecureSessionStore: {
    read: jest.fn(),
    write: jest.fn(),
    clear: jest.fn(),
  },
}));

jest.mock('../currentUser', () => ({
  setCurrentUserId: jest.fn(),
  clearCurrentUserId: jest.fn(),
  getCurrentUserId: jest.fn(),
  hasAuthenticatedUser: jest.fn(),
}));

jest.mock('../../queryClient', () => ({
  queryClient: {
    clear: jest.fn(),
  },
}));

jest.mock('../../storage', () => ({
  SafeStorage: {
    remove: jest.fn(),
  },
}));

const mockDataStoreClear = jest.fn();
const mockClearManagedImagesForUser = jest.fn();
const mockClearAiCache = jest.fn();
const mockBarcodeCacheClear = jest.fn();
const mockClearInflightBarcodeLookups = jest.fn();
const mockClearPendingAnalysisJobForUser = jest.fn();
const mockClearPhase2RuntimeCaches = jest.fn();
const mockClearPhase2SyncQueueForUser = jest.fn();

jest.mock('../../dataStore', () => ({
  dataStore: {
    clear: (...args: unknown[]) => mockDataStoreClear(...args),
  },
}));

jest.mock('../../imageStorage', () => ({
  clearManagedImagesForUser: (...args: unknown[]) => mockClearManagedImagesForUser(...args),
}));

jest.mock('../../aiCore/cache', () => ({
  clearAiCache: (...args: unknown[]) => mockClearAiCache(...args),
}));

jest.mock('../../aiCore/internal/barcodeCache', () => ({
  BarcodeCache: {
    clear: (...args: unknown[]) => mockBarcodeCacheClear(...args),
  },
}));

jest.mock('../../aiCore/internal/barcodeLookup', () => ({
  clearInflightBarcodeLookups: (...args: unknown[]) => mockClearInflightBarcodeLookups(...args),
}));

jest.mock('../../aiCore/pendingAnalysisStore', () => ({
  clearPendingAnalysisJobForUser: (...args: unknown[]) => mockClearPendingAnalysisJobForUser(...args),
}));

jest.mock('../../sync/phase2SyncQueue', () => ({
  enqueuePhase2Sync: jest.fn(),
  dispatchPhase2SyncQueue: jest.fn(),
  clearPhase2RuntimeCaches: (...args: unknown[]) => mockClearPhase2RuntimeCaches(...args),
  clearPhase2SyncQueueForUser: (...args: unknown[]) => mockClearPhase2SyncQueueForUser(...args),
}));

jest.mock('../oauthProvider', () => ({
  clearOAuthPendingStates: async (): Promise<void> => {
    await mockedSafeStorage.remove('@foodlens_oauth_pending_state_google');
    await mockedSafeStorage.remove('@foodlens_oauth_pending_state_kakao');
  },
}));

const mockedAuthApi = AuthApi as jest.Mocked<typeof AuthApi>;
const mockedStore = AuthSecureSessionStore as jest.Mocked<typeof AuthSecureSessionStore>;
const mockedSetCurrentUserId = setCurrentUserId as jest.Mock;
const mockedClearCurrentUserId = clearCurrentUserId as jest.Mock;
const mockedGetCurrentUserId = getCurrentUserId as jest.Mock;
const mockedHasAuthenticatedUser = hasAuthenticatedUser as jest.Mock;
const mockedQueryClient = queryClient as unknown as { clear: jest.Mock };
const mockedEnqueuePhase2Sync = enqueuePhase2Sync as jest.MockedFunction<typeof enqueuePhase2Sync>;
const mockedDispatchPhase2SyncQueue =
  dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;

const now = Date.now();
const activeSession: AuthSessionTokens = {
  accessToken: 'atk-1',
  refreshToken: 'rtk-1',
  expiresIn: 900,
  issuedAt: now,
  user: { id: 'usr_1', email: 'user@example.com' },
};

const expiredSession: AuthSessionTokens = {
  ...activeSession,
  accessToken: 'atk-expired',
  refreshToken: 'rtk-expired',
  issuedAt: now - 901_000,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedHasAuthenticatedUser.mockReturnValue(false);
  mockedGetCurrentUserId.mockReturnValue('auth-required');
  mockDataStoreClear.mockResolvedValue(undefined);
  mockClearManagedImagesForUser.mockResolvedValue(undefined);
  mockClearAiCache.mockResolvedValue(undefined);
  mockBarcodeCacheClear.mockResolvedValue(undefined);
  mockClearPendingAnalysisJobForUser.mockResolvedValue(undefined);
  mockClearPhase2SyncQueueForUser.mockResolvedValue(undefined);
});

describe('sessionManager', () => {
  it('persists session and current user id', async () => {
    await persistSession(activeSession);

    expect(mockedStore.write).toHaveBeenCalledWith(activeSession);
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('usr_1');
    expect(mockedQueryClient.clear).not.toHaveBeenCalled();
  });

  it('stores volatile session only when remember me is disabled', async () => {
    await persistSession(activeSession, { rememberMe: false });

    expect(mockedStore.write).toHaveBeenCalledWith(activeSession, { persist: false });
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('usr_1');
  });

  it('persists session without touching phase2 sync queue', async () => {
    await persistSession(activeSession);

    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
    expect(mockedDispatchPhase2SyncQueue).not.toHaveBeenCalled();
  });

  it('clears query cache when authenticated user switches accounts', async () => {
    mockedHasAuthenticatedUser.mockReturnValue(true);
    mockedGetCurrentUserId.mockReturnValue('usr_old');

    await persistSession(activeSession);

    expect(mockedQueryClient.clear).toHaveBeenCalledTimes(1);
    expect(mockDataStoreClear).toHaveBeenCalledTimes(1);
    expect(mockClearInflightBarcodeLookups).toHaveBeenCalledTimes(1);
    expect(mockClearPhase2RuntimeCaches).toHaveBeenCalledTimes(1);
    expect(mockClearPendingAnalysisJobForUser).toHaveBeenCalledWith('usr_old');
    expect(mockClearAiCache).toHaveBeenCalledTimes(1);
    expect(mockBarcodeCacheClear).toHaveBeenCalledTimes(1);
    expect(mockClearPhase2SyncQueueForUser).toHaveBeenCalledWith('usr_old');
    expect(mockClearManagedImagesForUser).toHaveBeenCalledWith('usr_old');
    expect(mockedSafeStorage.remove).toHaveBeenCalledWith('@foodlens_user_profile');
    expect(mockedSafeStorage.remove).toHaveBeenCalledWith('@foodlens_oauth_pending_state_google');
    expect(mockedSafeStorage.remove).toHaveBeenCalledWith('@foodlens_oauth_pending_state_kakao');
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('usr_1');
  });

  it('keeps query cache when same authenticated user persists session', async () => {
    mockedHasAuthenticatedUser.mockReturnValue(true);
    mockedGetCurrentUserId.mockReturnValue('usr_1');

    await persistSession(activeSession);

    expect(mockedQueryClient.clear).not.toHaveBeenCalled();
    expect(mockDataStoreClear).not.toHaveBeenCalled();
  });

  it('restores non-expired session without refresh', async () => {
    mockedStore.read.mockResolvedValue(activeSession);

    const restored = await restoreSession();

    expect(restored).toEqual(activeSession);
    expect(mockedAuthApi.refresh).not.toHaveBeenCalled();
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('usr_1');
  });

  it('refreshes expired session and rewrites secure storage', async () => {
    const refreshed: AuthSessionTokens = {
      ...activeSession,
      accessToken: 'atk-new',
      refreshToken: 'rtk-new',
      issuedAt: now + 1,
    };
    mockedStore.read.mockResolvedValue(expiredSession);
    mockedAuthApi.refresh.mockResolvedValue(refreshed);

    const restored = await restoreSession();

    expect(mockedAuthApi.refresh).toHaveBeenCalledWith('rtk-expired');
    expect(mockedStore.write).toHaveBeenCalledWith(refreshed);
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('usr_1');
    expect(restored).toEqual(refreshed);
  });

  it('deduplicates concurrent refresh calls with single-flight', async () => {
    const refreshed: AuthSessionTokens = {
      ...activeSession,
      accessToken: 'atk-race',
      refreshToken: 'rtk-race',
      issuedAt: now + 2,
    };
    mockedStore.read.mockResolvedValue(expiredSession);
    mockedAuthApi.refresh.mockResolvedValue(refreshed);

    const first = restoreSession();
    const second = restoreSession();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(mockedAuthApi.refresh).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(refreshed);
    expect(secondResult).toEqual(refreshed);
    expect(mockedStore.write).toHaveBeenCalledWith(refreshed);
  });

  it('clears broken session when refresh fails', async () => {
    mockedStore.read.mockResolvedValue(expiredSession);
    mockedAuthApi.refresh.mockRejectedValue(new AuthApiError('reuse', 'AUTH_REFRESH_REUSED', 401));

    const restored = await restoreSession();

    expect(restored).toBeNull();
    expect(mockedStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedClearCurrentUserId).toHaveBeenCalledTimes(1);
  });

  it('forces session clear on terminal refresh invalid even when clearOnFailure is disabled', async () => {
    mockedStore.read.mockResolvedValue(expiredSession);
    mockedAuthApi.refresh.mockRejectedValue(new AuthApiError('invalid', 'AUTH_REFRESH_INVALID', 401));

    const restored = await refreshSessionNow({ clearOnFailure: false, logWarnings: false });

    expect(restored).toBeNull();
    expect(mockedStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedClearCurrentUserId).toHaveBeenCalledTimes(1);
  });

  it('returns null when secure storage is unavailable during bootstrap', async () => {
    mockedStore.read.mockRejectedValue(new Error('Secure token storage is unavailable. Install expo-secure-store.'));

    const restored = await restoreSession();

    expect(restored).toBeNull();
    expect(mockedAuthApi.refresh).not.toHaveBeenCalled();
    expect(mockedClearCurrentUserId).toHaveBeenCalledTimes(1);
  });

  it('clears session explicitly on logout path', async () => {
    await clearSession();

    expect(mockedStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedClearCurrentUserId).toHaveBeenCalledTimes(1);
    expect(mockedSafeStorage.remove).toHaveBeenCalledWith('@foodlens_user_profile');
    expect(mockedSafeStorage.remove).toHaveBeenCalledWith('@foodlens_oauth_pending_state_google');
    expect(mockedSafeStorage.remove).toHaveBeenCalledWith('@foodlens_oauth_pending_state_kakao');
    expect(mockedQueryClient.clear).toHaveBeenCalledTimes(1);
  });
});
