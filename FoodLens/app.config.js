const IS_DEV = process.env.APP_VARIANT === "development";

const APP_NAME = "FoodLens";
const APP_NAME_DEV = "FoodLens (Dev)";
const APP_SLUG = "FoodLens";
const APP_VERSION = "1.0.0";
const APP_SCHEME = "foodlens";

const IOS_BUNDLE_ID = "com.hoihou.foodlens";
const IOS_BUNDLE_ID_DEV = "com.hoihou.foodlens.dev";
const ANDROID_PACKAGE = "com.hoihou.foodlens";
const ANDROID_PACKAGE_DEV = "com.hoihou.foodlens.dev";

const DEV_PLIST_PATH = "./Dev.plist";
const PROD_PLIST_PATH = "./Prod.plist";

const ICON_PATH = "./assets/images/icon.png";
const FAVICON_PATH = "./assets/images/favicon.png";
const SPLASH_IMAGE_PATH = "./assets/images/splash-icon.png";

const EAS_PROJECT_ID = "dab80641-3ca1-4633-a381-36ddbb37a22e";

const IOS_GOOGLE_SERVICES_FILE = IS_DEV ? DEV_PLIST_PATH : PROD_PLIST_PATH;
const IOS_BUNDLE_IDENTIFIER = IS_DEV ? IOS_BUNDLE_ID_DEV : IOS_BUNDLE_ID;
const ANDROID_APP_PACKAGE = IS_DEV ? ANDROID_PACKAGE_DEV : ANDROID_PACKAGE;

export default {
  expo: {
    name: IS_DEV ? APP_NAME_DEV : APP_NAME,
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
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
          NSAllowsLocalNetworking: true,
        },
      },
    },
    android: {
      package: ANDROID_APP_PACKAGE,
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
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
      "expo-secure-store",
      "@sentry/react-native",
      [
        "expo-splash-screen",
        {
          image: SPLASH_IMAGE_PATH,
          imageWidth: 1242,
          resizeMode: "contain",
          backgroundColor: "#010105",
          imagePosition: "top",
          dark: {
            backgroundColor: "#010105",
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
    },
  },
};
