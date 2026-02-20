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
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

const mockedLinking = Linking as unknown as {
  createURL: jest.Mock;
};
const mockedWebBrowser = WebBrowser as unknown as {
  openBrowserAsync: jest.Mock;
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
    expect(mockedWebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('throws when google logout start URL is missing', async () => {
    await expect(logoutFromOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
    });
  });

  it('opens google logout bridge in browser', async () => {
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL'] =
      'https://foodlens-2-w1xu.onrender.com/auth/google/logout/start';
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('google');

    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://foodlens-2-w1xu.onrender.com/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete'
    );
  });

  it('throws cancelled when browser is dismissed', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      'https://foodlens-2-w1xu.onrender.com/auth/kakao/logout/start';
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'dismiss',
    });

    await expect(logoutFromOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_CANCELLED',
    });
  });
});
