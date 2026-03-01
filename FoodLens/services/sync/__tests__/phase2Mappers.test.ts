import { buildDefaultProfile } from '@/services/user/profileFactory';
import {
  buildProfileWritePayload,
  deserializeHistoryItem,
  mergeRemoteHistory,
  mergeRemoteUserSnapshot,
  serializeHistoryRecord,
} from '../phase2Mappers';

describe('phase2Mappers', () => {
  it('merges remote user snapshot into local profile', () => {
    const local = buildDefaultProfile('usr_local');
    local.name = 'Local Name';
    local.settings.language = 'ko-KR';
    local.safetyProfile.allergies = ['egg'];

    const merged = mergeRemoteUserSnapshot('usr_local', local, {
      profile: {
        user_id: 'usr_local',
        email: 'remote@example.com',
        display_name: 'Remote Name',
        locale: 'en-US',
        updated_at: '2026-02-25T00:00:00Z',
      },
      allergies: {
        user_id: 'usr_local',
        allergies: ['peanut'],
        dietary_restrictions: ['vegan'],
        severity_map: { peanut: 'severe' },
      },
      settings: {
        user_id: 'usr_local',
        language: 'en-US',
        target_language: 'ja-JP',
        auto_play_audio: true,
        selected_emoji: '🍊',
      },
    });

    expect(merged.uid).toBe('usr_local');
    expect(merged.email).toBe('remote@example.com');
    expect(merged.name).toBe('Remote Name');
    expect(merged.settings.language).toBe('en-US');
    expect(merged.settings.targetLanguage).toBe('ja-JP');
    expect(merged.settings.autoPlayAudio).toBe(true);
    expect(merged.safetyProfile.allergies).toEqual(['peanut']);
    expect(merged.safetyProfile.dietaryRestrictions).toEqual(['vegan']);
    expect(merged.safetyProfile.severityMap?.['peanut']).toBe('severe');
  });

  it('serializes and deserializes history items', () => {
    const serialized = serializeHistoryRecord({
      id: 'rec_1',
      foodName: 'Kimchi',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-02-25T01:00:00Z'),
    });

    const parsed = deserializeHistoryItem({
      id: 'his_1',
      user_id: 'usr_1',
      entry: serialized,
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('rec_1');
    expect(parsed?.foodName).toBe('Kimchi');
    expect(parsed?.timestamp.toISOString()).toBe('2026-02-25T01:00:00.000Z');
  });

  it('deduplicates merged history by id and sorts by latest timestamp', () => {
    const current = [
      {
        id: 'rec_older',
        foodName: 'Old',
        safetyStatus: 'SAFE' as const,
        ingredients: [],
        timestamp: new Date('2026-02-24T00:00:00Z'),
      },
    ];

    const remote = [
      {
        id: 'his_1',
        user_id: 'usr_1',
        entry: {
          id: 'rec_newer',
          foodName: 'New',
          safetyStatus: 'CAUTION',
          ingredients: [],
          timestamp: '2026-02-25T03:00:00Z',
        },
      },
      {
        id: 'his_2',
        user_id: 'usr_1',
        entry: {
          id: 'rec_older',
          foodName: 'Old remote',
          safetyStatus: 'SAFE',
          ingredients: [],
          timestamp: '2026-02-24T00:00:00Z',
        },
      },
    ];

    const merged = mergeRemoteHistory(current, remote);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('rec_newer');
    expect(merged[1].id).toBe('rec_older');
  });

  it('builds profile write payload for queue dispatch', () => {
    const profile = buildDefaultProfile('usr_q');
    profile.name = 'Queue User';
    profile.settings.language = 'en-US';
    profile.settings.targetLanguage = 'ko-KR';
    profile.settings.autoPlayAudio = true;
    profile.settings.selectedEmoji = '🍎';
    profile.safetyProfile.allergies = ['peanut'];
    profile.safetyProfile.dietaryRestrictions = ['vegan'];
    profile.safetyProfile.severityMap = { peanut: 'severe' };
    profile.syncVersions = {
      profileUpdatedAt: '2026-02-25T00:00:00Z',
      allergiesUpdatedAt: '2026-02-25T00:01:00Z',
      settingsUpdatedAt: '2026-02-25T00:02:00Z',
    };

    const payload = buildProfileWritePayload(profile);
    expect(payload.profile.display_name).toBe('Queue User');
    expect(payload.settings.language).toBe('en-US');
    expect(payload.allergies.allergies).toEqual(['peanut']);
    expect(payload.allergies.severity_map['peanut']).toBe('severe');
    expect(payload.profile.expected_updated_at).toBe('2026-02-25T00:00:00Z');
    expect(payload.allergies.expected_updated_at).toBe('2026-02-25T00:01:00Z');
    expect(payload.settings.expected_updated_at).toBe('2026-02-25T00:02:00Z');
  });
});
