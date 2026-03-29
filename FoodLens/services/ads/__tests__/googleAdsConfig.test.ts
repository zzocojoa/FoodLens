import { TestIds } from 'react-native-google-mobile-ads';

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: {
    REWARDED: 'test-rewarded-id',
  },
}));

describe('getGoogleAdsConfig', () => {
  const originalEnv = process.env;

  const loadConfigModule = (): { getGoogleAdsConfig: () => unknown } => {
    let loadedModule: { getGoogleAdsConfig: () => unknown } | null = null;

    jest.isolateModules(() => {
      loadedModule = jest.requireActual('../googleAdsConfig') as {
        getGoogleAdsConfig: () => unknown;
      };
    });

    if (!loadedModule) {
      throw new Error('Failed to load googleAdsConfig module');
    }

    return loadedModule;
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env['EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED'];
    delete process.env['EXPO_PUBLIC_ADMOB_ANDROID_APP_ID'];
    delete process.env['EXPO_PUBLIC_ADMOB_IOS_APP_ID'];
    delete process.env['EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ANALYSIS_ID'];
    delete process.env['EXPO_PUBLIC_ADMOB_IOS_REWARDED_ANALYSIS_ID'];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns disabled config when analysis ads flag is off', () => {
    const { getGoogleAdsConfig } = loadConfigModule();

    expect(getGoogleAdsConfig()).toEqual({
      analysisAdsEnabled: false,
      rewardedAnalysisAdUnitId: null,
    });
  });

  it('returns disabled config when native app ids are missing', () => {
    process.env['EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED'] = '1';
    process.env['EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ANALYSIS_ID'] = 'ca-app-pub-test/android';

    const { getGoogleAdsConfig } = loadConfigModule();

    expect(getGoogleAdsConfig()).toEqual({
      analysisAdsEnabled: false,
      rewardedAnalysisAdUnitId: null,
    });
  });

  it('uses rewarded test id in dev when ads are enabled and app ids are present', () => {
    process.env['EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED'] = '1';
    process.env['EXPO_PUBLIC_ADMOB_ANDROID_APP_ID'] = 'ca-app-pub-test~android';
    process.env['EXPO_PUBLIC_ADMOB_IOS_APP_ID'] = 'ca-app-pub-test~ios';

    const { getGoogleAdsConfig } = loadConfigModule();

    expect(getGoogleAdsConfig()).toEqual({
      analysisAdsEnabled: true,
      rewardedAnalysisAdUnitId: TestIds.REWARDED,
    });
  });
});
