const mockInitialize = jest.fn();
const mockGatherConsent = jest.fn();

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({
    initialize: (...args: unknown[]) => mockInitialize(...args),
  }),
  TestIds: {
    REWARDED: 'test-rewarded-id',
  },
  AdsConsent: {
    gatherConsent: (...args: unknown[]) => mockGatherConsent(...args),
  },
}));

jest.mock('@/services/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('initializeGoogleAdsRuntime', () => {
  const originalEnv = process.env;

  const loadRuntimeModule = (): {
    initializeGoogleAdsRuntime: () => Promise<boolean>;
  } => {
    let loadedModule: { initializeGoogleAdsRuntime: () => Promise<boolean> } | null = null;

    jest.isolateModules(() => {
      loadedModule = jest.requireActual('../googleAdsRuntime') as {
        initializeGoogleAdsRuntime: () => Promise<boolean>;
      };
    });

    if (!loadedModule) {
      throw new Error('Failed to load googleAdsRuntime module');
    }

    return loadedModule;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env['EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED'] = '1';
    process.env['EXPO_PUBLIC_ADMOB_ANDROID_APP_ID'] = 'ca-app-pub-test~android';
    process.env['EXPO_PUBLIC_ADMOB_IOS_APP_ID'] = 'ca-app-pub-test~ios';
    mockInitialize.mockResolvedValue(undefined);
    mockGatherConsent.mockResolvedValue({
      status: 'OBTAINED',
      canRequestAds: true,
      privacyOptionsRequirementStatus: 'NOT_REQUIRED',
      isConsentFormAvailable: false,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('initializes ads when consent allows ad requests', async () => {
    const { initializeGoogleAdsRuntime } = loadRuntimeModule();

    await expect(initializeGoogleAdsRuntime()).resolves.toBe(true);
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('does not initialize ads when consent blocks ad requests', async () => {
    mockGatherConsent.mockResolvedValue({
      status: 'REQUIRED',
      canRequestAds: false,
      privacyOptionsRequirementStatus: 'REQUIRED',
      isConsentFormAvailable: true,
    });
    const { initializeGoogleAdsRuntime } = loadRuntimeModule();

    await expect(initializeGoogleAdsRuntime()).resolves.toBe(false);
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('does not initialize ads when consent gathering fails', async () => {
    mockGatherConsent.mockRejectedValue(new Error('consent failed'));
    const { initializeGoogleAdsRuntime } = loadRuntimeModule();

    await expect(initializeGoogleAdsRuntime()).resolves.toBe(false);
    expect(mockGatherConsent).toHaveBeenCalledTimes(1);
    expect(mockInitialize).not.toHaveBeenCalled();
  });
});
