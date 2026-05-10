import {
  isOnboardingPreviewEnabled,
  isOnboardingPreviewRequested,
  resolveOnboardingPreviewAccess,
} from '../onboardingPreviewService';

const ORIGINAL_ENV = process.env;
const PREVIEW_ENV = 'EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED';

describe('onboardingPreviewService', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env[PREVIEW_ENV];
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('keeps onboarding preview disabled by default', () => {
    expect(isOnboardingPreviewEnabled()).toBe(false);
    expect(resolveOnboardingPreviewAccess('1')).toBe('disabled_preview');
  });

  it('enables preview only for explicit truthy env values and preview params', () => {
    process.env[PREVIEW_ENV] = 'true';

    expect(isOnboardingPreviewEnabled()).toBe(true);
    expect(isOnboardingPreviewRequested('yes')).toBe(true);
    expect(resolveOnboardingPreviewAccess('1')).toBe('preview');
  });

  it('uses normal onboarding when preview is not requested', () => {
    process.env[PREVIEW_ENV] = '1';

    expect(isOnboardingPreviewRequested(undefined)).toBe(false);
    expect(isOnboardingPreviewRequested('0')).toBe(false);
    expect(resolveOnboardingPreviewAccess(undefined)).toBe('normal');
  });

  it('accepts array query params when any value requests preview', () => {
    process.env[PREVIEW_ENV] = '1';

    expect(isOnboardingPreviewRequested(['0', 'true'])).toBe(true);
    expect(resolveOnboardingPreviewAccess(['0', 'true'])).toBe('preview');
  });
});
