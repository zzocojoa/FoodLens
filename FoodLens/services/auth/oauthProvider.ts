import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApi, AuthApiError, AuthSessionTokens } from './authApi';

export type OAuthProvider = 'google' | 'kakao';
type OAuthMode = 'mock' | 'live';

type OAuthGrant = {
  code: string;
  state: string;
  redirectUri: string;
  email?: string;
  providerUserId?: string;
};

const OAUTH_MODE_ENV = 'EXPO_PUBLIC_AUTH_OAUTH_MODE';
const GOOGLE_START_URL_ENV = 'EXPO_PUBLIC_AUTH_GOOGLE_START_URL';
const KAKAO_START_URL_ENV = 'EXPO_PUBLIC_AUTH_KAKAO_START_URL';

const CALLBACK_PATH_BY_PROVIDER: Record<OAuthProvider, string> = {
  google: 'oauth/google-callback',
  kakao: 'oauth/kakao-callback',
};

const START_URL_ENV_BY_PROVIDER: Record<OAuthProvider, string> = {
  google: GOOGLE_START_URL_ENV,
  kakao: KAKAO_START_URL_ENV,
};

const normalizedQueryValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value) && value.length > 0) {
    return normalizedQueryValue(value[0]);
  }

  return undefined;
};

const getOAuthMode = (): OAuthMode => {
  const rawMode = (process.env[OAUTH_MODE_ENV] ?? 'mock').trim().toLowerCase();
  return rawMode === 'live' ? 'live' : 'mock';
};

const buildRedirectUri = (provider: OAuthProvider): string => {
  const path = CALLBACK_PATH_BY_PROVIDER[provider];
  return Linking.createURL(path);
};

const buildMockGrant = (provider: OAuthProvider): OAuthGrant => {
  const nonce = Math.random().toString(16).slice(2, 10);
  const now = Date.now().toString(36);

  return {
    code: `mock-${provider}-code-${now}-${nonce}`,
    state: `mock-${provider}-state-${now}`,
    redirectUri: `foodlens://${CALLBACK_PATH_BY_PROVIDER[provider]}`,
    email: `mock+${provider}@foodlens.local`,
    providerUserId: `mock-${provider}-user-${nonce}`,
  };
};

const buildLiveAuthUrl = (provider: OAuthProvider, redirectUri: string): string => {
  const startUrlEnvKey = START_URL_ENV_BY_PROVIDER[provider];
  const startUrl = (process.env[startUrlEnvKey] ?? '').trim();

  if (!startUrl) {
    throw new AuthApiError(
      `${provider} OAuth start URL is not configured.`,
      'AUTH_PROVIDER_MISCONFIGURED',
      500
    );
  }

  const delimiter = startUrl.includes('?') ? '&' : '?';
  return `${startUrl}${delimiter}redirect_uri=${encodeURIComponent(redirectUri)}`;
};

const parseCallbackGrant = (callbackUrl: string, redirectUri: string): OAuthGrant => {
  const parsed = Linking.parse(callbackUrl);
  const params = parsed.queryParams ?? {};

  const providerError = normalizedQueryValue(params['error']);
  if (providerError) {
    if (providerError === 'access_denied' || providerError === 'cancelled' || providerError === 'canceled') {
      throw new AuthApiError('Provider login was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
    }

    throw new AuthApiError(
      normalizedQueryValue(params['error_description']) ?? 'Provider login failed.',
      'AUTH_PROVIDER_REJECTED',
      400
    );
  }

  const code = normalizedQueryValue(params['code']);
  const state = normalizedQueryValue(params['state']);

  if (!code) {
    throw new AuthApiError('Missing or invalid authorization code.', 'AUTH_PROVIDER_INVALID_CODE', 400);
  }

  if (!state) {
    throw new AuthApiError('Missing or invalid state value.', 'AUTH_PROVIDER_INVALID_STATE', 400);
  }

  return {
    code,
    state,
    redirectUri,
    email: normalizedQueryValue(params['email']),
    providerUserId:
      normalizedQueryValue(params['provider_user_id']) ?? normalizedQueryValue(params['providerUserId']),
  };
};

const requestLiveGrant = async (provider: OAuthProvider): Promise<OAuthGrant> => {
  const redirectUri = buildRedirectUri(provider);
  const authUrl = buildLiveAuthUrl(provider, redirectUri);
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type !== 'success' || !result.url) {
    throw new AuthApiError('Provider login was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
  }

  return parseCallbackGrant(result.url, redirectUri);
};

const requestGrant = async (provider: OAuthProvider): Promise<OAuthGrant> => {
  if (getOAuthMode() === 'mock') {
    return buildMockGrant(provider);
  }

  return requestLiveGrant(provider);
};

export const loginWithOAuthProvider = async (provider: OAuthProvider): Promise<AuthSessionTokens> => {
  const grant = await requestGrant(provider);
  if (provider === 'google') {
    return AuthApi.loginWithGoogle(grant);
  }

  return AuthApi.loginWithKakao(grant);
};

export const AuthOAuthProvider = {
  getOAuthMode,
  loginWithOAuthProvider,
};
