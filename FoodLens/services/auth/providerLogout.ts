import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { AuthApiError } from './authApi';

type OAuthProvider = 'google' | 'kakao';
const GOOGLE_LOGOUT_START_URL_ENV = 'EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL';
const KAKAO_LOGOUT_START_URL_ENV = 'EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL';
const KAKAO_BROWSER_LOGOUT_ENABLED_ENV = 'EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED';
const ANALYSIS_SERVER_URL_ENV = 'EXPO_PUBLIC_ANALYSIS_SERVER_URL';
const OAUTH_REDIRECT_BASE_URL_ENV = 'EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL';
const OAUTH_REDIRECT_TRANSPORT_ENV = 'EXPO_PUBLIC_OAUTH_REDIRECT_TRANSPORT';
const OAUTH_CUSTOM_REDIRECT_SCHEME_ENV = 'EXPO_PUBLIC_OAUTH_CUSTOM_REDIRECT_SCHEME';
const OAUTH_CUSTOM_REDIRECT_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*$/;
const DEVELOPMENT_OAUTH_REDIRECT_SCHEME = 'foodlens';
const LOGOUT_CALLBACK_PATH = 'oauth/logout-complete';

const readRuntimeEnv = (key: string): string => process.env[key] ?? '';

const isDevelopmentRuntime = (): boolean => {
  const runtime = globalThis as { __DEV__?: boolean };
  return runtime.__DEV__ === true;
};

const isEnabledEnvValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

const getExpoPublicKakaoBrowserLogoutEnabled = (): string => {
  const runtime = readRuntimeEnv(KAKAO_BROWSER_LOGOUT_ENABLED_ENV);
  if (runtime) {
    return runtime;
  }

  return process.env.EXPO_PUBLIC_AUTH_KAKAO_BROWSER_LOGOUT_ENABLED ?? '';
};

const getExpoPublicOAuthRedirectBaseUrl = (): string => {
  const runtime = readRuntimeEnv(OAUTH_REDIRECT_BASE_URL_ENV);
  if (runtime) {
    return runtime;
  }

  return process.env.EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL ?? '';
};

const getExpoPublicOAuthRedirectTransport = (): string => {
  const runtime = readRuntimeEnv(OAUTH_REDIRECT_TRANSPORT_ENV);
  if (runtime) {
    return runtime;
  }

  return process.env.EXPO_PUBLIC_OAUTH_REDIRECT_TRANSPORT ?? '';
};

const getExpoPublicOAuthCustomRedirectScheme = (): string => {
  const runtime = readRuntimeEnv(OAUTH_CUSTOM_REDIRECT_SCHEME_ENV);
  if (runtime) {
    return runtime;
  }

  return process.env.EXPO_PUBLIC_OAUTH_CUSTOM_REDIRECT_SCHEME ?? '';
};

const shouldUseCustomSchemeRedirect = (): boolean => {
  const rawTransport = getExpoPublicOAuthRedirectTransport().trim().toLowerCase();
  if (!rawTransport || rawTransport === 'app-link') {
    return false;
  }
  if (rawTransport === 'custom-scheme') {
    return true;
  }

  throw new AuthApiError(
    `${OAUTH_REDIRECT_TRANSPORT_ENV} must be either app-link or custom-scheme.`,
    'AUTH_PROVIDER_MISCONFIGURED',
    500
  );
};

const resolveOAuthCustomRedirectScheme = (): string => {
  const scheme = getExpoPublicOAuthCustomRedirectScheme().trim();
  if (!scheme) {
    throw new AuthApiError(
      `${OAUTH_CUSTOM_REDIRECT_SCHEME_ENV} must be configured when ${OAUTH_REDIRECT_TRANSPORT_ENV}=custom-scheme.`,
      'AUTH_PROVIDER_MISCONFIGURED',
      500
    );
  }

  if (!OAUTH_CUSTOM_REDIRECT_SCHEME_PATTERN.test(scheme)) {
    throw new AuthApiError(
      `${OAUTH_CUSTOM_REDIRECT_SCHEME_ENV} must be a valid URL scheme.`,
      'AUTH_PROVIDER_MISCONFIGURED',
      500
    );
  }

  return scheme;
};

