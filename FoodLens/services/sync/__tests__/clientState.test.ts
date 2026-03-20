import {
  buildRemoteClientState,
  mergeSyncedClientState,
  normalizeSyncedClientState,
  parseRemoteClientState,
} from '../clientState';

describe('clientState', () => {
  it('drops undefined nested keys during normalization', () => {
    expect(
      normalizeSyncedClientState({
        history: {
          archiveMode: undefined,
          filter: 'ok',
          mapRegion: undefined,
        },
      })
    ).toEqual({
      history: {
        filter: 'ok',
      },
    });
  });

  it('merges remote and local state without erasing sibling leaves', () => {
    const merged = mergeSyncedClientState(
      parseRemoteClientState({
        onboarding: { completed_at: '2026-03-01T00:00:00Z' },
        history: { filter: 'ok' },
      }),
      parseRemoteClientState({
        home: { selected_date: '2026-03-20' },
        history: { archive_mode: 'map' },
      })
    );

    expect(buildRemoteClientState(merged)).toEqual({
      onboarding: { completed_at: '2026-03-01T00:00:00Z' },
      home: { selected_date: '2026-03-20' },
      history: { archive_mode: 'map', filter: 'ok' },
    });
  });
});
