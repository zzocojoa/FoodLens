export type GoogleAdsConfig = {
  analysisAdsEnabled: boolean;
  rewardedAnalysisAdUnitId: string | null;
};

export const getGoogleAdsConfig = (): GoogleAdsConfig => {
  return {
    analysisAdsEnabled: false,
    rewardedAnalysisAdUnitId: null,
  };
};
