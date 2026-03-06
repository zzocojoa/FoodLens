import { LANGUAGE_LABELS, SUPPORTED_LOCALES, TRANSLATIONS } from '../constants';

describe('i18n constants', () => {
  it('maps all supported locales to non-empty dictionaries', () => {
    SUPPORTED_LOCALES.forEach((locale) => {
      expect(Object.keys(TRANSLATIONS[locale]).length).toBeGreaterThan(0);
    });
  });

  it('keeps auto language label aligned with device-based behavior', () => {
    expect(LANGUAGE_LABELS.auto).toBe('Auto (Device)');
  });
});
