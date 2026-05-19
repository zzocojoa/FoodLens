const { resolveBuildIdentity } = require("./buildIdentity");

const buildIdentity = resolveBuildIdentity({
  projectDir: __dirname,
  appVariant: process.env.APP_VARIANT,
  processEnv: process.env,
});

const IS_DEV = buildIdentity.appVariant === "development";
const APP_SLUG = "FoodLens";
const APP_VERSION = "1.0.0";
const APP_SCHEME = "foodlens";

const DEV_PLIST_PATH = "./Dev.plist";
const PROD_PLIST_PATH = "./Prod.plist";

const ICON_PATH = "./assets/images/icon.png";
const FAVICON_PATH = "./assets/images/favicon.png";
const SPLASH_IMAGE_PATH = "./assets/images/splash-icon.png";

const EAS_PROJECT_ID = "dab80641-3ca1-4633-a381-36ddbb37a22e";

const IOS_GOOGLE_SERVICES_FILE = IS_DEV ? DEV_PLIST_PATH : PROD_PLIST_PATH;
const IOS_BUNDLE_IDENTIFIER = buildIdentity.iosBundleIdentifier;
const ANDROID_APP_PACKAGE = buildIdentity.androidPackage;
const IOS_ALLOWS_LOCAL_NETWORKING = IS_DEV;
const ANDROID_GOOGLE_MAPS_API_KEY = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
const FALLBACK_GOOGLE_MAPS_API_KEY = "__MISSING_GOOGLE_MAPS_API_KEY__";
const GOOGLE_MOBILE_ADS_TEST_PUBLISHER_ID = "ca-app-pub-3940256099942544";
const EAS_BUILD_PROFILE = (process.env.EAS_BUILD_PROFILE || process.env.PHASE6_BUILD_PROFILE || "").trim();
const IS_EAS_PRODUCTION_PROFILE = EAS_BUILD_PROFILE === "production";
const GOOGLE_ADS_ANALYSIS_ENABLED = (
  process.env.EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED || ""
).trim();
const ADMOB_ANDROID_TEST_APP_ID = "ca-app-pub-3940256099942544~3347511713";
const ADMOB_IOS_TEST_APP_ID = "ca-app-pub-3940256099942544~1458002511";
const ONBOARDING_PREVIEW_ENABLED =
  (process.env.EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED || "0").trim();

const EXPO_BUILD_IDENTITY = {
  appName: buildIdentity.appName,
  appVariant: buildIdentity.appVariant,
  installTrack: buildIdentity.installTrack,
  buildSourceLabel: buildIdentity.buildSourceLabel,
  worktreeName: buildIdentity.worktreeName,
  workspaceDisplayName: buildIdentity.workspaceDisplayName,
  isCanonicalPackageContext: buildIdentity.isCanonicalPackageContext,
  isWorkspacePackageContext: buildIdentity.isWorkspacePackageContext,
  androidPackage: buildIdentity.androidPackage,
  iosBundleIdentifier: buildIdentity.iosBundleIdentifier,
  gitBranch: buildIdentity.gitBranch,
  gitCommitSha: buildIdentity.gitCommitSha,
  gitCommitShortSha: buildIdentity.gitCommitShortSha,
  gitDirty: buildIdentity.gitDirty,
  builtAtIso: buildIdentity.builtAtIso,
};

if (!ANDROID_GOOGLE_MAPS_API_KEY) {
  console.warn(
    "[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is missing. " +
      "Using placeholder key; Android map runtime may not function."
  );
}

const isEnabledFlag = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
};

const isGoogleMobileAdsTestId = (value) => {
  return String(value || "").includes(GOOGLE_MOBILE_ADS_TEST_PUBLISHER_ID);
};

