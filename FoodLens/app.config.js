const IS_DEV = process.env.APP_VARIANT === "development";

export default {
  expo: {
    name: IS_DEV ? "FoodLens (Dev)" : "FoodLens",
    slug: "FoodLens",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "foodlens",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV
        ? "com.hoihou.foodlens.dev"
        : "com.hoihou.foodlens",
      // Dynamically load the correct plist
      googleServicesFile: IS_DEV ? "./Dev.plist" : "./Prod.plist",
    },
    android: {
      package: IS_DEV ? "com.hoihou.foodlens.dev" : "com.hoihou.foodlens",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      // googleServicesFile: IS_DEV ? "./google-services-dev.json" : "./google-services-prod.json", // If Android needed
    },
    web: {
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
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
        projectId: "dab80641-3ca1-4633-a381-36ddbb37a22e",
      },
    },
  },
};