const resolveOAuthRedirectBaseUrl = (): string | undefined => {
  const rawBaseUrl = getExpoPublicOAuthRedirectBaseUrl().trim();
  if (!rawBaseUrl) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new AuthApiError(
      `${OAUTH_REDIRECT_BASE_URL_ENV} must be a valid HTTPS origin.`,
      'AUTH_PROVIDER_MISCONFIGURED',
      500
    );
  }

  const hasPath = parsed.pathname !== '' && parsed.pathname !== '/';
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    hasPath ||
    parsed.search ||
    parsed.hash
  ) {
    throw new AuthApiError(
      `${OAUTH_REDIRECT_BASE_URL_ENV} must be an HTTPS origin without credentials, port, path, query, or fragment.`,
      'AUTH_PROVIDER_MISCONFIGURED',
      500
    );
  }

  return parsed.origin.replace(/\/+$/, '');
};

const resolveAppLogoutRedirectUri = (): string => {
  if (shouldUseCustomSchemeRedirect()) {
    return `${resolveOAuthCustomRedirectScheme()}://${LOGOUT_CALLBACK_PATH}`;
  }

  const redirectBaseUrl = resolveOAuthRedirectBaseUrl();
  if (redirectBaseUrl) {
    return `${redirectBaseUrl}/${LOGOUT_CALLBACK_PATH}`;
  }

  if (!isDevelopmentRuntime()) {
    throw new AuthApiError(
      `${OAUTH_REDIRECT_BASE_URL_ENV} must be configured with an HTTPS origin for production OAuth logout redirects.`,
      'AUTH_PROVIDER_MISCONFIGURED',
      500
    );
  }

  return Linking.createURL(LOGOUT_CALLBACK_PATH, { scheme: DEVELOPMENT_OAUTH_REDIRECT_SCHEME });
};

const getExpoPublicAnalysisServerUrl = (): string => {
  const runtime = readRuntimeEnv(ANALYSIS_SERVER_URL_ENV);
  if (runtime) {
    return runtime;
  }

  return process.env.EXPO_PUBLIC_ANALYSIS_SERVER_URL ?? '';
};

const getExpoPublicLogoutStartUrl = (provider: OAuthProvider): string => {
  const envKey = provider === 'google' ? GOOGLE_LOGOUT_START_URL_ENV : KAKAO_LOGOUT_START_URL_ENV;
  const runtime = readRuntimeEnv(envKey);
  if (runtime) {
    return runtime;
  }

  return provider === 'google'
    ? process.env.EXPO_PUBLIC_AUTH_GOOGLE_LOGOUT_START_URL ?? ''
    : process.env.EXPO_PUBLIC_AUTH_KAKAO_LOGOUT_START_URL ?? '';
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

const shouldOpenProviderBrowserLogout = (provider: OAuthProvider): boolean => {
  if (provider === 'google') {
    return false;
  }

  return isEnabledEnvValue(getExpoPublicKakaoBrowserLogoutEnabled());
};

export const logoutFromOAuthProvider = async (provider: string | undefined): Promise<void> => {
  const normalizedProvider = (provider ?? '').trim().toLowerCase();
  if (normalizedProvider !== 'google' && normalizedProvider !== 'kakao') {
    return;
  }

  if (!shouldOpenProviderBrowserLogout(normalizedProvider)) {
    return;
  }

  const appRedirectUri = resolveAppLogoutRedirectUri();
  const startUrl = buildLogoutStartUrl(normalizedProvider, appRedirectUri);
  const result = await WebBrowser.openBrowserAsync(startUrl);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new AuthApiError('Provider logout was cancelled.', 'AUTH_PROVIDER_CANCELLED', 400);
  }
};
