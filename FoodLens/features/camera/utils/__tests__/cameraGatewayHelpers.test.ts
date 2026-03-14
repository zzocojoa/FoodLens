const mockGetUserProfile = jest.fn();
const mockGetLocationData = jest.fn();

jest.mock('@/features/i18n/services/languageService', () => ({
  normalizeCanonicalLocale: (value: string | null | undefined) => value || 'auto',
  normalizeLanguageSettings: (settings: unknown) => settings,
  resolveEffectiveLocale: (settings: { language?: string }) => settings.language || 'en-US',
}));

jest.mock('@/services/userService', () => ({
  UserService: {
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
  },
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserId: () => 'usr_camera',
}));

jest.mock('@/services/utils', () => ({
  getLocationData: (...args: unknown[]) => mockGetLocationData(...args),
  validateCoordinates: jest.fn(),
}));

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: jest.fn(),
}));

jest.mock('@/services/analysis/flow', () => ({
  assertAnalysisImageFileReady: jest.fn(),
}));

import { resolveInitialLocationContext, resolveIsoCodeFromContext } from '../cameraGatewayHelpers';

describe('cameraGatewayHelpers.resolveIsoCodeFromContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocationData.mockResolvedValue(null);
  });

  it('falls back to current ui locale when auto traveler mode has no photo location', async () => {
    mockGetUserProfile.mockResolvedValue({
      settings: {
        language: 'ko-KR',
        targetLanguage: undefined,
      },
    });

    await expect(resolveIsoCodeFromContext(null)).resolves.toBe('KR');
  });

  it('uses current GPS country before locale fallback when auto traveler mode has no photo location', async () => {
    mockGetUserProfile.mockResolvedValue({
      settings: {
        language: 'ko-KR',
        targetLanguage: undefined,
      },
    });
    mockGetLocationData.mockResolvedValue({
      isoCountryCode: 'JP',
    });

    await expect(resolveIsoCodeFromContext(null)).resolves.toBe('JP');
  });

  it('keeps manual traveler language over locale fallback', async () => {
    mockGetUserProfile.mockResolvedValue({
      settings: {
        language: 'ko-KR',
        targetLanguage: 'ja-JP',
      },
    });

    await expect(resolveIsoCodeFromContext(null)).resolves.toBe('JP');
  });

  it('uses current GPS for library images without embedded photo coordinates', async () => {
    mockGetLocationData.mockResolvedValue({
      latitude: 37.5665,
      longitude: 126.978,
      country: 'South Korea',
      city: 'Seoul',
      district: '',
      subregion: '',
      isoCountryCode: 'KR',
      formattedAddress: 'Seoul, South Korea',
    });

    await expect(resolveInitialLocationContext({ sourceType: 'library' })).resolves.toMatchObject({
      isoCountryCode: 'KR',
      city: 'Seoul',
    });
  });
});
