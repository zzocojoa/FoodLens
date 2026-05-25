import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApi, AuthApiError, AuthSessionTokens } from './authApi';
import { SafeStorage } from '@/services/storage';

export type OAuthProvider = 'google' | 'kakao';
type OAuthMode = 'mock' | 'live';
type OAuthLoginOptions = {
  locale?: string;
};

type OAuthGrant = {
  code: string;
  state: string;
  redirectUri: string;
  email?: string;
  providerUserId?: string;
};

type OAuthPendingState = {
  provider: OAuthProvider;
  state: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
};

const DEVICE_ID_KEY = '@foodlens_device_id';
const OAUTH_PENDING_STATE_TTL_MS = 10 * 60 * 1000;

const CALLBACK_PATH_BY_PROVIDER: Record<OAuthProvider, string> = {
  google: 'oauth/google-callback',
  kakao: 'oauth/kakao-callback',
};

const BACKEND_START_PATH_BY_PROVIDER: Record<OAuthProvider, string> = {
  google: '/auth/google/start',
  kakao: '/auth/kakao/start',
};

const PENDING_STATE_KEY_BY_PROVIDER: Record<OAuthProvider, string> = {
  google: '@foodlens_oauth_pending_state_google',
  kakao: '@foodlens_oauth_pending_state_kakao',
};

const OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google', 'kakao'];

