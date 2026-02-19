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

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'];
  delete process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'];
  delete process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'];
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('oauthProvider', () => {
  it('runs in mock mode by default', () => {
    expect(AuthOAuthProvider.getOAuthMode()).toBe('mock');
  });

  it('uses mock grant for google login', async () => {
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
});
