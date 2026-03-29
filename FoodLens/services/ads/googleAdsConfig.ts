import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

export type GoogleAdsConfig = {
  analysisAdsEnabled: boolean;
  rewardedAnalysisAdUnitId: string | null;
};

const trimEnv = (value: string | undefined): string => {
  return (value ?? '').trim();
};

const isEnabledFlag = (value: string | undefined): boolean => {
  return value === '1' || value === 'true';
};

const resolvePlatformAppId = (): string => {
  if (Platform.OS === 'ios') {
    return trimEnv(process.env['EXPO_PUBLIC_ADMOB_IOS_APP_ID']);
  }

  return trimEnv(process.env['EXPO_PUBLIC_ADMOB_ANDROID_APP_ID']);
};

const resolvePlatformRewardedAdUnitId = (): string => {
  if (__DEV__) {
    return TestIds.REWARDED;
  }

  if (Platform.OS === 'ios') {
    return trimEnv(process.env['EXPO_PUBLIC_ADMOB_IOS_REWARDED_ANALYSIS_ID']);
  }

  return trimEnv(process.env['EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ANALYSIS_ID']);
};

export const getGoogleAdsConfig = (): GoogleAdsConfig => {
  const adsEnabled = isEnabledFlag(process.env['EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED']);
  const platformAppId = resolvePlatformAppId();
  const rewardedAnalysisAdUnitId = resolvePlatformRewardedAdUnitId();
  const isConfigured = platformAppId.length > 0 && rewardedAnalysisAdUnitId.length > 0;

  if (!adsEnabled || !isConfigured) {
    return {
      analysisAdsEnabled: false,
      rewardedAnalysisAdUnitId: null,
    };
  }

  return {
    analysisAdsEnabled: true,
    rewardedAnalysisAdUnitId,
  };
};
