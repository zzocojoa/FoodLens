type Translate = (key: string, fallback?: string) => string;

type UseScanAnalysisAdGateParams = {
  t: Translate;
};

type UseScanAnalysisAdGateResult = {
  analysisAdsEnabled: boolean;
  ensureAnalysisAccess: () => Promise<boolean>;
};

export const useScanAnalysisAdGate = (
  _params: UseScanAnalysisAdGateParams
): UseScanAnalysisAdGateResult => {
  return {
    analysisAdsEnabled: false,
    ensureAnalysisAccess: async (): Promise<boolean> => {
      return true;
    },
  };
};
