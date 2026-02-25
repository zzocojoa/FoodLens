import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApi, AuthApiError, AuthSessionTokens } from './authApi_Logic';

export type OAuthProvider = 'google' | 'kakao';
type OAuthMode = 'mock' | 'live';

type OAuthGrant = {
  code: string;
  state: string;
  redirectUri: string;
  email?: string;
  providerUserId?: string;
};

const CALLBACK_PATH_BY_PROVIDER: Record<OAuthProvider, string> = {
  google: 'oauth/google-callback',
  kakao: 'oauth/kakao-callback',
};

const readRuntimeEnv = (key: string): string => process.env[key] ?? '';

// NOTE: Keep both runtime and static access.
// - runtime: works in Jest/dev when process.env is mutated at runtime.
// - static: lets Expo replace EXPO_PUBLIC_* at bundle time for Release builds.
const getExpoPublicOAuthMode = (): string => {
  const runtime = readRuntimeEnv('EXPO_PUBLIC_AUTH_OAUTH_MODE');
  if (runtime) return runtime;
  return process.env['EXPO_PUBLIC_AUTH_OAUTH_MODE'] ?? '';
};

const getExpoPublicAnalysisServerUrl = (): string => {
  const runtime = readRuntimeEnv('EXPO_PUBLIC_ANALYSIS_SERVER_URL');
  if (runtime) return runtime;
  return process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] ?? '';
};

const getExpoPublicProviderStartUrl = (provider: OAuthProvider): string => {
  const runtime = readRuntimeEnv(
    provider === 'google' ? 'EXPO_PUBLIC_AUTH_GOOGLE_START_URL' : 'EXPO_PUBLIC_AUTH_KAKAO_START_URL'
  );
  if (runtime) return runtime;
  return provider === 'google'
    ? process.env['EXPO_PUBLIC_AUTH_GOOGLE_START_URL'] ?? ''
    : process.env['EXPO_PUBLIC_AUTH_KAKAO_START_URL'] ?? '';
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

const decodeQueryValue = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/\+/g, '%20'));
  } catch {
    return value;
  }
};

const parseUrlParamString = (raw: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const normalized = raw.trim().replace(/^[?#]/, '');
  if (!normalized) {
    return out;
  }

  normalized.split('&').forEach((part) => {
    if (!part) return;
    const [rawKey, ...rest] = part.split('=');
    const key = decodeQueryValue(rawKey || '').trim();
    if (!key || key in out) return;
    const rawValue = rest.join('=');
    out[key] = decodeQueryValue(rawValue || '').trim();
  });

  return out;
};

const parseFallbackParamsFromCallbackUrl = (callbackUrl: string): Record<string, string> => {
  try {
    const url = new URL(callbackUrl);
    return {
      ...parseUrlParamString(url.search),
      ...parseUrlParamString(url.hash),
    };
  } catch {
    const [withoutQuery, queryRaw = ''] = callbackUrl.split('?', 2);
    const [, hashRaw = ''] = withoutQuery.split('#', 2);
    return {
      ...parseUrlParamString(queryRaw),
      ...parseUrlParamString(hashRaw),
    };
  }
};

const getOAuthMode = (): OAuthMode => {
  const rawMode = getExpoPublicOAuthMode().trim().toLowerCase();
  if (rawMode === 'live') {
    return 'live';
  }
  if (rawMode === 'mock') {
    return 'mock';
  }
  // Security-first default: never enter mock mode implicitly.
  return 'live';
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
  let startUrl = getExpoPublicProviderStartUrl(provider).trim();
  if (!startUrl) {
    const baseUrl = getExpoPublicAnalysisServerUrl().trim().replace(/\/+$/, '');
    if (baseUrl) {
      startUrl = `${baseUrl}/auth/${provider}/start`;
    }
  }

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
  const fallbackParams = parseFallbackParamsFromCallbackUrl(callbackUrl);
  const readParam = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const fromParsed = normalizedQueryValue(params[key]);
      if (fromParsed) return fromParsed;
      const fromFallback = normalizedQueryValue(fallbackParams[key]);
      if (fromFallback) return fromFallback;
    }
    return undefined;
  };

  const providerError = readParam('error');
  if (providerError) {
    if (providerError === 'access_denied' || providerError === 'cancelled' || providerError === 'canceled') {
      throw new AuthApiError('Provider login was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
    }

    throw new AuthApiError(
      readParam('error_description') ?? 'Provider login failed.',
      'AUTH_PROVIDER_REJECTED',
      400
    );
  }

  const code = readParam('code');
  const state = readParam('state');

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
    email: readParam('email'),
    providerUserId: readParam('provider_user_id', 'providerUserId'),
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
