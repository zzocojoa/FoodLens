#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const APK_TYPES = new Set(["apk", "android_apk"]);
const AAB_TYPES = new Set(["aab", "app_bundle", "android_app_bundle", "bundle"]);

const trimValue = (value) => {
  return typeof value === "string" ? value.trim() : "";
};

const isObject = (value) => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const normalizeVersionCode = (value) => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  const normalized = trimValue(value);
  if (/^[1-9][0-9]*$/.test(normalized)) {
    return Number(normalized);
  }
  return null;
};

const normalizeArtifactType = (value) => {
  const normalized = trimValue(value).toLowerCase();
  if (APK_TYPES.has(normalized)) {
    return "apk";
  }
  if (AAB_TYPES.has(normalized)) {
    return "aab";
  }
  return "unknown";
};

const firstPresent = (values) => {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
};

const versionCodeFromArtifact = (artifact) => {
  if (!isObject(artifact)) {
    return null;
  }
  const directValue = firstPresent([
    artifact.versionCode,
    artifact.version_code,
    artifact.version,
  ]);
  const directVersionCode = normalizeVersionCode(directValue);
  if (directVersionCode !== null) {
    return directVersionCode;
  }
  if (Array.isArray(artifact.versionCodes) && artifact.versionCodes.length === 1) {
    return normalizeVersionCode(artifact.versionCodes[0]);
  }
  return null;
};

const artifactTypeFromArtifact = (artifact, impliedType) => {
  if (!isObject(artifact)) {
    return impliedType;
  }
  const explicitType = normalizeArtifactType(
    firstPresent([artifact.type, artifact.artifactType, artifact.fileType, artifact.format, artifact.kind])
  );
  if (explicitType !== "unknown") {
    return explicitType;
  }
  return impliedType;
};

const collectTypedArtifacts = (release, key, type) => {
  const artifacts = release[key];
  if (!Array.isArray(artifacts)) {
    return [];
  }
  return artifacts
    .map((artifact) => ({
      type: artifactTypeFromArtifact(artifact, type),
      versionCode: versionCodeFromArtifact(artifact),
    }))
    .filter((artifact) => artifact.versionCode !== null);
};

const collectGenericArtifacts = (release) => {
  const artifacts = release.artifacts;
  if (!Array.isArray(artifacts)) {
    return [];
  }
  return artifacts
    .map((artifact) => ({
      type: artifactTypeFromArtifact(artifact, "unknown"),
      versionCode: versionCodeFromArtifact(artifact),
    }))
    .filter((artifact) => artifact.versionCode !== null);
};

const collectReleaseArtifacts = (release) => {
  if (!isObject(release)) {
    return [];
  }
  return [
    ...collectGenericArtifacts(release),
    ...collectTypedArtifacts(release, "apks", "apk"),
    ...collectTypedArtifacts(release, "apkArtifacts", "apk"),
    ...collectTypedArtifacts(release, "bundles", "aab"),
    ...collectTypedArtifacts(release, "aabs", "aab"),
    ...collectTypedArtifacts(release, "appBundles", "aab"),
    ...collectTypedArtifacts(release, "aabArtifacts", "aab"),
  ];
};

const releaseLabel = (release, index) => {
  if (!isObject(release)) {
    return `release[${index}]`;
  }
  return (
    trimValue(firstPresent([release.name, release.releaseName, release.track, release.status])) ||
    `release[${index}]`
  );
};

const collectTrackReleases = (track) => {
  if (!isObject(track) || !Array.isArray(track.releases)) {
    return [];
  }
  return track.releases.map((release) => ({
    release,
    labelPrefix: trimValue(track.track) || trimValue(track.name) || "track",
  }));
};

const collectReleases = (payload) => {
  if (Array.isArray(payload)) {
    return payload.map((release) => ({ release, labelPrefix: "" }));
  }
  if (!isObject(payload)) {
    return [];
  }
  if (Array.isArray(payload.tracks)) {
    return payload.tracks.flatMap(collectTrackReleases);
  }
  if (Array.isArray(payload.releases)) {
    return payload.releases.map((release) => ({
      release,
      labelPrefix: trimValue(payload.track) || trimValue(payload.name) || "",
    }));
  }
  if (collectReleaseArtifacts(payload).length > 0) {
    return [{ release: payload, labelPrefix: trimValue(payload.track) || trimValue(payload.name) || "" }];
  }
  return [];
};

const fullReleaseLabel = (entry, index) => {
  const label = releaseLabel(entry.release, index);
  if (!entry.labelPrefix) {
    return label;
  }
  return `${entry.labelPrefix}/${label}`;
};

const collectPlayReleaseStateErrors = (payload) => {
  const errors = [];
  const releases = collectReleases(payload);
  for (let index = 0; index < releases.length; index += 1) {
    const entry = releases[index];
    const artifacts = collectReleaseArtifacts(entry.release);
    if (artifacts.length < 2) {
      continue;
    }
    const maxVersionCode = Math.max(...artifacts.map((artifact) => artifact.versionCode));
    const staleApks = artifacts.filter(
      (artifact) => artifact.type === "apk" && artifact.versionCode < maxVersionCode
    );
    for (const artifact of staleApks) {
      errors.push(
        `Google Play release ${fullReleaseLabel(entry, index)} includes stale APK versionCode ${artifact.versionCode} alongside higher versionCode ${maxVersionCode}. Remove the stale APK from the draft release or create a fresh release with only the current AAB/APK.`
      );
    }
  }
  return errors;
};

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read Google Play release state JSON: ${filePath}. ${message}`);
  }
};

const runValidation = (releaseStatePath) => {
  const resolvedPath = path.resolve(process.cwd(), releaseStatePath);
  const payload = readJsonFile(resolvedPath);
  return collectPlayReleaseStateErrors(payload);
};

const main = () => {
  const releaseStatePath = trimValue(process.argv[2]) || trimValue(process.env.PHASE6_PLAY_RELEASE_STATE_PATH);
  if (!releaseStatePath) {
    throw new Error(
      "Usage: node ./scripts/validate-play-track-release-state.js <play-release-state.json>"
    );
  }
  const errors = runValidation(releaseStatePath);
  if (errors.length > 0) {
    console.error("[PlayTrackReleaseStateGate] FAIL");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log("[PlayTrackReleaseStateGate] PASS");
};

if (require.main === module) {
  main();
}

module.exports = {
  collectPlayReleaseStateErrors,
  collectReleaseArtifacts,
  collectReleases,
  normalizeArtifactType,
  normalizeVersionCode,
  runValidation,
};
