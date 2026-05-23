import { LANGUAGE_LABELS, SUPPORTED_LOCALES, TRANSLATIONS } from '../constants';

describe('i18n constants', () => {
  it('maps all supported locales to non-empty dictionaries', () => {
    SUPPORTED_LOCALES.forEach((locale) => {
      expect(Object.keys(TRANSLATIONS[locale]).length).toBeGreaterThan(0);
    });
  });

  it('keeps every locale dictionary aligned to the English key set', () => {
    const baseKeys = Object.keys(TRANSLATIONS['en-US']).sort();

    SUPPORTED_LOCALES.forEach((locale) => {
      expect(Object.keys(TRANSLATIONS[locale]).sort()).toEqual(baseKeys);
    });
  });

  it('uses dedicated Japanese and Simplified Chinese dictionaries', () => {
    expect(TRANSLATIONS['ja-JP']).not.toBe(TRANSLATIONS['en-US']);
    expect(TRANSLATIONS['zh-Hans']).not.toBe(TRANSLATIONS['en-US']);
    expect(TRANSLATIONS['ja-JP']['common.save']).toBe('保存');
    expect(TRANSLATIONS['ja-JP']['login.title.signIn']).toBe('サインイン');
    expect(TRANSLATIONS['zh-Hans']['common.save']).toBe('保存');
    expect(TRANSLATIONS['zh-Hans']['login.title.signIn']).toBe('登录');
  });

  it('keeps auto language label aligned with device-based behavior', () => {
    expect(LANGUAGE_LABELS.auto).toBe('Auto (Device)');
  });
});
