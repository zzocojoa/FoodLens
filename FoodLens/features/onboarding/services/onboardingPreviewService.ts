type PreviewParam = string | string[] | undefined;

export type OnboardingPreviewAccess = 'normal' | 'preview' | 'disabled_preview';

const ONBOARDING_PREVIEW_ENV = 'EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED';

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

export const isOnboardingPreviewEnabled = (): boolean =>
  isEnabledFlagValue(process.env[ONBOARDING_PREVIEW_ENV]);

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
