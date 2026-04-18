const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const APP_NAME = "FoodLens";
const APP_NAME_DEV = "FoodLens (Dev)";
const CANONICAL_WORKTREE_NAME = "FoodLens-project";
const IOS_BUNDLE_ID = "com.hoihou.foodlens";
const IOS_BUNDLE_ID_DEV = "com.hoihou.foodlens.dev";
const ANDROID_PACKAGE = "com.hoihou.foodlens";
const ANDROID_PACKAGE_DEV = "com.hoihou.foodlens.dev";
const MAX_PACKAGE_SUFFIX_LENGTH = 24;

const trimString = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const isTruthyFlag = (value) => {
  const normalized = trimString(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const normalizeAppVariant = (value) => {
  return trimString(value) === "development" ? "development" : "production";
};

const resolveProjectDir = (projectDir) => {
  const normalizedProjectDir = trimString(projectDir);
  if (!normalizedProjectDir) {
    throw new Error("projectDir is required");
  }

  try {
    return fs.realpathSync(normalizedProjectDir);
  } catch (error) {
    return path.resolve(normalizedProjectDir);
  }
};

const resolveWorktreeName = (projectDir, processEnv) => {
  const overriddenWorktreeName = trimString(processEnv.FOODLENS_WORKTREE_NAME);
  if (overriddenWorktreeName) {
    return overriddenWorktreeName;
  }

  const projectDirectoryName = path.basename(projectDir);
  if (projectDirectoryName.toLowerCase() === "foodlens") {
    return path.basename(path.dirname(projectDir));
  }

  return projectDirectoryName;
};

const resolveCanonicalWorktreeName = (processEnv) => {
  const overriddenCanonicalWorktreeName = trimString(
    processEnv.FOODLENS_CANONICAL_WORKTREE_NAME
  );
  return overriddenCanonicalWorktreeName || CANONICAL_WORKTREE_NAME;
};

const sanitizePackageSuffix = (worktreeName, canonicalWorktreeName) => {
  const normalizedWorktreeName = trimString(worktreeName);
  const normalizedCanonicalWorktreeName = trimString(canonicalWorktreeName);

  const withoutFoodLensPrefix = normalizedWorktreeName.replace(/^foodlens[-_. ]*/i, "");
  const withoutCanonicalPrefix =
    withoutFoodLensPrefix === normalizedWorktreeName
      ? withoutFoodLensPrefix.replace(
          new RegExp(`^${normalizedCanonicalWorktreeName}[-_. ]*`, "i"),
          ""
        )
      : withoutFoodLensPrefix;

  const alphanumericOnly = withoutCanonicalPrefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const candidateSuffix = alphanumericOnly || "local";
  const trimmedSuffix = candidateSuffix.slice(0, MAX_PACKAGE_SUFFIX_LENGTH);

  if (/^[0-9]/.test(trimmedSuffix)) {
    return `local${trimmedSuffix}`.slice(0, MAX_PACKAGE_SUFFIX_LENGTH);
  }

  return trimmedSuffix;
};

const humanizeWorktreeName = (worktreeName, canonicalWorktreeName) => {
  const normalizedWorktreeName = trimString(worktreeName);
  const normalizedCanonicalWorktreeName = trimString(canonicalWorktreeName);

  const withoutFoodLensPrefix = normalizedWorktreeName.replace(/^foodlens[-_. ]*/i, "");
  const withoutCanonicalPrefix =
    withoutFoodLensPrefix === normalizedWorktreeName
      ? withoutFoodLensPrefix.replace(
          new RegExp(`^${normalizedCanonicalWorktreeName}[-_. ]*`, "i"),
          ""
        )
      : withoutFoodLensPrefix;

  const segments = withoutCanonicalPrefix
    .split(/[-_. ]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));

  return segments.length > 0 ? segments.join(" ") : "Local";
};

const readGitValue = (projectDir, args) => {
  try {
    return childProcess
      .execFileSync("git", ["-C", projectDir, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      .trim();
  } catch (error) {
    return "";
  }
};

const resolveGitDirty = (projectDir) => {
  try {
    const output = childProcess.execFileSync(
      "git",
      ["-C", projectDir, "status", "--porcelain"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    return output.trim().length > 0;
  } catch (error) {
    return false;
  }
};

const resolveInstallTrack = (appVariant, isCanonicalPackageContext) => {
  if (!isCanonicalPackageContext) {
    return "workspace";
  }

  if (appVariant === "development") {
    return "development";
  }

  return "production";
};

const resolveAppName = (appVariant, installTrack, workspaceDisplayName) => {
  if (installTrack === "production") {
    return APP_NAME;
  }

  if (installTrack === "development") {
    return APP_NAME_DEV;
  }

  if (appVariant === "development") {
    return `${APP_NAME} (Dev ${workspaceDisplayName})`;
  }

  return `${APP_NAME} (${workspaceDisplayName})`;
};

const resolveBuildSourceLabel = (isRemoteCanonicalContext, isCanonicalWorktree, worktreeName) => {
  if (isRemoteCanonicalContext) {
    return "eas-build";
  }

  if (isCanonicalWorktree) {
    return "canonical-worktree";
  }

  return `workspace:${worktreeName}`;
};

const resolveBuildIdentity = (params) => {
  const projectDir = resolveProjectDir(params.projectDir);
  const processEnv = params.processEnv || process.env;
  const appVariant = normalizeAppVariant(params.appVariant);
  const worktreeName = resolveWorktreeName(projectDir, processEnv);
  const canonicalWorktreeName = resolveCanonicalWorktreeName(processEnv);
  const isRemoteCanonicalContext =
    isTruthyFlag(processEnv.EAS_BUILD) ||
    isTruthyFlag(processEnv.FOODLENS_FORCE_CANONICAL_PACKAGE);
  const isCanonicalWorktree = worktreeName === canonicalWorktreeName;
  const isCanonicalPackageContext = isRemoteCanonicalContext || isCanonicalWorktree;
  const installTrack = resolveInstallTrack(appVariant, isCanonicalPackageContext);
  const packageSuffix =
    !isCanonicalPackageContext
      ? `.${sanitizePackageSuffix(worktreeName, canonicalWorktreeName)}`
      : "";
  const iosBaseBundleId = appVariant === "development" ? IOS_BUNDLE_ID_DEV : IOS_BUNDLE_ID;
  const androidBasePackage =
    appVariant === "development" ? ANDROID_PACKAGE_DEV : ANDROID_PACKAGE;
  const workspaceDisplayName = humanizeWorktreeName(
    worktreeName,
    canonicalWorktreeName
  );
  const appName = resolveAppName(appVariant, installTrack, workspaceDisplayName);
  const gitBranch = readGitValue(projectDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const gitCommitSha = readGitValue(projectDir, ["rev-parse", "HEAD"]);
  const gitCommitShortSha = readGitValue(projectDir, ["rev-parse", "--short", "HEAD"]);
  const gitDirty = resolveGitDirty(projectDir);
  const builtAtIso = new Date().toISOString();

  return {
    appName,
    appVariant,
    installTrack,
    buildSourceLabel: resolveBuildSourceLabel(
      isRemoteCanonicalContext,
      isCanonicalWorktree,
      worktreeName
    ),
    canonicalWorktreeName,
    worktreeName,
    workspaceDisplayName,
    isCanonicalPackageContext,
    isWorkspacePackageContext: !isCanonicalPackageContext,
    isCanonicalWorktree,
    iosBundleIdentifier: `${iosBaseBundleId}${packageSuffix}`,
    androidPackage: `${androidBasePackage}${packageSuffix}`,
    gitBranch,
    gitCommitSha,
    gitCommitShortSha,
    gitDirty,
    builtAtIso,
    projectDir,
  };
};

const shellEscape = (value) => {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
};

const emitShellAssignments = (identity) => {
  const shellValues = {
    FOODLENS_BUILD_APP_NAME: identity.appName,
    FOODLENS_BUILD_APP_VARIANT: identity.appVariant,
    FOODLENS_BUILD_INSTALL_TRACK: identity.installTrack,
    FOODLENS_BUILD_SOURCE_LABEL: identity.buildSourceLabel,
    FOODLENS_BUILD_CANONICAL_WORKTREE_NAME: identity.canonicalWorktreeName,
    FOODLENS_BUILD_WORKTREE_NAME: identity.worktreeName,
    FOODLENS_BUILD_WORKSPACE_DISPLAY_NAME: identity.workspaceDisplayName,
    FOODLENS_BUILD_CANONICAL_CONTEXT: identity.isCanonicalPackageContext ? "1" : "0",
    FOODLENS_BUILD_WORKSPACE_CONTEXT: identity.isWorkspacePackageContext ? "1" : "0",
    FOODLENS_BUILD_CANONICAL_WORKTREE: identity.isCanonicalWorktree ? "1" : "0",
    FOODLENS_BUILD_IOS_BUNDLE_IDENTIFIER: identity.iosBundleIdentifier,
    FOODLENS_BUILD_ANDROID_PACKAGE: identity.androidPackage,
    FOODLENS_BUILD_GIT_BRANCH: identity.gitBranch,
    FOODLENS_BUILD_GIT_COMMIT_SHA: identity.gitCommitSha,
    FOODLENS_BUILD_GIT_COMMIT_SHORT_SHA: identity.gitCommitShortSha,
    FOODLENS_BUILD_GIT_DIRTY: identity.gitDirty ? "1" : "0",
    FOODLENS_BUILD_BUILT_AT_ISO: identity.builtAtIso,
    FOODLENS_BUILD_PROJECT_DIR: identity.projectDir,
  };

  return Object.entries(shellValues)
    .map(([key, value]) => `${key}=${shellEscape(value)}`)
    .join("\n");
};

if (require.main === module) {
  const outputMode = trimString(process.argv[2]) || "json";
  const projectDir = trimString(process.argv[3]) || __dirname;
  const appVariant = trimString(process.argv[4]) || trimString(process.env.APP_VARIANT);
  const identity = resolveBuildIdentity({
    projectDir,
    appVariant,
    processEnv: process.env,
  });

  if (outputMode === "shell") {
    process.stdout.write(emitShellAssignments(identity));
  } else {
    process.stdout.write(JSON.stringify(identity));
  }
}

module.exports = {
  resolveBuildIdentity,
};
