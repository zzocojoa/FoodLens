import Constants from 'expo-constants';

type PreviewParam = string | string[] | undefined;

export type OnboardingPreviewAccess = 'normal' | 'preview' | 'disabled_preview';

const ONBOARDING_PREVIEW_ENV = 'EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED';
const ONBOARDING_PREVIEW_EXTRA_KEY = 'onboardingPreviewEnabled';
const ONBOARDING_PREVIEW_PATH = '/onboarding';

type PreviewDeepLinkParts = {
  path: string;
  preview: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeFlagValue = (value: string | undefined): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
};

const isEnabledFlagValue = (value: string | undefined): boolean => {
  const normalized = normalizeFlagValue(value);
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const isPreviewParamValue = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const readOnboardingPreviewConfigValue = (): string | undefined => {
  const extra = Constants.expoConfig?.extra;
  if (isRecord(extra)) {
    const extraValue = extra[ONBOARDING_PREVIEW_EXTRA_KEY];
    if (typeof extraValue === 'string') {
      return extraValue;
    }
  }

  return process.env[ONBOARDING_PREVIEW_ENV];
};

export const isOnboardingPreviewEnabled = (): boolean =>
  isEnabledFlagValue(readOnboardingPreviewConfigValue());

export const isOnboardingPreviewRequested = (preview: PreviewParam): boolean => {
  if (Array.isArray(preview)) {
    return preview.some(isPreviewParamValue);
  }
  if (typeof preview !== 'string') {
    return false;
  }
  return isPreviewParamValue(preview);
};

export const resolveOnboardingPreviewAccess = (preview: PreviewParam): OnboardingPreviewAccess => {
  if (!isOnboardingPreviewRequested(preview)) {
    return 'normal';
  }
  return isOnboardingPreviewEnabled() ? 'preview' : 'disabled_preview';
};

const stripHash = (url: string): string => {
  const hashIndex = url.indexOf('#');
  return hashIndex >= 0 ? url.slice(0, hashIndex) : url;
};

const splitPathAndQuery = (url: string): { path: string; query: string } => {
  const withoutHash = stripHash(url.trim());
  const queryIndex = withoutHash.indexOf('?');
  if (queryIndex < 0) {
    return { path: withoutHash, query: '' };
  }

  return {
    path: withoutHash.slice(0, queryIndex),
    query: withoutHash.slice(queryIndex + 1),
  };
};

const normalizeDeepLinkPath = (path: string): string => {
  const schemeIndex = path.indexOf('://');
  const pathAfterScheme = schemeIndex >= 0 ? path.slice(schemeIndex + 3) : path;
  const normalizedPath = `/${pathAfterScheme.replace(/^\/+/, '')}`.replace(/\/+$/, '');
  return normalizedPath.length > 0 ? normalizedPath : '/';
};

const collectPreviewValues = (query: string): string[] => {
  if (query.length === 0) {
    return [];
  }

  const params = new URLSearchParams(query);
  return params.getAll('preview');
};

const parsePreviewDeepLink = (url: string): PreviewDeepLinkParts => {
  const { path, query } = splitPathAndQuery(url);
  return {
    path: normalizeDeepLinkPath(path),
    preview: collectPreviewValues(query),
  };
};

export const resolveOnboardingPreviewAccessFromUrl = (
  url: string | null
): OnboardingPreviewAccess => {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return 'normal';
  }

  const parts = parsePreviewDeepLink(url);
  if (parts.path !== ONBOARDING_PREVIEW_PATH) {
    return 'normal';
  }

  return resolveOnboardingPreviewAccess(parts.preview);
};
