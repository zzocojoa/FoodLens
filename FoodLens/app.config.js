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
const OAUTH_REDIRECT_BASE_URL_ENV = "EXPO_PUBLIC_OAUTH_REDIRECT_BASE_URL";

const DEV_PLIST_PATH = "./Dev.plist";
const PROD_PLIST_PATH = "./Prod.plist";

const ICON_PATH = "./assets/images/icon.png";
const IOS_ICON_PATH = "./assets/images/ios-icon.png";
const FAVICON_PATH = "./assets/images/favicon.png";
const SPLASH_IMAGE_PATH = "./assets/images/splash-icon.png";
const SPLASH_IMAGE_WIDTH = 240;
const SPLASH_RESIZE_MODE = "contain";
const SPLASH_BACKGROUND_COLOR = "#FFFFFF";
const IOS_SPLASH_DARK_BACKGROUND_COLOR = SPLASH_BACKGROUND_COLOR;
const ANDROID_SPLASH_DARK_BACKGROUND_COLOR = "#020617";

const EAS_PROJECT_ID = "dab80641-3ca1-4633-a381-36ddbb37a22e";

const IOS_GOOGLE_SERVICES_FILE = IS_DEV ? DEV_PLIST_PATH : PROD_PLIST_PATH;
const IOS_BUNDLE_IDENTIFIER = buildIdentity.iosBundleIdentifier;
const ANDROID_APP_PACKAGE = buildIdentity.androidPackage;
const APP_SCHEMES = [APP_SCHEME, IOS_BUNDLE_IDENTIFIER];
const IOS_ALLOWS_LOCAL_NETWORKING = IS_DEV;
const ANDROID_GOOGLE_MAPS_API_KEY = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "").trim();
const FALLBACK_GOOGLE_MAPS_API_KEY = "__MISSING_GOOGLE_MAPS_API_KEY__";
const ONBOARDING_PREVIEW_ENABLED =
  (process.env.EXPO_PUBLIC_ONBOARDING_PREVIEW_ENABLED || "0").trim();
const OAUTH_REDIRECT_PATH_PREFIX = "/oauth/";

const resolveOAuthRedirectOrigin = (rawBaseUrl) => {
  const normalizedBaseUrl = (rawBaseUrl || "").trim();
  if (!normalizedBaseUrl) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(normalizedBaseUrl);
  } catch (error) {
    throw new Error(`${OAUTH_REDIRECT_BASE_URL_ENV} must be a valid HTTPS origin.`);
  }

  const hasPath = parsed.pathname !== "" && parsed.pathname !== "/";
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    hasPath ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${OAUTH_REDIRECT_BASE_URL_ENV} must be an HTTPS origin without credentials, port, path, query, or fragment.`
    );
  }

  return parsed.origin.replace(/\/+$/, "");
};

const OAUTH_REDIRECT_ORIGIN = resolveOAuthRedirectOrigin(
  process.env[OAUTH_REDIRECT_BASE_URL_ENV]
);
const OAUTH_APP_LINK_HOST = OAUTH_REDIRECT_ORIGIN ? new URL(OAUTH_REDIRECT_ORIGIN).hostname : "";
const IOS_ASSOCIATED_DOMAINS = OAUTH_APP_LINK_HOST ? [`applinks:${OAUTH_APP_LINK_HOST}`] : undefined;
const ANDROID_INTENT_FILTERS = OAUTH_APP_LINK_HOST
  ? [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: OAUTH_APP_LINK_HOST,
            pathPrefix: OAUTH_REDIRECT_PATH_PREFIX,
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ]
  : undefined;

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
const IOS_SPLASH_SCREEN_CONFIG = {
  image: SPLASH_IMAGE_PATH,
  imageWidth: SPLASH_IMAGE_WIDTH,
  resizeMode: SPLASH_RESIZE_MODE,
  backgroundColor: SPLASH_BACKGROUND_COLOR,
  dark: {
    backgroundColor: IOS_SPLASH_DARK_BACKGROUND_COLOR,
  },
};
const ANDROID_SPLASH_SCREEN_CONFIG = {
  image: SPLASH_IMAGE_PATH,
  imageWidth: SPLASH_IMAGE_WIDTH,
  resizeMode: SPLASH_RESIZE_MODE,
  backgroundColor: SPLASH_BACKGROUND_COLOR,
  dark: {
    backgroundColor: ANDROID_SPLASH_DARK_BACKGROUND_COLOR,
  },
};

if (!ANDROID_GOOGLE_MAPS_API_KEY) {
  console.warn(
    "[app.config] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is missing. " +
      "Using placeholder key; Android map runtime may not function."
  );
}

module.exports = {
  expo: {
    name: buildIdentity.appName,
    slug: APP_SLUG,
    version: APP_VERSION,
    orientation: "portrait",
    icon: ICON_PATH,
    scheme: APP_SCHEMES,
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      icon: IOS_ICON_PATH,
      bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
      googleServicesFile: IOS_GOOGLE_SERVICES_FILE,
      ...(IOS_ASSOCIATED_DOMAINS ? { associatedDomains: IOS_ASSOCIATED_DOMAINS } : {}),
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
      ...(ANDROID_INTENT_FILTERS ? { intentFilters: ANDROID_INTENT_FILTERS } : {}),
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
      [
        "expo-splash-screen",
        {
          ios: IOS_SPLASH_SCREEN_CONFIG,
          android: ANDROID_SPLASH_SCREEN_CONFIG,
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
