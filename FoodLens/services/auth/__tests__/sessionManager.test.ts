import { AuthApi, AuthApiError, AuthSessionTokens } from '../authApi';
import { AuthSecureSessionStore } from '../secureSessionStore';
import { clearCurrentUserId, getCurrentUserId, hasAuthenticatedUser, setCurrentUserId } from '../currentUser';
import { queryClient } from '../../queryClient';
import { clearSession, persistSession, restoreSession } from '../sessionManager';

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

const mockedAuthApi = AuthApi as jest.Mocked<typeof AuthApi>;
const mockedStore = AuthSecureSessionStore as jest.Mocked<typeof AuthSecureSessionStore>;
const mockedSetCurrentUserId = setCurrentUserId as jest.Mock;
const mockedClearCurrentUserId = clearCurrentUserId as jest.Mock;
const mockedGetCurrentUserId = getCurrentUserId as jest.Mock;
const mockedHasAuthenticatedUser = hasAuthenticatedUser as jest.Mock;
const mockedQueryClient = queryClient as unknown as { clear: jest.Mock };

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
});

describe('sessionManager', () => {
  it('persists session and current user id', async () => {
    await persistSession(activeSession);

    expect(mockedStore.write).toHaveBeenCalledWith(activeSession);
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('usr_1');
    expect(mockedQueryClient.clear).not.toHaveBeenCalled();
  });

  it('clears query cache when authenticated user switches accounts', async () => {
    mockedHasAuthenticatedUser.mockReturnValue(true);
    mockedGetCurrentUserId.mockReturnValue('usr_old');

    await persistSession(activeSession);

    expect(mockedQueryClient.clear).toHaveBeenCalledTimes(1);
    expect(mockedSetCurrentUserId).toHaveBeenCalledWith('usr_1');
  });

  it('keeps query cache when same authenticated user persists session', async () => {
    mockedHasAuthenticatedUser.mockReturnValue(true);
    mockedGetCurrentUserId.mockReturnValue('usr_1');

    await persistSession(activeSession);

    expect(mockedQueryClient.clear).not.toHaveBeenCalled();
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

  it('clears broken session when refresh fails', async () => {
    mockedStore.read.mockResolvedValue(expiredSession);
    mockedAuthApi.refresh.mockRejectedValue(new AuthApiError('reuse', 'AUTH_REFRESH_REUSED', 401));

    const restored = await restoreSession();

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
    expect(mockedQueryClient.clear).toHaveBeenCalledTimes(1);
  });
});
