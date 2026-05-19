type PlayTrackReleaseStateGate = {
  collectPlayReleaseStateErrors: (payload: unknown) => string[];
  collectReleaseArtifacts: (release: unknown) => Array<{ type: string; versionCode: number }>;
  normalizeVersionCode: (value: unknown) => number | null;
};

const playTrackReleaseStateGate = jest.requireActual(
  '../validate-play-track-release-state'
) as PlayTrackReleaseStateGate;

describe('validate-play-track-release-state', () => {
  it('allows a release that contains only the current app bundle', () => {
    const errors = playTrackReleaseStateGate.collectPlayReleaseStateErrors({
      track: 'internal',
      releases: [
        {
          name: 'draft',
          status: 'draft',
          artifacts: [{ type: 'aab', versionCode: 21 }],
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it('rejects a stale APK that is shadowed by a higher version code in the same release', () => {
    const errors = playTrackReleaseStateGate.collectPlayReleaseStateErrors({
      track: 'internal',
      releases: [
        {
          name: 'draft',
          status: 'draft',
          artifacts: [
            { type: 'apk', versionCode: 18 },
            { type: 'aab', versionCode: 21 },
          ],
        },
      ],
    });

    expect(errors).toEqual([
      expect.stringContaining('stale APK versionCode 18 alongside higher versionCode 21'),
    ]);
  });

  it('detects stale APKs in nested track exports', () => {
    const errors = playTrackReleaseStateGate.collectPlayReleaseStateErrors({
      tracks: [
        {
          track: 'internal',
          releases: [
            {
              name: 'manual-upload',
              apks: [{ versionCode: '18' }],
              bundles: [{ versionCode: '21' }],
            },
          ],
        },
      ],
    });

    expect(errors).toEqual([expect.stringContaining('internal/manual-upload')]);
    expect(errors[0]).toEqual(expect.stringContaining('Remove the stale APK from the draft release'));
  });

  it('does not reject lower APKs when they are in a separate release entry', () => {
    const errors = playTrackReleaseStateGate.collectPlayReleaseStateErrors({
      track: 'internal',
      releases: [
        {
          name: 'old',
          artifacts: [{ type: 'apk', versionCode: 18 }],
        },
        {
          name: 'current',
          artifacts: [{ type: 'aab', versionCode: 21 }],
        },
      ],
    });

    expect(errors).toEqual([]);
  });

  it('normalizes numeric string version codes', () => {
    expect(playTrackReleaseStateGate.normalizeVersionCode('21')).toBe(21);
    expect(playTrackReleaseStateGate.normalizeVersionCode('0')).toBeNull();
    expect(playTrackReleaseStateGate.normalizeVersionCode('21.0')).toBeNull();
  });

  it('normalizes typed APK and AAB artifact collections', () => {
    const artifacts = playTrackReleaseStateGate.collectReleaseArtifacts({
      apks: [{ versionCode: '18' }],
      appBundles: [{ version_code: '21' }],
    });

    expect(artifacts).toEqual([
      { type: 'apk', versionCode: 18 },
      { type: 'aab', versionCode: 21 },
    ]);
  });
});
