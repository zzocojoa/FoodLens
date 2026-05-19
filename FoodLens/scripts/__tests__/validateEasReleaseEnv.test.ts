type BuildProfile = {
  env: Record<string, string>;
};

type EasConfig = {
  build: Record<string, BuildProfile>;
  submit: {
    production: {
      android: {
        serviceAccountKeyPath: string;
        track: string;
        releaseStatus: string;
      };
    };
  };
};

type ReleaseEnvGate = {
  collectExpoConfigErrors: (expoConfig: unknown, processEnv: Record<string, string>) => string[];
  collectProductionEnvErrors: (
    easConfig: EasConfig,
    processEnv: Record<string, string>,
    buildProfile: string
  ) => string[];
};

const releaseEnvGate = require('../validate-eas-release-env') as ReleaseEnvGate;

const validSubmitConfig = {
  production: {
    android: {
      serviceAccountKeyPath: './artifacts/phase6/google-play-service-account.json',
      track: 'internal',
      releaseStatus: 'draft',
    },
  },
};

describe('validate-eas-release-env', () => {
  it('rejects Google Mobile Ads test ids in the production profile', () => {
    const errors = releaseEnvGate.collectProductionEnvErrors(
      {
        build: {
          production: {
            env: {
              EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED: '1',
              EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-3940256099942544~3347511713',
              EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ANALYSIS_ID:
                'ca-app-pub-3940256099942544/5224354917',
            },
          },
        },
        submit: validSubmitConfig,
      },
      {},
      'production'
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID'),
        expect.stringContaining('EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ANALYSIS_ID'),
      ])
    );
  });

  it('allows production profile without ads enabled and without committed ad ids', () => {
    const errors = releaseEnvGate.collectProductionEnvErrors(
      {
        build: {
          production: {
            env: {
              EXPO_PUBLIC_ANALYSIS_SERVER_URL: 'https://foodlens-2-w1xu.onrender.com',
            },
          },
        },
        submit: validSubmitConfig,
      },
      {},
      'production'
    );

    expect(errors).toEqual([]);
  });

  it('requires production ad ids when ads are enabled from the environment', () => {
    const errors = releaseEnvGate.collectProductionEnvErrors(
      {
        build: {
          production: {
            env: {},
          },
        },
        submit: validSubmitConfig,
      },
      {
        EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED: '1',
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
        EXPO_PUBLIC_ADMOB_IOS_APP_ID: 'ca-app-pub-1234567890123456~2345678901',
        EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ANALYSIS_ID:
          'ca-app-pub-1234567890123456/3456789012',
        EXPO_PUBLIC_ADMOB_IOS_REWARDED_ANALYSIS_ID:
          'ca-app-pub-1234567890123456/4567890123',
      },
      'production'
    );

    expect(errors).toEqual([]);
  });

  it('rejects test app ids resolved into the app config plugin', () => {
    const errors = releaseEnvGate.collectExpoConfigErrors(
      {
        expo: {
          android: { package: 'com.hoihou.foodlens' },
          ios: { bundleIdentifier: 'com.hoihou.foodlens' },
          plugins: [
            [
              'react-native-google-mobile-ads',
              {
                androidAppId: 'ca-app-pub-3940256099942544~3347511713',
                iosAppId: 'ca-app-pub-1234567890123456~2345678901',
              },
            ],
          ],
        },
      },
      {}
    );

    expect(errors).toEqual([expect.stringContaining('androidAppId')]);
  });
});
