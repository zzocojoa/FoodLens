#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const TEST_PUBLISHER_ID = "ca-app-pub-3940256099942544";
const PRODUCTION_ANDROID_PACKAGE = "com.hoihou.foodlens";
const PRODUCTION_IOS_BUNDLE_IDENTIFIER = "com.hoihou.foodlens";
const REQUIRED_AD_ENV_KEYS = [
  "EXPO_PUBLIC_ADMOB_ANDROID_APP_ID",
  "EXPO_PUBLIC_ADMOB_IOS_APP_ID",
  "EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ANALYSIS_ID",
  "EXPO_PUBLIC_ADMOB_IOS_REWARDED_ANALYSIS_ID",
];

const trimValue = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const isEnabledFlag = (value) => {
  const normalized = trimValue(value).toLowerCase();
  return normalized === "1" || normalized === "true";
};

const isForbiddenAdValue = (value) => {
  const normalized = trimValue(value).toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes(TEST_PUBLISHER_ID) ||
    normalized.includes("ca-app-pub-test") ||
    normalized.includes("__missing_") ||
    normalized.startsWith("your_")
  );
};

const valueFromProfileOrEnv = (profileEnv, processEnv, key) => {
  const processValue = trimValue(processEnv[key]);
  if (processValue) {
    return processValue;
  }
  return trimValue(profileEnv[key]);
};

const collectProductionEnvErrors = (easConfig, processEnv, buildProfile) => {
  const errors = [];
  const buildProfiles = easConfig.build || {};
  const productionProfile = buildProfiles[buildProfile] || {};
  const profileEnv = productionProfile.env || {};

  for (const [key, value] of Object.entries(profileEnv)) {
    if (key.includes("ADMOB") && isForbiddenAdValue(String(value))) {
      errors.push(`${buildProfile}.${key} must not contain a Google Mobile Ads test or placeholder value.`);
    }
  }

  const adsEnabled = isEnabledFlag(
    valueFromProfileOrEnv(profileEnv, processEnv, "EXPO_PUBLIC_GOOGLE_ADS_ANALYSIS_ENABLED")
  );
  if (adsEnabled) {
    for (const key of REQUIRED_AD_ENV_KEYS) {
      const value = valueFromProfileOrEnv(profileEnv, processEnv, key);
      if (isForbiddenAdValue(value)) {
        errors.push(`${key} must be configured with a production value when analysis ads are enabled.`);
      }
    }
  }

  const submitProfile = (easConfig.submit || {})[buildProfile] || {};
  const androidSubmit = submitProfile.android || {};
  if (trimValue(androidSubmit.track) !== "internal") {
    errors.push(`${buildProfile}.submit.android.track must be internal for pre-store evidence builds.`);
  }
  if (trimValue(androidSubmit.releaseStatus) !== "draft") {
    errors.push(`${buildProfile}.submit.android.releaseStatus must be draft for pre-store evidence builds.`);
  }
  if (!trimValue(androidSubmit.serviceAccountKeyPath)) {
    errors.push(`${buildProfile}.submit.android.serviceAccountKeyPath is required.`);
  }

  return errors;
};

const pluginName = (plugin) => {
  if (Array.isArray(plugin)) {
    return plugin[0];
  }
  return plugin;
};

const pluginOptions = (plugin) => {
  if (Array.isArray(plugin) && typeof plugin[1] === "object" && plugin[1] !== null) {
    return plugin[1];
  }
  return {};
};

const collectExpoConfigErrors = (expoConfig, processEnv) => {
  const errors = [];
  const expo = expoConfig.expo || {};
  const expectedAndroidPackage =
    trimValue(processEnv.PHASE6_EXPECTED_ANDROID_PACKAGE) || PRODUCTION_ANDROID_PACKAGE;
  const expectedIosBundleIdentifier =
    trimValue(processEnv.PHASE6_EXPECTED_IOS_BUNDLE_IDENTIFIER) || PRODUCTION_IOS_BUNDLE_IDENTIFIER;
  if ((expo.android || {}).package !== expectedAndroidPackage) {
    errors.push(`production Android package must be ${expectedAndroidPackage}.`);
  }
  if ((expo.ios || {}).bundleIdentifier !== expectedIosBundleIdentifier) {
    errors.push(`production iOS bundle identifier must be ${expectedIosBundleIdentifier}.`);
  }

  for (const plugin of expo.plugins || []) {
    if (pluginName(plugin) !== "react-native-google-mobile-ads") {
      continue;
    }
    const options = pluginOptions(plugin);
    for (const key of ["androidAppId", "iosAppId"]) {
      if (isForbiddenAdValue(options[key])) {
        errors.push(`react-native-google-mobile-ads ${key} must not use a test or placeholder value.`);
      }
    }
  }

  return errors;
};

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON file: ${filePath}`);
  }
};

const runValidation = (params) => {
  const projectDir = params.projectDir;
  const processEnv = params.processEnv;
  const buildProfile = trimValue(processEnv.PHASE6_BUILD_PROFILE || processEnv.EAS_BUILD_PROFILE) || "production";
  if (buildProfile !== "production") {
    throw new Error(`Unsupported release build profile: ${buildProfile}`);
  }

  const easConfig = readJsonFile(path.join(projectDir, "eas.json"));
  const profileEnv = (((easConfig.build || {})[buildProfile] || {}).env || {});
  const previousForceCanonical = processEnv.FOODLENS_FORCE_CANONICAL_PACKAGE;
  const previousEasBuildProfile = processEnv.EAS_BUILD_PROFILE;
  const previousProfileEnvValues = new Map();
  for (const [key, value] of Object.entries(profileEnv)) {
    previousProfileEnvValues.set(key, processEnv[key]);
    if (!trimValue(processEnv[key])) {
      processEnv[key] = String(value);
    }
  }
  processEnv.FOODLENS_FORCE_CANONICAL_PACKAGE = "1";
  processEnv.EAS_BUILD_PROFILE = buildProfile;
  try {
    const appConfigPath = path.join(projectDir, "app.config.js");
    delete require.cache[require.resolve(appConfigPath)];
    const expoConfig = require(appConfigPath);
    return [
      ...collectProductionEnvErrors(easConfig, processEnv, buildProfile),
      ...collectExpoConfigErrors(expoConfig, processEnv),
    ];
  } finally {
    if (previousForceCanonical === undefined) {
      delete processEnv.FOODLENS_FORCE_CANONICAL_PACKAGE;
    } else {
      processEnv.FOODLENS_FORCE_CANONICAL_PACKAGE = previousForceCanonical;
    }
    if (previousEasBuildProfile === undefined) {
      delete processEnv.EAS_BUILD_PROFILE;
    } else {
      processEnv.EAS_BUILD_PROFILE = previousEasBuildProfile;
    }
    for (const [key, value] of previousProfileEnvValues.entries()) {
      if (value === undefined) {
        delete processEnv[key];
      } else {
        processEnv[key] = value;
      }
    }
  }
};

const main = () => {
  const projectDir = path.resolve(__dirname, "..");
  const errors = runValidation({ projectDir, processEnv: process.env });
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[ReleaseEnvGate] ${error}`);
    }
    return 1;
  }
  console.log("[ReleaseEnvGate] production release env checks passed.");
  return 0;
};

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  collectExpoConfigErrors,
  collectProductionEnvErrors,
  isForbiddenAdValue,
  runValidation,
};
