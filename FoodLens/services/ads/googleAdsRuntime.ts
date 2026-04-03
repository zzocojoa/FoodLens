import mobileAds, { AdsConsent, type AdsConsentInfo } from 'react-native-google-mobile-ads';
import { logger } from '@/services/logger';
import { getGoogleAdsConfig } from './googleAdsConfig';

let initializationPromise: Promise<boolean> | null = null;

const createGoogleAdsInitRequestId = (): string => {
  return `ads-init-${Date.now().toString(36)}`;
};

const gatherConsentSafely = async (): Promise<AdsConsentInfo | null> => {
  try {
    return await AdsConsent.gatherConsent();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      'Google Ads consent gathering failed',
      {
        request_id: createGoogleAdsInitRequestId(),
        user_id: 'unknown',
        error: message,
      },
      'Ads'
    );
    return null;
  }
};

const initializeAdsInternal = async (): Promise<boolean> => {
  const config = getGoogleAdsConfig();
  if (!config.analysisAdsEnabled) {
    return false;
  }

  try {
    const consentInfo = await gatherConsentSafely();
    if (!consentInfo?.canRequestAds) {
      logger.warn(
        'Google Ads request blocked by consent state',
        {
          request_id: createGoogleAdsInitRequestId(),
          user_id: 'unknown',
          consent_status: consentInfo?.status ?? 'unknown',
          can_request_ads: consentInfo?.canRequestAds ?? false,
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
