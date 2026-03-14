jest.mock('@/features/i18n/services/languageService', () => ({
  normalizeCanonicalLocale: (value: string | null | undefined) => value || 'auto',
}));

import {
  resolveTravelerCardCountryCode,
  resolveTravelerLocaleFallbackCountryCode,
} from '../travelerCardLanguage';

describe('travelerCardLanguage', () => {
  it('maps current locale to traveler fallback country code', () => {
    expect(resolveTravelerLocaleFallbackCountryCode('ko-KR')).toBe('KR');
    expect(resolveTravelerLocaleFallbackCountryCode('ja-JP')).toBe('JP');
    expect(resolveTravelerLocaleFallbackCountryCode('en-US')).toBe('US');
  });

  it('uses locale fallback when auto mode has no photo country', () => {
    expect(
      resolveTravelerCardCountryCode({
        photoCountryCode: null,
        targetLanguage: null,
        fallbackCountryCode: resolveTravelerLocaleFallbackCountryCode('ko-KR'),
      })
    ).toBe('KR');
  });
});
