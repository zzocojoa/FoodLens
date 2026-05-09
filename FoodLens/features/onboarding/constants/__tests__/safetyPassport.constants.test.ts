import { ALLERGY_TRANSLATIONS } from '@/services/staticTranslations';
import {
  resolveRequestLocaleFromTravelerTargetLanguage,
  resolveTravelerCardCountryCode,
} from '@/services/travelerCardLanguage';
import { ONBOARDING_DESTINATIONS } from '../safetyPassport.constants';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

describe('safety passport destination contract', () => {
  it('keeps every onboarding destination mapped to a traveler card language', () => {
    ONBOARDING_DESTINATIONS.forEach((destination) => {
      const travelerCountryCode = resolveTravelerCardCountryCode({
        photoCountryCode: null,
        targetLanguage: destination.targetLanguage,
        fallbackCountryCode: 'US',
      });

      expect(travelerCountryCode).toBe(destination.countryCode);
      expect(ALLERGY_TRANSLATIONS[destination.countryCode]).toBeDefined();
      expect(resolveRequestLocaleFromTravelerTargetLanguage(destination.countryCode)).toBe(destination.targetLanguage);
    });
  });
});
