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

const ORIGINAL_ENV = process.env;

const loadIsolatedLogoutFromOAuthProvider = (): typeof logoutFromOAuthProvider => {
  let loadedModule: typeof import('../providerLogout') | null = null;

  jest.isolateModules(() => {
    loadedModule = require('../providerLogout') as typeof import('../providerLogout');
  });

  if (!loadedModule) {
    throw new Error('providerLogout module failed to load in isolateModules');
  }

  const resolvedModule = loadedModule as typeof import('../providerLogout');
  return resolvedModule.logoutFromOAuthProvider;
};

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

  it('falls back to analysis server URL when google logout start URL is missing', async () => {
    process.env = {
      ...process.env,
      EXPO_PUBLIC_ANALYSIS_SERVER_URL: 'https://api.foodlens.example.com/',
    };
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    const isolatedLogoutFromOAuthProvider = loadIsolatedLogoutFromOAuthProvider();

    await isolatedLogoutFromOAuthProvider('google');

    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'https://api.foodlens.example.com/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete'
    );
  });

  it('opens google logout bridge in browser', async () => {
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/google/logout/start`;
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('google');

    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      `${ANALYSIS_SERVER_URL}/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete`
    );
  });

  it('prefers provider-specific logout start URL over analysis server fallback', async () => {
    process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';
    process.env['EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL'] =
      `${ANALYSIS_SERVER_URL}/auth/google/logout/start`;
    mockedWebBrowser.openBrowserAsync.mockResolvedValue({
      type: 'opened',
    });

    await logoutFromOAuthProvider('google');

    expect(mockedWebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      `${ANALYSIS_SERVER_URL}/auth/google/logout/start?redirect_uri=foodlens%3A%2F%2Foauth%2Flogout-complete`
    );
  });

  it('throws cancelled when browser is dismissed', async () => {
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
    await expect(logoutFromOAuthProvider('google')).rejects.toMatchObject({
      code: 'AUTH_PROVIDER_MISCONFIGURED',
    });
  });
});
