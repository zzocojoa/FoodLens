import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApi, AuthSessionTokens } from '../authApi';
import { AuthOAuthProvider } from '../oauthProvider';
import type { OAuthProvider } from '../oauthProvider';

const mockSafeStorageGet = jest.fn();
const mockSafeStorageSet = jest.fn();
const mockSafeStorageRemove = jest.fn();
const mockGetRandomBytes = jest.fn();

jest.mock('../authApi', () => ({
  AuthApi: {
    loginWithGoogle: jest.fn(),
    loginWithKakao: jest.fn(),
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

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: (...args: unknown[]) => mockSafeStorageGet(...args),
    set: (...args: unknown[]) => mockSafeStorageSet(...args),
    remove: (...args: unknown[]) => mockSafeStorageRemove(...args),
  },
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(),
  parse: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: (byteCount: number): Uint8Array => mockGetRandomBytes(byteCount),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const mockedAuthApi = AuthApi as jest.Mocked<typeof AuthApi>;
const mockedLinking = Linking as unknown as {
  createURL: jest.Mock;
  parse: jest.Mock;
};
const mockedWebBrowser = WebBrowser as unknown as {
  openAuthSessionAsync: jest.Mock;
};

const mockSession = (userId: string): AuthSessionTokens => ({
  accessToken: `atk-${userId}`,
  refreshToken: `rtk-${userId}`,
  expiresIn: 900,
  issuedAt: Date.now(),
  user: {
    id: userId,
    email: `${userId}@example.com`,
  },
});

const ORIGINAL_ENV = process.env;
const ORIGINAL_DEV_FLAG = (global as { __DEV__?: boolean }).__DEV__;
const DEVICE_ID_KEY = '@foodlens_device_id';
const GOOGLE_PENDING_STATE_KEY = '@foodlens_oauth_pending_state_google';
const KAKAO_PENDING_STATE_KEY = '@foodlens_oauth_pending_state_kakao';
const GOOGLE_BACKEND_START_URL = 'https://api.foodlens.example.com/auth/google/start';
const KAKAO_BACKEND_START_URL = 'https://api.foodlens.example.com/auth/kakao/start';
const GOOGLE_DIRECT_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test';
const KAKAO_DIRECT_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize?client_id=test';
const CALLBACK_URI_BY_PROVIDER: Record<OAuthProvider, string> = {
  google: 'foodlens://oauth/google-callback',
  kakao: 'foodlens://oauth/kakao-callback',
};

type PendingOAuthStateFixture = {
  provider: OAuthProvider;
  state: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
};

const parseQueryParams = (url: string): Record<string, string> => {
  const parsed = new URL(url);
  const params: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
};

const stateFromAuthUrl = (authUrl: string): string => {
  const state = new URL(authUrl).searchParams.get('state');
  if (!state) {
    throw new Error('Expected OAuth state in auth URL.');
  }
  return state;
};

const buildPendingOAuthState = (provider: OAuthProvider, expiresAt: number): PendingOAuthStateFixture => ({
  provider,
  state: `stored-${provider}-state`,
  redirectUri: CALLBACK_URI_BY_PROVIDER[provider],
  createdAt: expiresAt - 10 * 60 * 1000,
  expiresAt,
});

const firstInvocationOrder = (mockFn: jest.Mock): number => {
  const order = mockFn.mock.invocationCallOrder[0];
  if (typeof order !== 'number') {
    throw new Error('Expected mock invocation.');
  }
  return order;
};

const firstInvocationOrderForStorageKey = (mockFn: jest.Mock, key: string): number => {
  const callIndex = mockFn.mock.calls.findIndex((call: unknown[]) => call[0] === key);
  if (callIndex < 0) {
    throw new Error(`Expected storage key call: ${key}`);
  }
  const order = mockFn.mock.invocationCallOrder[callIndex];
  if (typeof order !== 'number') {
    throw new Error(`Expected storage key invocation order: ${key}`);
  }
  return order;
};

beforeEach(() => {
  jest.resetAllMocks();
  mockGetRandomBytes.mockImplementation((byteCount: number): Uint8Array => {
    const bytes = new Uint8Array(byteCount);
    bytes.forEach((_value, index) => {
      bytes[index] = (index + 1) % 256;
    });
    return bytes;
  });
  mockSafeStorageGet.mockResolvedValue(null);
  mockSafeStorageSet.mockResolvedValue(undefined);
  mockSafeStorageRemove.mockResolvedValue(undefined);
  process.env = { ...ORIGINAL_ENV };
  delete process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'];
  delete process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'];
  delete process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'];
  delete process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'];
  (global as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV_FLAG;
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  (global as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV_FLAG;
});

describe('oauthProvider', () => {
  it('runs in live mode by default', () => {
    expect(AuthOAuthProvider.getOAuthMode()).toBe('live');
  });

  it('defaults to live mode in production runtime when mode env is not provided', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    expect(AuthOAuthProvider.getOAuthMode()).toBe('live');
  });

  it('uses mock grant for google login', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'mock';
    mockedAuthApi.loginWithGoogle.mockResolvedValue(mockSession('usr_google'));

    const result = await AuthOAuthProvider.loginWithOAuthProvider('google', {
      locale: 'ja-JP',
    });

    expect(mockedAuthApi.loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockedAuthApi.loginWithGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'foodlens://oauth/google-callback',
        email: 'mock+google@foodlens.local',
        locale: 'ja-JP',
        deviceId: undefined,
      })
    );
    expect(mockSafeStorageSet).not.toHaveBeenCalled();
    expect(mockSafeStorageRemove).not.toHaveBeenCalled();
    expect(result.user.id).toBe('usr_google');
  });

  it('does not allow mock mode outside development runtime', () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'mock';
    (global as { __DEV__?: boolean }).__DEV__ = false;

    expect(AuthOAuthProvider.getOAuthMode()).toBe('live');
  });

  it('throws misconfigured error when live oauth URL is missing', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
        code: 'AUTH_PROVIDER_MISCONFIGURED',
      });
  });

  it('throws misconfigured error when native secure random is unavailable', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockGetRandomBytes.mockImplementationOnce(() => {
      throw new Error('native crypto unavailable');
    });

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
      status: 500,
    });

    expect(mockedWebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSafeStorageSet).not.toHaveBeenCalled();
  });

  it('maps cancelled live oauth to provider cancelled error', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
        code: 'AUTH_PROVIDER_CANCELLED',
      });

    expect(mockedWebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.stringContaining('redirect_uri=foodlens%3A%2F%2Foauth%2Fgoogle-callback'),
      'foodlens://oauth/google-callback'
    );
    const authUrl = mockedWebBrowser.openAuthSessionAsync.mock.calls[0][0] as string;
    expect(authUrl).toContain('state=');
    expect(mockSafeStorageSet).toHaveBeenCalledWith(
      '@foodlens_oauth_pending_state_google',
      expect.objectContaining({
        provider: 'google',
        redirectUri: 'foodlens://oauth/google-callback',
        state: stateFromAuthUrl(authUrl),
      })
    );
    expect(mockSafeStorageRemove).toHaveBeenCalledWith('@foodlens_oauth_pending_state_google');
  });

  it('removes stale google and kakao pending states before opening live oauth', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(100_000);
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    const storedByKey: Record<string, unknown> = {
      [GOOGLE_PENDING_STATE_KEY]: buildPendingOAuthState('google', 99_999),
      [KAKAO_PENDING_STATE_KEY]: buildPendingOAuthState('kakao', 50_000),
    };
    mockSafeStorageGet.mockImplementation(async (key: string, fallback: unknown): Promise<unknown> => {
      if (Object.prototype.hasOwnProperty.call(storedByKey, key)) {
        return storedByKey[key];
      }
      return fallback;
    });

    try {
      await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
        code: 'AUTH_PROVIDER_CANCELLED',
      });
    } finally {
      nowSpy.mockRestore();
    }

    const firstSetOrder = firstInvocationOrder(mockSafeStorageSet);
    expect(mockSafeStorageRemove).toHaveBeenCalledWith(GOOGLE_PENDING_STATE_KEY);
    expect(mockSafeStorageRemove).toHaveBeenCalledWith(KAKAO_PENDING_STATE_KEY);
    expect(firstInvocationOrderForStorageKey(mockSafeStorageRemove, GOOGLE_PENDING_STATE_KEY)).toBeLessThan(
      firstSetOrder
    );
    expect(firstInvocationOrderForStorageKey(mockSafeStorageRemove, KAKAO_PENDING_STATE_KEY)).toBeLessThan(
      firstSetOrder
    );
  });

  it('keeps fresh pending state for the other provider during stale cleanup', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValue(100_000);
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    const storedByKey: Record<string, unknown> = {
      [KAKAO_PENDING_STATE_KEY]: buildPendingOAuthState('kakao', 100_001),
    };
    mockSafeStorageGet.mockImplementation(async (key: string, fallback: unknown): Promise<unknown> => {
      if (Object.prototype.hasOwnProperty.call(storedByKey, key)) {
        return storedByKey[key];
      }
      return fallback;
    });

    try {
      await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
        code: 'AUTH_PROVIDER_CANCELLED',
      });
    } finally {
      nowSpy.mockRestore();
    }

    expect(mockSafeStorageRemove).not.toHaveBeenCalledWith(KAKAO_PENDING_STATE_KEY);
  });

  it('maps callback rate limit redirect to retryable auth error', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockImplementation(async (authUrl: string) => ({
      type: 'success',
      url: `foodlens://oauth/google-callback?error=AUTH_RATE_LIMITED&error_description=Too%20many%20attempts&request_id=req-oauth-limited&retry_after_seconds=60&state=${encodeURIComponent(
        stateFromAuthUrl(authUrl)
      )}`,
    }));
    mockedLinking.parse.mockImplementation((url: string) => {
      const queryParams = parseQueryParams(url);
      return {
        queryParams,
      };
    });

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_RATE_LIMITED',
      status: 429,
      requestId: 'req-oauth-limited',
      message: 'Too many attempts',
    });

    expect(mockedAuthApi.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('rejects live callback when state does not match the pending request', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'foodlens://oauth/google-callback?code=code-123&state=unexpected-state',
    });
    mockedLinking.parse.mockImplementation((url: string) => ({
      queryParams: parseQueryParams(url),
    }));

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_INVALID_STATE',
      status: 400,
    });

    expect(mockedAuthApi.loginWithGoogle).not.toHaveBeenCalled();
    expect(mockSafeStorageRemove).toHaveBeenCalledWith('@foodlens_oauth_pending_state_google');
  });

  it('rejects provider error callback before cancellation mapping when state is missing', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'foodlens://oauth/google-callback?error=access_denied',
    });
    mockedLinking.parse.mockImplementation((url: string) => ({
      queryParams: parseQueryParams(url),
    }));

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_INVALID_STATE',
      status: 400,
    });

    expect(mockedAuthApi.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('rejects live callback when pending state is expired', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000);
    nowSpy.mockReturnValue(1_000 + 10 * 60 * 1000 + 1);
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockImplementation(async (authUrl: string) => ({
      type: 'success',
      url: `foodlens://oauth/google-callback?code=code-123&state=${encodeURIComponent(
        stateFromAuthUrl(authUrl)
      )}`,
    }));
    mockedLinking.parse.mockImplementation((url: string) => ({
      queryParams: parseQueryParams(url),
    }));

    try {
      await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
        code: 'AUTH_PROVIDER_INVALID_STATE',
        status: 400,
      });
    } finally {
      nowSpy.mockRestore();
    }
    expect(mockedAuthApi.loginWithGoogle).not.toHaveBeenCalled();
  });

  it('falls back to analysis server URL when provider start URL is missing', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_CANCELLED',
    });

    expect(mockedWebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.stringContaining('https://api.foodlens.example.com/auth/google/start'),
      'foodlens://oauth/google-callback'
    );
  });

  it('prefers provider-specific start URL over analysis server fallback', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = 'https://auth.foodlens.example.com/auth/google/start';
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_CANCELLED',
    });

    expect(mockedWebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.stringContaining('https://auth.foodlens.example.com/auth/google/start'),
      'foodlens://oauth/google-callback'
    );
  });

  it('rejects google direct provider authorize URL in live mode', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = GOOGLE_DIRECT_AUTHORIZE_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
      status: 500,
    });

    expect(mockedWebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSafeStorageSet).not.toHaveBeenCalledWith(
      GOOGLE_PENDING_STATE_KEY,
      expect.objectContaining({
        provider: 'google',
      })
    );
  });

  it('rejects kakao direct provider authorize URL in live mode', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'] = KAKAO_DIRECT_AUTHORIZE_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/kakao-callback');

    await expect(AuthOAuthProvider.loginWithOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
      status: 500,
    });

    expect(mockedWebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
    expect(mockSafeStorageSet).not.toHaveBeenCalledWith(
      KAKAO_PENDING_STATE_KEY,
      expect.objectContaining({
        provider: 'kakao',
      })
    );
  });

  it('parses live callback and calls kakao auth API', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'] = KAKAO_BACKEND_START_URL;
    mockSafeStorageGet.mockResolvedValue('ios-oauth-device-1');
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/kakao-callback');
    mockedWebBrowser.openAuthSessionAsync.mockImplementation(async (authUrl: string) => ({
      type: 'success',
      url: `foodlens://oauth/kakao-callback?code=code-123&state=${encodeURIComponent(
        stateFromAuthUrl(authUrl)
      )}&email=ka%40example.com&provider_user_id=kakao-user`,
    }));
    mockedLinking.parse.mockImplementation((url: string) => ({
      queryParams: parseQueryParams(url),
    }));
    mockedAuthApi.loginWithKakao.mockResolvedValue(mockSession('usr_kakao'));

    const result = await AuthOAuthProvider.loginWithOAuthProvider('kakao');

    expect(mockedAuthApi.loginWithKakao).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'code-123',
        state: stateFromAuthUrl(mockedWebBrowser.openAuthSessionAsync.mock.calls[0][0] as string),
        redirectUri: 'foodlens://oauth/kakao-callback',
        email: 'ka@example.com',
        providerUserId: 'kakao-user',
        deviceId: 'ios-oauth-device-1',
      })
    );
    expect(result.user.id).toBe('usr_kakao');
  });

  it('parses fragment callback params when query params are missing', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'] = KAKAO_BACKEND_START_URL;
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/kakao-callback');
    mockedWebBrowser.openAuthSessionAsync.mockImplementation(async (authUrl: string) => ({
      type: 'success',
      url: `foodlens://oauth/kakao-callback#code=frag-code-123&state=${encodeURIComponent(
        stateFromAuthUrl(authUrl)
      )}&email=frag%40example.com&provider_user_id=frag-kakao-user`,
    }));
    mockedLinking.parse.mockReturnValue({
      queryParams: {},
    });
    mockedAuthApi.loginWithKakao.mockResolvedValue(mockSession('usr_kakao_fragment'));

    const result = await AuthOAuthProvider.loginWithOAuthProvider('kakao');

    expect(mockedAuthApi.loginWithKakao).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'frag-code-123',
        state: stateFromAuthUrl(mockedWebBrowser.openAuthSessionAsync.mock.calls[0][0] as string),
        redirectUri: 'foodlens://oauth/kakao-callback',
        email: 'frag@example.com',
        providerUserId: 'frag-kakao-user',
      })
    );
    expect(result.user.id).toBe('usr_kakao_fragment');
  });
});
