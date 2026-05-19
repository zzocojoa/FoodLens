#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const PRODUCTION_ANDROID_PACKAGE = "com.hoihou.foodlens";
const PRODUCTION_IOS_BUNDLE_IDENTIFIER = "com.hoihou.foodlens";
const GOOGLE_MOBILE_ADS_PACKAGE_NAME = "react-native-google-mobile-ads";
const GOOGLE_MOBILE_ADS_PACKAGE_LOCK_PATH = `node_modules/${GOOGLE_MOBILE_ADS_PACKAGE_NAME}`;
const FORBIDDEN_EAS_ENV_MARKERS = ["ADMOB", "GOOGLE_ADS", "GOOGLE_MOBILE_ADS", "ca-app-pub"];
const PACKAGE_DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];

const trimValue = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const containsForbiddenEasEnvMarker = (value) => {
  const normalized = String(value || "").toLowerCase();
  return FORBIDDEN_EAS_ENV_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase())
  );
};

const collectForbiddenEnvMarkerErrors = (env, label) => {
  const errors = [];
  for (const [key, value] of Object.entries(env)) {
    if (containsForbiddenEasEnvMarker(key)) {
      errors.push(
        `${label}.${key} must be removed because AdMob and Google Ads env keys are forbidden.`
      );
    }
    if (containsForbiddenEasEnvMarker(value)) {
      errors.push(
        `${label}.${key} must not contain AdMob, Google Ads, or ca-app-pub values.`
      );
    }
  }
  return errors;
};

const collectBuildProfileEnvErrors = (easConfig) => {
  const errors = [];
  const buildProfiles = easConfig.build || {};
  for (const [profileName, profileConfig] of Object.entries(buildProfiles)) {
    const profileEnv = (profileConfig || {}).env || {};
    errors.push(...collectForbiddenEnvMarkerErrors(profileEnv, `${profileName}.env`));
  }
  return errors;
};

const collectProductionEnvErrors = (easConfig, processEnv, buildProfile) => {
  const errors = [];
  const buildProfiles = easConfig.build || {};

  errors.push(...collectBuildProfileEnvErrors(easConfig));
  errors.push(...collectForbiddenEnvMarkerErrors(processEnv, "process.env"));

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
    errors.push(
      "Expo config plugins must not include react-native-google-mobile-ads after AdMob removal."
    );
  }

  return errors;
};

const hasOwnProperty = (value, propertyName) => {
  return Object.prototype.hasOwnProperty.call(value, propertyName);
};

const collectPackageDependencySectionErrors = (packageConfig, label) => {
  const errors = [];
  for (const sectionName of PACKAGE_DEPENDENCY_SECTIONS) {
    const dependencies = packageConfig[sectionName] || {};
    if (hasOwnProperty(dependencies, GOOGLE_MOBILE_ADS_PACKAGE_NAME)) {
      errors.push(`${label}.${sectionName}.${GOOGLE_MOBILE_ADS_PACKAGE_NAME} must be removed.`);
    }
  }
  return errors;
};

const collectPackageConfigErrors = (packageConfig) => {
  return collectPackageDependencySectionErrors(packageConfig, "package.json");
};

const collectPackageLockConfigErrors = (packageLockConfig) => {
  const errors = [];
  const packages = packageLockConfig.packages || {};
  const rootPackage = packages[""] || {};

  errors.push(...collectPackageDependencySectionErrors(rootPackage, 'package-lock.json packages[""]'));

  if (hasOwnProperty(packages, GOOGLE_MOBILE_ADS_PACKAGE_LOCK_PATH)) {
    errors.push(`package-lock.json packages.${GOOGLE_MOBILE_ADS_PACKAGE_LOCK_PATH} must be removed.`);
  }

  const dependencies = packageLockConfig.dependencies || {};
  if (hasOwnProperty(dependencies, GOOGLE_MOBILE_ADS_PACKAGE_NAME)) {
    errors.push(`package-lock.json dependencies.${GOOGLE_MOBILE_ADS_PACKAGE_NAME} must be removed.`);
  }

  return errors;
};

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read JSON file: ${filePath}. ${message}`);
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
  const packageConfig = readJsonFile(path.join(projectDir, "package.json"));
  const packageLockConfig = readJsonFile(path.join(projectDir, "package-lock.json"));
  const profileEnv = (((easConfig.build || {})[buildProfile] || {}).env || {});
  const earlyErrors = [
    ...collectProductionEnvErrors(easConfig, processEnv, buildProfile),
    ...collectPackageConfigErrors(packageConfig),
    ...collectPackageLockConfigErrors(packageLockConfig),
  ];
  if (earlyErrors.length > 0) {
    return earlyErrors;
  }

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
    return collectExpoConfigErrors(expoConfig, processEnv);
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
  const scriptPath = trimValue(process.argv[1]);
  if (!scriptPath) {
    throw new Error("Unable to resolve release env gate script path.");
  }
  const projectDir = path.resolve(path.dirname(scriptPath), "..");
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
  collectBuildProfileEnvErrors,
  collectExpoConfigErrors,
  collectPackageConfigErrors,
  collectPackageLockConfigErrors,
  collectProductionEnvErrors,
  containsForbiddenEasEnvMarker,
  runValidation,
};
