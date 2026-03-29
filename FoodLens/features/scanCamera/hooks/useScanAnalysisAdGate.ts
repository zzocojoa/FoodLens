import React from 'react';
import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';
import { showAlert, showTranslatedAlert } from '@/services/ui/uiAlerts';
import { getGoogleAdsConfig } from '@/services/ads/googleAdsConfig';
import { initializeGoogleAdsRuntime } from '@/services/ads/googleAdsRuntime';

type Translate = (key: string, fallback?: string) => string;

type UseScanAnalysisAdGateParams = {
  t: Translate;
};

type RewardedRequestOptions = {
  requestNonPersonalizedAdsOnly: boolean;
  keywords: string[];
};

const AD_LOAD_TIMEOUT_MS = 10_000;

const createRewardedRequestOptions = (): RewardedRequestOptions => {
  return {
    requestNonPersonalizedAdsOnly: true,
    keywords: ['food', 'travel', 'allergy'],
  };
};

const removeResolver = (
  resolvers: ((value: boolean) => void)[],
  resolver: (value: boolean) => void
): ((value: boolean) => void)[] => {
  return resolvers.filter((entry) => entry !== resolver);
};

const promptRewardedAdOptIn = async (t: Translate): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    showAlert(
      t('scan.ads.unlockTitle', 'Watch an ad to analyze'),
      t(
        'scan.ads.unlockMessage',
        'Watch a short ad to unlock this analysis. You can cancel and return without starting the analysis.'
      ),
      [
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: t('scan.ads.watchButton', 'Watch Ad'),
          onPress: () => resolve(true),
        },
      ]
    );
  });
};

export const useScanAnalysisAdGate = ({ t }: UseScanAnalysisAdGateParams) => {
  const config = React.useMemo(() => getGoogleAdsConfig(), []);
  const adRef = React.useRef<RewardedAd | null>(null);
  const adLoadedRef = React.useRef(false);
  const rewardEarnedRef = React.useRef(false);
  const loadResolversRef = React.useRef<((value: boolean) => void)[]>([]);
  const rewardResolversRef = React.useRef<((value: boolean) => void)[]>([]);

  const resolveLoadWaiters = React.useCallback((value: boolean): void => {
    const resolvers = [...loadResolversRef.current];
    loadResolversRef.current = [];
    resolvers.forEach((resolver) => resolver(value));
  }, []);

  const resolveRewardWaiters = React.useCallback((value: boolean): void => {
    const resolvers = [...rewardResolversRef.current];
    rewardResolversRef.current = [];
    resolvers.forEach((resolver) => resolver(value));
  }, []);

  const buildRewardedAd = React.useCallback((): RewardedAd | null => {
    if (!config.analysisAdsEnabled || !config.rewardedAnalysisAdUnitId) {
      return null;
    }

    const ad = RewardedAd.createForAdRequest(
      config.rewardedAnalysisAdUnitId,
      createRewardedRequestOptions()
    );

    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      adLoadedRef.current = true;
      resolveLoadWaiters(true);
    });

    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      rewardEarnedRef.current = true;
    });

    ad.addAdEventListener(AdEventType.CLOSED, () => {
      const rewardEarned = rewardEarnedRef.current;
      rewardEarnedRef.current = false;
      adLoadedRef.current = false;
      resolveRewardWaiters(rewardEarned);
    });

    ad.addAdEventListener(AdEventType.ERROR, () => {
      adLoadedRef.current = false;
      rewardEarnedRef.current = false;
      resolveLoadWaiters(false);
      resolveRewardWaiters(false);
    });

    return ad;
  }, [config.analysisAdsEnabled, config.rewardedAnalysisAdUnitId, resolveLoadWaiters, resolveRewardWaiters]);

  const getRewardedAd = React.useCallback((): RewardedAd | null => {
    if (!adRef.current) {
      adRef.current = buildRewardedAd();
    }

    return adRef.current;
  }, [buildRewardedAd]);

  const loadRewardedAd = React.useCallback((): void => {
    const ad = getRewardedAd();
    if (!ad) {
      return;
    }

    adLoadedRef.current = false;
    ad.load();
  }, [getRewardedAd]);

  React.useEffect(() => {
    let isMounted = true;

    if (!config.analysisAdsEnabled) {
      return () => {
        isMounted = false;
      };
    }

    void initializeGoogleAdsRuntime().then((canRequestAds) => {
      if (!isMounted || !canRequestAds) {
        return;
      }

      loadRewardedAd();
    });

    return () => {
      isMounted = false;
    };
  }, [config.analysisAdsEnabled, loadRewardedAd]);

  const waitForRewardedAd = React.useCallback(async (): Promise<boolean> => {
    if (adLoadedRef.current) {
      return true;
    }

    loadRewardedAd();

    return new Promise<boolean>((resolve) => {
      const resolver = (value: boolean) => {
        resolve(value);
      };

      loadResolversRef.current = [...loadResolversRef.current, resolver];
      setTimeout(() => {
        loadResolversRef.current = removeResolver(loadResolversRef.current, resolver);
        resolve(false);
      }, AD_LOAD_TIMEOUT_MS);
    });
  }, [loadRewardedAd]);

  const showRewardedAd = React.useCallback(async (): Promise<boolean> => {
    const ad = getRewardedAd();
    if (!ad) {
      return false;
    }

    rewardEarnedRef.current = false;

    const rewardPromise = new Promise<boolean>((resolve) => {
      rewardResolversRef.current = [...rewardResolversRef.current, resolve];
    });

    void ad.show();
    const rewardEarned = await rewardPromise;
    loadRewardedAd();
    return rewardEarned;
  }, [getRewardedAd, loadRewardedAd]);

  const ensureAnalysisAccess = React.useCallback(async (): Promise<boolean> => {
    if (!config.analysisAdsEnabled) {
      return true;
    }

    const initialized = await initializeGoogleAdsRuntime();
    if (!initialized) {
      showTranslatedAlert(t, {
        titleKey: 'scan.ads.unavailableTitle',
        titleFallback: 'Ads unavailable',
        messageKey: 'scan.ads.unavailableMessage',
        messageFallback: 'Analysis ads are not ready yet. Please try again shortly.',
      });
      return false;
    }

    const optedIn = await promptRewardedAdOptIn(t);
    if (!optedIn) {
      return false;
    }

    const adReady = await waitForRewardedAd();
    if (!adReady) {
      showTranslatedAlert(t, {
        titleKey: 'scan.ads.notReadyTitle',
        titleFallback: 'Ad not ready',
        messageKey: 'scan.ads.notReadyMessage',
        messageFallback: 'The ad is still loading. Please try again in a moment.',
      });
      return false;
    }

    const rewardEarned = await showRewardedAd();
    if (!rewardEarned) {
      showTranslatedAlert(t, {
        titleKey: 'scan.ads.incompleteTitle',
        titleFallback: 'Ad not completed',
        messageKey: 'scan.ads.incompleteMessage',
        messageFallback: 'You need to finish the ad to start this analysis.',
      });
    }

    return rewardEarned;
  }, [config.analysisAdsEnabled, showRewardedAd, t, waitForRewardedAd]);

  return {
    analysisAdsEnabled: config.analysisAdsEnabled,
    ensureAnalysisAccess,
  };
};
