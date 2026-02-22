import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApi, AuthSessionTokens } from '../authApi';
import { AuthOAuthProvider } from '../oauthProvider';

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

jest.mock('expo-linking', () => ({
  createURL: jest.fn(),
  parse: jest.fn(),
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

beforeEach(() => {
  jest.resetAllMocks();
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

    const result = await AuthOAuthProvider.loginWithOAuthProvider('google');

    expect(mockedAuthApi.loginWithGoogle).toHaveBeenCalledTimes(1);
    expect(mockedAuthApi.loginWithGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUri: 'foodlens://oauth/google-callback',
        email: 'mock+google@foodlens.local',
      })
    );
    expect(result.user.id).toBe('usr_google');
  });

  it('throws misconfigured error when live oauth URL is missing', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
        code: 'AUTH_PROVIDER_MISCONFIGURED',
      });
  });

  it('maps cancelled live oauth to provider cancelled error', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test';
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/google-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(AuthOAuthProvider.loginWithOAuthProvider('google')).rejects.toMatchObject({
        code: 'AUTH_PROVIDER_CANCELLED',
      });

    expect(mockedWebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      expect.stringContaining('redirect_uri=foodlens%3A%2F%2Foauth%2Fgoogle-callback'),
      'foodlens://oauth/google-callback'
    );
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

  it('parses live callback and calls kakao auth API', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'] = 'https://kauth.kakao.com/oauth/authorize?client_id=test';
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/kakao-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'foodlens://oauth/kakao-callback?code=code-123&state=state-123&email=ka%40example.com&provider_user_id=kakao-user',
    });
    mockedLinking.parse.mockReturnValue({
      queryParams: {
        code: 'code-123',
        state: 'state-123',
        email: 'ka@example.com',
        provider_user_id: 'kakao-user',
      },
    });
    mockedAuthApi.loginWithKakao.mockResolvedValue(mockSession('usr_kakao'));

    const result = await AuthOAuthProvider.loginWithOAuthProvider('kakao');

    expect(mockedAuthApi.loginWithKakao).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'code-123',
        state: 'state-123',
        redirectUri: 'foodlens://oauth/kakao-callback',
        email: 'ka@example.com',
        providerUserId: 'kakao-user',
      })
    );
    expect(result.user.id).toBe('usr_kakao');
  });

  it('parses fragment callback params when query params are missing', async () => {
    process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] = 'live';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'] = 'https://kauth.kakao.com/oauth/authorize?client_id=test';
    mockedLinking.createURL.mockReturnValue('foodlens://oauth/kakao-callback');
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'foodlens://oauth/kakao-callback#code=frag-code-123&state=frag-state-123&email=frag%40example.com&provider_user_id=frag-kakao-user',
    });
    mockedLinking.parse.mockReturnValue({
      queryParams: {},
    });
    mockedAuthApi.loginWithKakao.mockResolvedValue(mockSession('usr_kakao_fragment'));

    const result = await AuthOAuthProvider.loginWithOAuthProvider('kakao');

    expect(mockedAuthApi.loginWithKakao).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'frag-code-123',
        state: 'frag-state-123',
        redirectUri: 'foodlens://oauth/kakao-callback',
        email: 'frag@example.com',
        providerUserId: 'frag-kakao-user',
      })
    );
    expect(result.user.id).toBe('usr_kakao_fragment');
  });
});
