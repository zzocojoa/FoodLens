import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';
import { logger } from '@/services/logger';
import { getGoogleAdsConfig } from './googleAdsConfig';

let initializationPromise: Promise<boolean> | null = null;

const createGoogleAdsInitRequestId = (): string => {
  return `ads-init-${Date.now().toString(36)}`;
};

const initializeAdsInternal = async (): Promise<boolean> => {
  const config = getGoogleAdsConfig();
  if (!config.analysisAdsEnabled) {
    return false;
  }

  try {
    await AdsConsent.gatherConsent();
    const consentInfo = await AdsConsent.getConsentInfo();
    if (!consentInfo.canRequestAds) {
      logger.warn(
        'Google Ads consent does not allow ad requests',
        {
          request_id: createGoogleAdsInitRequestId(),
          user_id: 'unknown',
          can_request_ads: consentInfo.canRequestAds,
        },
        'Ads'
      );
      return false;
    }

    await mobileAds().initialize();
    return true;
  } catch (error) {
    logger.error(
      'Google Ads initialization failed',
      {
        request_id: createGoogleAdsInitRequestId(),
        user_id: 'unknown',
        error: error instanceof Error ? error.message : String(error),
      },
      'Ads'
    );
    return false;
  }
};

export const initializeGoogleAdsRuntime = async (): Promise<boolean> => {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = initializeAdsInternal();
  const result = await initializationPromise;

  if (!result) {
    initializationPromise = null;
  }

  return result;
};
