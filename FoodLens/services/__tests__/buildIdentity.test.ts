const { resolveBuildIdentity } = require('../../buildIdentity');

describe('resolveBuildIdentity', () => {
  it('uses the canonical production package in the canonical worktree', () => {
    const identity = resolveBuildIdentity({
      projectDir: '/tmp/FoodLens-project/FoodLens',
      appVariant: 'production',
      processEnv: {},
    });

    expect(identity.installTrack).toBe('production');
    expect(identity.androidPackage).toBe('com.hoihou.foodlens');
    expect(identity.iosBundleIdentifier).toBe('com.hoihou.foodlens');
  });

  it('uses the canonical development package in the canonical worktree', () => {
    const identity = resolveBuildIdentity({
      projectDir: '/tmp/FoodLens-project/FoodLens',
      appVariant: 'development',
      processEnv: {},
    });

    expect(identity.installTrack).toBe('development');
    expect(identity.androidPackage).toBe('com.hoihou.foodlens.dev');
    expect(identity.iosBundleIdentifier).toBe('com.hoihou.foodlens.dev');
  });

  it('adds a workspace suffix for non-canonical worktrees', () => {
    const identity = resolveBuildIdentity({
      projectDir: '/tmp/FoodLens-next-feature-main/FoodLens',
      appVariant: 'production',
      processEnv: {},
    });

    expect(identity.installTrack).toBe('workspace');
    expect(identity.isWorkspacePackageContext).toBe(true);
    expect(identity.androidPackage).toBe('com.hoihou.foodlens.nextfeaturemain');
    expect(identity.iosBundleIdentifier).toBe('com.hoihou.foodlens.nextfeaturemain');
  });

  it('adds a workspace suffix for development builds outside the canonical worktree', () => {
    const identity = resolveBuildIdentity({
      projectDir: '/tmp/FoodLens-next-feature-main/FoodLens',
      appVariant: 'development',
      processEnv: {},
    });

    expect(identity.installTrack).toBe('workspace');
    expect(identity.androidPackage).toBe('com.hoihou.foodlens.dev.nextfeaturemain');
    expect(identity.iosBundleIdentifier).toBe('com.hoihou.foodlens.dev.nextfeaturemain');
  });

  it('treats eas builds as canonical package context', () => {
    const identity = resolveBuildIdentity({
      projectDir: '/tmp/FoodLens-next-feature-main/FoodLens',
      appVariant: 'production',
      processEnv: {
        EAS_BUILD: '1',
      },
    });

    expect(identity.installTrack).toBe('production');
    expect(identity.androidPackage).toBe('com.hoihou.foodlens');
    expect(identity.buildSourceLabel).toBe('eas-build');
  });
});
