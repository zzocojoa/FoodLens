import Constants from 'expo-constants';
import { getRuntimeAppVersion } from '@/services/runtimeAppVersion';

type BuildIdentityExtra = {
  appName: string;
  appVariant: string;
  installTrack: string;
  buildSourceLabel: string;
  worktreeName: string;
  workspaceDisplayName: string;
  isCanonicalPackageContext: boolean;
  isWorkspacePackageContext: boolean;
  androidPackage: string;
  iosBundleIdentifier: string;
  gitBranch: string;
  gitCommitSha: string;
  gitCommitShortSha: string;
  gitDirty: boolean;
  builtAtIso: string;
};

export type BuildFingerprint = BuildIdentityExtra & {
  version: string;
};

const UNKNOWN_VALUE = 'unknown';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toStringValue = (value: unknown): string => {
  if (typeof value !== 'string') {
    return UNKNOWN_VALUE;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : UNKNOWN_VALUE;
};

const toBooleanValue = (value: unknown): boolean => value === true || value === '1' || value === 'true';

const getBuildIdentityExtra = (): Record<string, unknown> => {
  const extra = Constants.expoConfig?.extra;
  if (!isRecord(extra)) {
    return {};
  }

  const buildIdentity = extra['buildIdentity'];
  return isRecord(buildIdentity) ? buildIdentity : {};
};

export const getBuildFingerprint = (): BuildFingerprint => {
  const buildIdentity = getBuildIdentityExtra();

  return {
    version: getRuntimeAppVersion(),
    appName: toStringValue(buildIdentity['appName']),
    appVariant: toStringValue(buildIdentity['appVariant']),
    installTrack: toStringValue(buildIdentity['installTrack']),
    buildSourceLabel: toStringValue(buildIdentity['buildSourceLabel']),
    worktreeName: toStringValue(buildIdentity['worktreeName']),
    workspaceDisplayName: toStringValue(buildIdentity['workspaceDisplayName']),
    isCanonicalPackageContext: toBooleanValue(buildIdentity['isCanonicalPackageContext']),
    isWorkspacePackageContext: toBooleanValue(buildIdentity['isWorkspacePackageContext']),
    androidPackage: toStringValue(buildIdentity['androidPackage']),
    iosBundleIdentifier: toStringValue(buildIdentity['iosBundleIdentifier']),
    gitBranch: toStringValue(buildIdentity['gitBranch']),
    gitCommitSha: toStringValue(buildIdentity['gitCommitSha']),
    gitCommitShortSha: toStringValue(buildIdentity['gitCommitShortSha']),
    gitDirty: toBooleanValue(buildIdentity['gitDirty']),
    builtAtIso: toStringValue(buildIdentity['builtAtIso']),
  };
};
