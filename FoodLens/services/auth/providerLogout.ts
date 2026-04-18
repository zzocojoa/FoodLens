import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApiError } from './authApi';

type OAuthProvider = 'google' | 'kakao';
const GOOGLE_LOGOUT_START_URL_ENV = 'EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL';
const KAKAO_LOGOUT_START_URL_ENV = 'EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL';
const ANALYSIS_SERVER_URL_ENV = 'EXPO_PUBLIC_ANALYSIS_SERVER_URL';
const DEFAULT_APP_LOGOUT_REDIRECT_URI = 'foodlens://oauth/logout-complete';

const readRuntimeEnv = (key: string): string => process.env[key] ?? '';

const resolveAppLogoutRedirectUri = (): string => {
  try {
    return Linking.createURL('oauth/logout-complete');
  } catch {
    return DEFAULT_APP_LOGOUT_REDIRECT_URI;
  }
};

const getExpoPublicAnalysisServerUrl = (): string => {
  const runtime = readRuntimeEnv(ANALYSIS_SERVER_URL_ENV);
  if (runtime) {
    return runtime;
  }

  return process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] ?? '';
};

const getExpoPublicLogoutStartUrl = (provider: OAuthProvider): string => {
  const envKey = provider === 'google' ? GOOGLE_LOGOUT_START_URL_ENV : KAKAO_LOGOUT_START_URL_ENV;
  const runtime = readRuntimeEnv(envKey);
  if (runtime) {
    return runtime;
  }

  return provider === 'google'
    ? process.env['EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL'] ?? ''
    : process.env['EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL'] ?? '';
};

const resolveLogoutStartUrl = (provider: OAuthProvider): string => {
  const explicitStartUrl = getExpoPublicLogoutStartUrl(provider).trim();
  if (explicitStartUrl) {
    return explicitStartUrl;
  }

  const analysisServerUrl = getExpoPublicAnalysisServerUrl().trim().replace(/\/+$/, '');
  if (analysisServerUrl) {
    return `${analysisServerUrl}/auth/${provider}/logout/start`;
  }

  throw new AuthApiError(
    `${provider} logout start URL is not configured.`,
    'AUTH_PROVIDER_MISCONFIGURED',
    500
  );
};

const buildLogoutStartUrl = (provider: OAuthProvider, appRedirectUri: string): string => {
  const startUrl = resolveLogoutStartUrl(provider);
  const delimiter = startUrl.includes('?') ? '&' : '?';
  return `${startUrl}${delimiter}redirect_uri=${encodeURIComponent(appRedirectUri)}`;
};

export const logoutFromOAuthProvider = async (provider: string | undefined): Promise<void> => {
  const normalizedProvider = (provider ?? '').trim().toLowerCase();
  if (normalizedProvider !== 'google' && normalizedProvider !== 'kakao') {
    return;
  }

  const appRedirectUri = resolveAppLogoutRedirectUri();
  const startUrl = buildLogoutStartUrl(normalizedProvider, appRedirectUri);
  const result = await WebBrowser.openBrowserAsync(startUrl);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new AuthApiError('Provider logout was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
  }
};
