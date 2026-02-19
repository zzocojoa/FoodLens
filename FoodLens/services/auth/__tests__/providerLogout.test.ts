import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { logoutFromOAuthProvider } from '../providerLogout';

jest.mock('../authApi', () => ({
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

const mockedLinking = Linking as unknown as {
  createURL: jest.Mock;
  parse: jest.Mock;
};
const mockedWebBrowser = WebBrowser as unknown as {
  openAuthSessionAsync: jest.Mock;
};

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env['EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL'];
  delete process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'];
  mockedLinking.createURL.mockReturnValue('foodlens://oauth/logout-complete');
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('providerLogout', () => {
  it('skips provider logout for non-social providers', async () => {
    await logoutFromOAuthProvider('email');
    expect(mockedWebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  it('throws when google logout start URL is missing', async () => {
    await expect(logoutFromOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
    });
  });

  it('opens google logout bridge and resolves on success callback', async () => {
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL'] =
      'https://foodlens-2-w1xu.onrender.com/auth/google/logout/start';
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'foodlens://oauth/logout-complete?provider=google&logout=ok',
    });
    mockedLinking.parse.mockReturnValue({
      queryParams: {
        provider: 'google',
        logout: 'ok',
      },
    });

    await logoutFromOAuthProvider('google');

    expect(mockedWebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://foodlens-2-w1xu.onrender.com/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete',
      'foodlens://oauth/logout-complete'
    );
  });

  it('propagates provider error returned from callback', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      'https://foodlens-2-w1xu.onrender.com/auth/kakao/logout/start';
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'foodlens://oauth/logout-complete?error=access_denied&error_description=denied',
    });
    mockedLinking.parse.mockReturnValue({
      queryParams: {
        error: 'access_denied',
        error_description: 'denied',
      },
    });

    await expect(logoutFromOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_REJECTED',
    });
  });
});
