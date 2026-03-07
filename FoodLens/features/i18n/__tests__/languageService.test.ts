jest.mock('@/services/storage_Logic', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {
    I18nManager: {},
    SettingsManager: {
      settings: {},
    },
  },
}));

import { NativeModules, Platform } from 'react-native';
import { getDeviceLocale } from '../services/languageService';

describe('languageService.getDeviceLocale', () => {
  const intlDateTimeFormat = Intl.DateTimeFormat;

  beforeEach(() => {
    (Platform as { OS: string }).OS = 'ios';
    (NativeModules as any).I18nManager = {};
    (NativeModules as any).SettingsManager = { settings: {} };
  });

  afterEach(() => {
    Intl.DateTimeFormat = intlDateTimeFormat;
  });

  it('prefers iOS AppleLanguages for auto(device) locale resolution', () => {
    (NativeModules as any).SettingsManager.settings = {
      AppleLanguages: ['ko-KR', 'en-KR'],
    };

    const locale = getDeviceLocale();

    expect(locale).toBe('ko-KR');
  });

  it('uses iOS I18nManager localeIdentifier when available', () => {
    (NativeModules as any).I18nManager = {
      localeIdentifier: 'ko_KR',
    };

    const locale = getDeviceLocale();

    expect(locale).toBe('ko-KR');
  });

  it('prefers AppleLanguages over I18nManager localeIdentifier on iOS', () => {
    (NativeModules as any).SettingsManager.settings = {
      AppleLanguages: ['ko-KR', 'en-KR'],
    };
    (NativeModules as any).I18nManager = {
      localeIdentifier: 'en_US',
    };

    const locale = getDeviceLocale();

    expect(locale).toBe('ko-KR');
  });

  it('supports iOS SettingsManager shape without nested settings key', () => {
    (NativeModules as any).SettingsManager = {
      AppleLanguages: ['ko-KR'],
    };

    const locale = getDeviceLocale();

    expect(locale).toBe('ko-KR');
  });

  it('falls back to en-US when neither iOS locale nor Intl locale is supported', () => {
    (NativeModules as any).SettingsManager.settings = {
      AppleLanguages: ['fr-FR'],
    };
    Intl.DateTimeFormat = (() => {
      throw new Error('Intl unavailable');
    }) as unknown as typeof Intl.DateTimeFormat;

    const locale = getDeviceLocale();

    expect(locale).toBe('en-US');
  });

  it('uses region fallback in iOS remote runtime when Intl returns en-KR', () => {
    (NativeModules as any).SettingsManager.settings = {};
    Intl.DateTimeFormat = (() => ({
      resolvedOptions: () => ({ locale: 'en-KR' }),
    })) as unknown as typeof Intl.DateTimeFormat;

    const locale = getDeviceLocale();

    expect(locale).toBe('ko-KR');
  });
});