const resolveAdMobAppId = (envName, testAppId) => {
  const configuredAppId = (process.env[envName] || "").trim();
  if (IS_EAS_PRODUCTION_PROFILE && isGoogleMobileAdsTestId(configuredAppId)) {
    throw new Error(`[app.config] ${envName} must not use a Google Mobile Ads test app id in production.`);
  }
  if (configuredAppId) {
    return configuredAppId;
  }
  if (IS_EAS_PRODUCTION_PROFILE) {
    if (isEnabledFlag(GOOGLE_ADS_ANALYSIS_ENABLED)) {
      throw new Error(`[app.config] ${envName} is required when production analysis ads are enabled.`);
    }
    return "";
  }
  return testAppId;
};

const ADMOB_ANDROID_APP_ID = resolveAdMobAppId(
  "EXPO_PUBLIC_ADMOB_ANDROID_APP_ID",
  ADMOB_ANDROID_TEST_APP_ID
);
const ADMOB_IOS_APP_ID = resolveAdMobAppId("EXPO_PUBLIC_ADMOB_IOS_APP_ID", ADMOB_IOS_TEST_APP_ID);
const GOOGLE_MOBILE_ADS_PLUGIN =
  ADMOB_ANDROID_APP_ID && ADMOB_IOS_APP_ID
    ? [
        [
          "react-native-google-mobile-ads",
          {
            androidAppId: ADMOB_ANDROID_APP_ID,
            iosAppId: ADMOB_IOS_APP_ID,
            delayAppMeasurementInit: true,
            optimizeInitialization: true,
            optimizeAdLoading: true,
          },
        ],
      ]
    : [];

module.exports = {
  expo: {
    name: buildIdentity.appName,
    slug: APP_SLUG,
    version: APP_VERSION,
    orientation: "portrait",
    icon: ICON_PATH,
    scheme: APP_SCHEME,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
      googleServicesFile: IOS_GOOGLE_SERVICES_FILE,
      entitlements: {
        "keychain-access-groups": [`$(AppIdentifierPrefix)${IOS_BUNDLE_IDENTIFIER}`],
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: IOS_ALLOWS_LOCAL_NETWORKING,
        },
      },
    },
    android: {
      package: ANDROID_APP_PACKAGE,
      config: {
        googleMaps: {
          apiKey: ANDROID_GOOGLE_MAPS_API_KEY || FALLBACK_GOOGLE_MAPS_API_KEY,
        },
      },
      adaptiveIcon: {
        backgroundColor: "#FAFBF7",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: "static",
      favicon: FAVICON_PATH,
    },
    plugins: [
      "expo-router",
      "./plugins/withGradlePluginPortal",
      "./plugins/withResultShareModule",
      "expo-secure-store",
      "@sentry/react-native",
      ...GOOGLE_MOBILE_ADS_PLUGIN,
      [
        "expo-splash-screen",
        {
          image: SPLASH_IMAGE_PATH,
          imageWidth: 240,
          resizeMode: "contain",
          backgroundColor: "#FFFFFF",
          dark: {
            backgroundColor: "#020617",
          },
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "Allow $(PRODUCT_NAME) to use the camera to scan food, labels, and barcodes for allergy analysis.",
          microphonePermission: false,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Allow $(PRODUCT_NAME) to access your photo library to select food or label images for analysis.",
          cameraPermission:
            "Allow $(PRODUCT_NAME) to take photos of food and labels for allergy and nutrition analysis.",
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to use your location to identify the country you are in for localized food safety information.",
          locationAlwaysPermission:
            "Allow $(PRODUCT_NAME) to use your location in the background to provide localized food safety information.",
          locationWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to use your location to identify local food regulations and provide country-specific allergy warnings.",
        },
      ],
      [
        "expo-media-library",
        {
          photosPermission:
            "Allow $(PRODUCT_NAME) to access your photos to save analysis results.",
          savePhotosPermission:
            "Allow $(PRODUCT_NAME) to save photos to your library.",
          isAccessMediaLocationEnabled: true,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
      onboardingPreviewEnabled: ONBOARDING_PREVIEW_ENABLED,
      buildIdentity: EXPO_BUILD_IDENTITY,
    },
  },
};
