import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApiError } from './authApi';

type OAuthProvider = 'google' | 'kakao';
type LogoutResult = 'ok';

const GOOGLE_LOGOUT_START_URL_ENV = 'EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL';
const KAKAO_LOGOUT_START_URL_ENV = 'EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL';
const DEFAULT_APP_LOGOUT_REDIRECT_URI = 'foodlens://oauth/logout-complete';

const normalizeQueryValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value) && value.length > 0) {
    return normalizeQueryValue(value[0]);
  }

  return undefined;
};

const resolveAppLogoutRedirectUri = (): string => {
  try {
    return Linking.createURL('oauth/logout-complete');
  } catch {
    return DEFAULT_APP_LOGOUT_REDIRECT_URI;
  }
};

const resolveLogoutStartUrl = (provider: OAuthProvider): string => {
  const envKey = provider === 'google' ? GOOGLE_LOGOUT_START_URL_ENV : KAKAO_LOGOUT_START_URL_ENV;
  const startUrl = (process.env[envKey] ?? '').trim();
  if (!startUrl) {
    throw new AuthApiError(
      `${provider} logout start URL is not configured.`,
      'AUTH_PROVIDER_MISCONFIGURED',
      500
    );
  }
  return startUrl;
};

const buildLogoutStartUrl = (provider: OAuthProvider, appRedirectUri: string): string => {
  const startUrl = resolveLogoutStartUrl(provider);
  const delimiter = startUrl.includes('?') ? '&' : '?';
  return `${startUrl}${delimiter}redirect_uri=${encodeURIComponent(appRedirectUri)}`;
};

const parseLogoutResult = (provider: OAuthProvider, url: string): LogoutResult => {
  const parsed = Linking.parse(url);
  const params = parsed.queryParams ?? {};
  const error = normalizeQueryValue(params['error']);
  if (error) {
    throw new AuthApiError(
      normalizeQueryValue(params['error_description']) ?? `${provider} provider logout failed.`,
      'AUTH_PROVIDER_REJECTED',
      400
    );
  }

  return 'ok';
};

export const logoutFromOAuthProvider = async (provider: string | undefined): Promise<void> => {
  const normalizedProvider = (provider ?? '').trim().toLowerCase();
  if (normalizedProvider !== 'google' && normalizedProvider !== 'kakao') {
    return;
  }

  const appRedirectUri = resolveAppLogoutRedirectUri();
  const startUrl = buildLogoutStartUrl(normalizedProvider, appRedirectUri);
  const result = await WebBrowser.openAuthSessionAsync(startUrl, appRedirectUri);

  if (result.type === 'success' && result.url) {
    parseLogoutResult(normalizedProvider, result.url);
    return;
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new AuthApiError('Provider logout was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
  }

  throw new AuthApiError('Provider logout did not complete.', 'AUTH_PROVIDER_REJECTED', 400);
};
