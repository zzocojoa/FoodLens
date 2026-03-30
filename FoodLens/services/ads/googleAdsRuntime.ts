import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';
import { logger } from '@/services/logger';
import { getGoogleAdsConfig } from './googleAdsConfig';

let initializationPromise: Promise<boolean> | null = null;

const createGoogleAdsInitRequestId = (): string => {
  return `ads-init-${Date.now().toString(36)}`;
};

const gatherConsentSafely = async (): Promise<void> => {
  try {
    await AdsConsent.gatherConsent();
  } catch (error) {
    // Consent form may not be configured in AdMob dashboard yet.
    // This is expected during early development / testing.
    // We log the warning but do NOT block SDK initialization.
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      'Google Ads consent gathering failed, proceeding with SDK init',
      {
        request_id: createGoogleAdsInitRequestId(),
        user_id: 'unknown',
        error: message,
      },
      'Ads'
    );
  }
};

const initializeAdsInternal = async (): Promise<boolean> => {
  const config = getGoogleAdsConfig();
  if (!config.analysisAdsEnabled) {
    return false;
  }

  try {
    await gatherConsentSafely();
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
