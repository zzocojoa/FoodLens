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

const ANALYSIS_SERVER_URL = 'https://api.example.com';
const OAUTH_REDIRECT_BASE_URL = 'https://links.foodlens.example.com';
const HTTPS_LOGOUT_REDIRECT_URI = `${OAUTH_REDIRECT_BASE_URL}/oauth/logout-complete`;
const IOS_SIDELOAD_LOGOUT_REDIRECT_URI = 'com.hoihou.foodlens://oauth/logout-complete';

const ORIGINAL_ENV = process.env;
const ORIGINAL_DEV_FLAG = (global as { __DEV__?: boolean }).__DEV__;

beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...ORIGINAL_ENV };
  delete process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'];
  delete process.env['EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL'];
  delete process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'];
  delete process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'];
  delete process.env['EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL'];
  delete process.env['EXPO_PUBLIC_OAUTH_REDIRECT_TRANSPORT'];
  delete process.env['EXPO_PUBLIC_OAUTH_CUSTOM_REDIRECT_SCHEME'];
  (global as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV_FLAG;
  mockedLinking.createURL.mockReturnValue('foodlens://oauth/logout-complete');
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  (global as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV_FLAG;
});

describe('providerLogout', () => {
  it('skips provider logout for non-social providers', async () => {
    await logoutFromOAuthProvider('email');
    expect(mockedWebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('skips browser logout for google providers', async () => {
    process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';

    await logoutFromOAuthProvider('google');

    expect(mockedWebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('skips browser logout for kakao providers by default', async () => {
    process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';

    await logoutFromOAuthProvider('kakao');

    expect(mockedWebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('falls back to analysis server URL when kakao browser logout is enabled', async () => {
    process.env = {
      ...process.env,
      EXPO_PUBLIC_ANALYSIS_SERVER_URL: 'https://api.foodlens.example.com/',
      EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED: '1',
    };
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('kakao');

    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://api.foodlens.example.com/auth/kakao/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete'
    );
  });

  it('opens kakao logout bridge in browser when explicitly enabled', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = 'true';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('kakao');

    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete`
    );
  });

  it('uses HTTPS app link logout redirect in production runtime', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = 'true';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    process.env['EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL'] = OAUTH_REDIRECT_BASE_URL;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('kakao');

    expect(mockedLinking.createURL).not.toHaveBeenCalled();
    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start?redirect_uri=${encodeURIComponent(
        HTTPS_LOGOUT_REDIRECT_URI
      )}`
    );
  });

  it('uses explicit custom scheme logout redirect for iOS sideload runtime', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = 'true';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    process.env['EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL'] = OAUTH_REDIRECT_BASE_URL;
    process.env['EXPO_PUBLIC_OAUTH_REDIRECT_TRANSPORT'] = 'custom-scheme';
    process.env['EXPO_PUBLIC_OAUTH_CUSTOM_REDIRECT_SCHEME'] = 'com.hoihou.foodlens';
    (global as { __DEV__?: boolean }).__DEV__ = false;
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('kakao');

    expect(mockedLinking.createURL).not.toHaveBeenCalled();
    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start?redirect_uri=${encodeURIComponent(
        IOS_SIDELOAD_LOGOUT_REDIRECT_URI
      )}`
    );
  });

  it('rejects unsupported OAuth logout redirect transport values', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = 'true';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    process.env['EXPO_PUBLIC_OAUTH_REDIRECT_TRANSPORT'] = 'bridge';
    (global as { __DEV__?: boolean }).__DEV__ = false;

    await expect(logoutFromOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
      status: 500,
    });

    expect(mockedWebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('rejects production kakao logout when HTTPS redirect base URL is missing', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = 'true';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    (global as { __DEV__?: boolean }).__DEV__ = false;

    await expect(logoutFromOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
      status: 500,
    });

    expect(mockedLinking.createURL).not.toHaveBeenCalled();
    expect(mockedWebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS OAuth redirect base URL for production logout', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = 'true';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    process.env['EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL'] = 'foodlens://oauth/logout-complete';
    (global as { __DEV__?: boolean }).__DEV__ = false;

    await expect(logoutFromOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
      status: 500,
    });

    expect(mockedLinking.createURL).not.toHaveBeenCalled();
    expect(mockedWebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('prefers provider-specific logout start URL over analysis server fallback', async () => {
    process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = '1';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('kakao');

    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete`
    );
  });

  it('throws cancelled when browser is dismissed', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = '1';
    process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/kakao/logout/start`;
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'dismiss',
    });

    await expect(logoutFromOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_CANCELLED',
    });
  });

  it('throws when neither provider-specific nor analysis server logout URL is configured', async () => {
    process.env['EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED'] = '1';

    await expect(logoutFromOAuthProvider('kakao')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
    });
  });
});
