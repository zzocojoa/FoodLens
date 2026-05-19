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
  collectBuildProfileEnvErrors: (easConfig: { build: Record<string, BuildProfile> }) => string[];
  collectExpoConfigErrors: (expoConfig: unknown, processEnv: Record<string, string>) => string[];
  collectPackageConfigErrors: (packageConfig: PackageConfig) => string[];
  collectPackageLockConfigErrors: (packageLockConfig: PackageLockConfig) => string[];
  collectProductionEnvErrors: (
    easConfig: EasConfig,
    processEnv: Record<string, string>,
    buildProfile: string
  ) => string[];
};

type PackageConfig = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type PackageLockConfig = {
  packages?: Record<string, PackageConfig>;
  dependencies?: Record<string, unknown>;
};

const releaseEnvGate = jest.requireActual('../validate-eas-release-env') as ReleaseEnvGate;

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
  it('rejects removed ad integration traces in the production profile', () => {
    const errors = releaseEnvGate.collectProductionEnvErrors(
      {
        build: {
          production: {
            env: {
              EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED: '1',
              EXPO_PUBLIC_GOOGLE_MOBILE_ADS_JSON: 'e30=',
              EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: '',
              EXPO_PUBLIC_ANALYSIS_AD_UNIT: 'ca-app-pub-3940256099942544/5224354917',
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
        expect.stringContaining('EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED'),
        expect.stringContaining('EXPO_PUBLIC_GOOGLE_MOBILE_ADS_JSON'),
        expect.stringContaining('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID'),
        expect.stringContaining('EXPO_PUBLIC_ANALYSIS_AD_UNIT'),
      ])
    );
  });

  it('allows production profile without ad integration traces', () => {
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

  it('rejects removed ad integration traces from non-production profile env too', () => {
    const errors = releaseEnvGate.collectProductionEnvErrors(
      {
        build: {
          preview: {
            env: {
              EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED: '1',
            },
          },
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

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('preview.env.EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED'),
      ])
    );
  });

  it('rejects disabled Google Ads profile env keys because the integration was removed', () => {
    const errors = releaseEnvGate.collectProductionEnvErrors(
      {
        build: {
          production: {
            env: {
              EXPO_PUBLIC_ANALYSIS_SERVER_URL: 'https://foodlens-2-w1xu.onrender.com',
              EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED: '0',
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
        expect.stringContaining('EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED'),
      ])
    );
  });

  it('rejects removed ad integration traces from the process environment', () => {
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
      {
        EXPO_PUBLIC_ADMOB_ANDROID_APP_ID: 'ca-app-pub-1234567890123456~1234567890',
      },
      'production'
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID'),
      ])
    );
  });

  it('rejects the Google Mobile Ads config plugin in the Expo config', () => {
    const errors = releaseEnvGate.collectExpoConfigErrors(
      {
        expo: {
          android: { package: 'com.hoihou.foodlens' },
          ios: { bundleIdentifier: 'com.hoihou.foodlens' },
          plugins: [
            [
              'react-native-google-mobile-ads',
              {},
            ],
          ],
        },
      },
      {}
    );

    expect(errors).toEqual([expect.stringContaining('react-native-google-mobile-ads')]);
  });

  it('allows Expo config without the Google Mobile Ads config plugin', () => {
    const errors = releaseEnvGate.collectExpoConfigErrors(
      {
        expo: {
          android: { package: 'com.hoihou.foodlens' },
          ios: { bundleIdentifier: 'com.hoihou.foodlens' },
          plugins: ['expo-router'],
        },
      },
      {}
    );

    expect(errors).toEqual([]);
  });

  it('rejects the Google Mobile Ads package in all dependency sections', () => {
    const errors = releaseEnvGate.collectPackageConfigErrors({
      dependencies: {
        'react-native-google-mobile-ads': '^14.0.0',
      },
      devDependencies: {
        'react-native-google-mobile-ads': '^14.0.0',
      },
      peerDependencies: {
        'react-native-google-mobile-ads': '^14.0.0',
      },
      optionalDependencies: {
        'react-native-google-mobile-ads': '^14.0.0',
      },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('dependencies.react-native-google-mobile-ads'),
        expect.stringContaining('devDependencies.react-native-google-mobile-ads'),
        expect.stringContaining('peerDependencies.react-native-google-mobile-ads'),
        expect.stringContaining('optionalDependencies.react-native-google-mobile-ads'),
      ])
    );
  });

  it('rejects the Google Mobile Ads package in package-lock traces', () => {
    const errors = releaseEnvGate.collectPackageLockConfigErrors({
      packages: {
        '': {
          dependencies: {
            'react-native-google-mobile-ads': '^16.3.1',
          },
        },
        'node_modules/react-native-google-mobile-ads': {},
      },
      dependencies: {
        'react-native-google-mobile-ads': {
          version: '16.3.1',
        },
      },
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('packages[""].dependencies.react-native-google-mobile-ads'),
        expect.stringContaining('packages.node_modules/react-native-google-mobile-ads'),
        expect.stringContaining('dependencies.react-native-google-mobile-ads'),
      ])
    );
  });
});