const isDevelopmentRuntime = (): boolean => {
  const runtime = globalThis as { __DEV__?: boolean };
  return runtime.__DEV__ === true;
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
    return isDevelopmentRuntime() ? 'mock' : 'live';
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

const generateLiveOAuthState = (): string => {
  const cryptoSource = globalThis.crypto as
    | { getRandomValues?: (array: Uint8Array) => Uint8Array }
    | undefined;
  if (!cryptoSource?.getRandomValues) {
    throw new AuthApiError('Secure random source is unavailable.', 'AUTH_PROVIDER_MISCONFIGURED', 500);
  }

  const bytes = new Uint8Array(32);
  cryptoSource.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

const createPendingOAuthState = (
  provider: OAuthProvider,
  redirectUri: string,
  createdAt: number
): OAuthPendingState => {
  return {
    provider,
    state: generateLiveOAuthState(),
    redirectUri,
    createdAt,
    expiresAt: createdAt + OAUTH_PENDING_STATE_TTL_MS,
  };
};

const writePendingOAuthState = async (pendingState: OAuthPendingState): Promise<void> => {
  await SafeStorage.set(PENDING_STATE_KEY_BY_PROVIDER[pendingState.provider], pendingState);
};

const removePendingOAuthState = async (provider: OAuthProvider): Promise<void> => {
  await SafeStorage.remove(PENDING_STATE_KEY_BY_PROVIDER[provider]);
};

export const clearOAuthPendingStates = async (): Promise<void> => {
  for (const provider of OAUTH_PROVIDERS) {
    await removePendingOAuthState(provider);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isOAuthProvider = (value: unknown): value is OAuthProvider => value === 'google' || value === 'kakao';

const isOAuthPendingState = (value: unknown): value is OAuthPendingState => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isOAuthProvider(value['provider']) &&
    typeof value['state'] === 'string' &&
    typeof value['redirectUri'] === 'string' &&
    typeof value['createdAt'] === 'number' &&
    typeof value['expiresAt'] === 'number'
  );
};

const readPendingOAuthState = async (provider: OAuthProvider): Promise<OAuthPendingState | null> => {
  const stored = await SafeStorage.get<unknown>(PENDING_STATE_KEY_BY_PROVIDER[provider], null);
  return isOAuthPendingState(stored) ? stored : null;
};

const cleanupStalePendingOAuthStates = async (now: number): Promise<void> => {
  for (const provider of OAUTH_PROVIDERS) {
    const pendingState = await readPendingOAuthState(provider);
    if (pendingState && pendingState.expiresAt <= now) {
      await removePendingOAuthState(provider);
    }
  }
};

const trimTrailingSlashes = (value: string): string => {
  return value.replace(/\/+$/, '');
};

const isValidBackendStartUrl = (provider: OAuthProvider, startUrl: string): boolean => {
  let parsed: URL;
  try {
    parsed = new URL(startUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false;
  }

  const expectedPath = BACKEND_START_PATH_BY_PROVIDER[provider];
  const normalizedPath = trimTrailingSlashes(parsed.pathname);
  return normalizedPath === expectedPath || normalizedPath.endsWith(expectedPath);
};

const assertBackendStartUrl = (provider: OAuthProvider, startUrl: string): void => {
  if (isValidBackendStartUrl(provider, startUrl)) {
    return;
  }

  throw new AuthApiError(
    `${provider} OAuth start URL must point to the backend ${BACKEND_START_PATH_BY_PROVIDER[provider]} bridge.`,
    'AUTH_PROVIDER_MISCONFIGURED',
    500
  );
};

const buildLiveAuthUrl = (provider: OAuthProvider, redirectUri: string, state: string): string => {
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

  assertBackendStartUrl(provider, startUrl);

  const delimiter = startUrl.includes('?') ? '&' : '?';
  return `${startUrl}${delimiter}redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
};

const assertCallbackStateMatches = (
  pendingState: OAuthPendingState,
  callbackState: string | undefined,
  redirectUri: string
): string => {
  if (!callbackState) {
    throw new AuthApiError('Missing or invalid state value.', 'AUTH_PROVIDER_INVALID_STATE', 400);
  }
  if (pendingState.expiresAt <= Date.now()) {
    throw new AuthApiError('OAuth state expired.', 'AUTH_PROVIDER_INVALID_STATE', 400);
  }
  if (pendingState.redirectUri !== redirectUri) {
    throw new AuthApiError('OAuth redirect URI mismatch.', 'AUTH_PROVIDER_INVALID_STATE', 400);
  }
  if (pendingState.state !== callbackState) {
    throw new AuthApiError('OAuth state mismatch.', 'AUTH_PROVIDER_INVALID_STATE', 400);
  }
  return callbackState;
};

const parseCallbackGrant = (
  callbackUrl: string,
  redirectUri: string,
  pendingState: OAuthPendingState
): OAuthGrant => {
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

  const state = assertCallbackStateMatches(pendingState, readParam('state'), redirectUri);
  const providerError = readParam('error');
  if (providerError) {
    if (providerError === 'access_denied' || providerError === 'cancelled' || providerError === 'canceled') {
      throw new AuthApiError('Provider login was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
    }
    if (providerError === 'AUTH_RATE_LIMITED') {
      throw new AuthApiError(
        readParam('error_description') ?? 'Too many provider login attempts. Try again later.',
        'AUTH_RATE_LIMITED',
        429,
        readParam('request_id')
      );
    }

    throw new AuthApiError(
      readParam('error_description') ?? 'Provider login failed.',
      'AUTH_PROVIDER_REJECTED',
      400
    );
  }

  const code = readParam('code');

  if (!code) {
    throw new AuthApiError('Missing or invalid authorization code.', 'AUTH_PROVIDER_INVALID_CODE', 400);
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
  const now = Date.now();
  await cleanupStalePendingOAuthStates(now);
  const pendingState = createPendingOAuthState(provider, redirectUri, now);
  const authUrl = buildLiveAuthUrl(provider, redirectUri, pendingState.state);
  await writePendingOAuthState(pendingState);

  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (result.type !== 'success' || !result.url) {
      throw new AuthApiError('Provider login was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
    }

    return parseCallbackGrant(result.url, redirectUri, pendingState);
  } finally {
    await removePendingOAuthState(provider);
  }
};

const requestGrant = async (provider: OAuthProvider): Promise<OAuthGrant> => {
  if (getOAuthMode() === 'mock') {
    return buildMockGrant(provider);
  }

  return requestLiveGrant(provider);
};

const resolveOAuthDeviceId = async (): Promise<string | undefined> => {
  const stored = await SafeStorage.get<string | null>(DEVICE_ID_KEY, null);
  const normalized = typeof stored === 'string' ? stored.trim() : '';
  return normalized || undefined;
};

export const loginWithOAuthProvider = async (
  provider: OAuthProvider,
  options: OAuthLoginOptions = {},
): Promise<AuthSessionTokens> => {
  const grant = await requestGrant(provider);
  const deviceId = await resolveOAuthDeviceId();
  if (provider === 'google') {
    return AuthApi.loginWithGoogle({
      ...grant,
      locale: options.locale,
      deviceId,
    });
  }

  return AuthApi.loginWithKakao({
    ...grant,
    locale: options.locale,
    deviceId,
  });
};

export const AuthOAuthProvider = {
  clearOAuthPendingStates,
  getOAuthMode,
  loginWithOAuthProvider,
};
