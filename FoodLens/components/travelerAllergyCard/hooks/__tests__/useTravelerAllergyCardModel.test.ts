import { renderHook, waitFor } from '@testing-library/react-native';
import { useTravelerAllergyCardModel } from '../useTravelerAllergyCardModel';

jest.mock('@/features/i18n/services/languageService', () => ({
  normalizeCanonicalLocale: (value: string | null | undefined) => value || 'auto',
}));

const mockGetLocationData = jest.fn();

jest.mock('@/services/utils', () => ({
  getLocationData: (...args: unknown[]) => mockGetLocationData(...args),
}));

jest.mock('../useTravelerAllergens', () => ({
  useTravelerAllergens: () => [],
}));

jest.mock('../useTravelerCardTargetLanguage', () => ({
  useTravelerCardTargetLanguage: () => undefined,
}));

jest.mock('@/features/i18n/services/i18nStore', () => ({
  useI18nSnapshot: () => ({
    locale: 'ko-KR',
    ready: true,
    settings: {
      language: 'ko-KR',
      targetLanguage: null,
    },
  }),
}));

describe('useTravelerAllergyCardModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLocationData.mockResolvedValue(null);
  });

  it('falls back to current locale when auto mode has no photo location', () => {
    const { result } = renderHook(() => useTravelerAllergyCardModel(' ', undefined));

    expect(result.current?.displayData.language).toBe('Korean');
  });

  it('uses current GPS country when auto mode has no photo location', async () => {
    mockGetLocationData.mockResolvedValue({
      isoCountryCode: 'JP',
    });

    const { result } = renderHook(() => useTravelerAllergyCardModel(' ', undefined));

    await waitFor(() => {
      expect(result.current?.displayData.language).toBe('Japanese');
    });
  });
});
