jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '2.0.0',
      extra: {
        buildIdentity: {
          appName: 'FoodLens',
          appVariant: 'production',
          installTrack: 'production',
          buildSourceLabel: 'canonical-worktree',
          worktreeName: 'FoodLens-project',
          workspaceDisplayName: 'Project',
          isCanonicalPackageContext: true,
          isWorkspacePackageContext: false,
          androidPackage: 'com.hoihou.foodlens',
          iosBundleIdentifier: 'com.hoihou.foodlens',
          gitBranch: 'codex/test-branch',
          gitCommitSha: 'abcdef1234567890',
          gitCommitShortSha: 'abcdef1',
          gitDirty: false,
          builtAtIso: '2026-04-18T00:00:00.000Z',
        },
      },
    },
    nativeApplicationVersion: '2.0.0-native',
  },
}));

import { getBuildFingerprint } from '../buildFingerprint';

describe('buildFingerprint', () => {
  it('reads build identity from expo extra', () => {
    expect(getBuildFingerprint()).toEqual({
      version: '2.0.0',
      appName: 'FoodLens',
      appVariant: 'production',
      installTrack: 'production',
      buildSourceLabel: 'canonical-worktree',
      worktreeName: 'FoodLens-project',
      workspaceDisplayName: 'Project',
      isCanonicalPackageContext: true,
      isWorkspacePackageContext: false,
      androidPackage: 'com.hoihou.foodlens',
      iosBundleIdentifier: 'com.hoihou.foodlens',
      gitBranch: 'codex/test-branch',
      gitCommitSha: 'abcdef1234567890',
      gitCommitShortSha: 'abcdef1',
      gitDirty: false,
      builtAtIso: '2026-04-18T00:00:00.000Z',
    });
  });
});
