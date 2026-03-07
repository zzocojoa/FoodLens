import { buildDefaultProfile } from '@/services/user/profileFactory';
import {
  buildProfileWritePayload,
  deserializeHistoryItem,
  mergeRemoteHistory,
  mergeRemoteUserSnapshot,
  normalizeLegacyProfileForUser,
  serializeHistoryRecord,
} from '../phase2Mappers';

jest.mock('@/services/storage_Logic', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    clearAll: jest.fn(async () => undefined),
  },
}));

describe('phase2Mappers', () => {
  it('merges remote user snapshot into local profile', () => {
    const local = buildDefaultProfile('usr_local');
    local.name = 'Local Name';
    local.settings.language = 'ko-KR';
    local.safetyProfile.allergies = ['egg'];
    local.safetyProfile.dislikedIngredients = ['coriander'];

    const merged = mergeRemoteUserSnapshot('usr_local', local, {
      profile: {
        user_id: 'usr_local',
        email: 'remote@example.com',
        display_name: 'Remote Name',
        profile_image_url: 'https://cdn.example.com/avatar-remote.png',
        profile_image_render_url: 'https://cdn.example.com/media/render/asset_remote',
        profile_image_asset_id: 'asset_remote',
        gender: 'female',
        birth_year: 1992,
        disliked_ingredients: ['cucumber'],
        current_trip_start: '2026-03-01T00:00:00Z',
        current_trip_location: 'Seoul, KR',
        current_trip_coordinates: {
          latitude: 37.5665,
          longitude: 126.978,
        },
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
    expect(merged.profileImage).toBe('https://cdn.example.com/media/render/asset_remote');
    expect(merged.profileImageAssetId).toBe('asset_remote');
    expect(merged.gender).toBe('female');
    expect(merged.birthYear).toBe(1992);
    expect(merged.safetyProfile.dislikedIngredients).toEqual(['cucumber']);
    expect(merged.currentTripStart).toBe('2026-03-01T00:00:00Z');
    expect(merged.currentTripLocation).toBe('Seoul, KR');
    expect(merged.currentTripCoordinates).toEqual({
      latitude: 37.5665,
      longitude: 126.978,
    });
    expect(merged.settings.language).toBe('en-US');
    expect(merged.settings.targetLanguage).toBe('ja-JP');
    expect(merged.settings.autoPlayAudio).toBe(true);
    expect(merged.safetyProfile.allergies).toEqual(['peanut']);
    expect(merged.safetyProfile.dietaryRestrictions).toEqual(['vegan']);
    expect(merged.safetyProfile.severityMap?.['peanut']).toBe('severe');
  });

  it('keeps local profile image when same asset id is returned with rotated render url', () => {
    const local = buildDefaultProfile('usr_local');
    local.profileImageAssetId = 'asset_local';
    local.profileImage = 'profile_1720000000000.jpg';

    const merged = mergeRemoteUserSnapshot('usr_local', local, {
      profile: {
        user_id: 'usr_local',
        email: 'local@example.com',
        profile_image_asset_id: 'asset_local',
        profile_image_render_url:
          'https://cdn.example.com/media/render/asset_local?w=512&q=75&fmt=auto&exp=4102444800&sig=next',
      },
      settings: {
        user_id: 'usr_local',
        language: 'en-US',
        target_language: null,
        auto_play_audio: false,
      },
    });

    expect(merged.profileImageAssetId).toBe('asset_local');
    expect(merged.profileImage).toBe('profile_1720000000000.jpg');
  });

  it('replaces ephemeral local uri with remote render url for the same asset id', () => {
    const local = buildDefaultProfile('usr_local');
    local.profileImageAssetId = 'asset_local';
    local.profileImage = 'content://media/external/images/media/123';

    const merged = mergeRemoteUserSnapshot('usr_local', local, {
      profile: {
        user_id: 'usr_local',
        email: 'local@example.com',
        profile_image_asset_id: 'asset_local',
        profile_image_render_url:
          'https://cdn.example.com/media/render/asset_local?w=512&q=75&fmt=auto&exp=4102444800&sig=next',
      },
      settings: {
        user_id: 'usr_local',
        language: 'en-US',
        target_language: null,
        auto_play_audio: false,
      },
    });

    expect(merged.profileImageAssetId).toBe('asset_local');
    expect(merged.profileImage).toBe(
      'https://cdn.example.com/media/render/asset_local?w=512&q=75&fmt=auto&exp=4102444800&sig=next'
    );
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

  it('keeps stable local history image when remote snapshot for same id arrives', () => {
    const current = [
      {
        id: 'rec_1',
        foodName: 'Local',
        safetyStatus: 'SAFE' as const,
        ingredients: [],
        imageUri: 'photo_1720000000000_abcd.jpg',
        timestamp: new Date('2026-02-24T00:00:00Z'),
      },
    ];

    const remote = [
      {
        id: 'his_1',
        user_id: 'usr_1',
        entry: {
          id: 'rec_1',
          foodName: 'Remote',
          safetyStatus: 'SAFE',
          ingredients: [],
          image_asset_id: 'asset_1',
          image_render_url:
            'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444800&sig=abc',
          timestamp: '2026-02-25T03:00:00Z',
        },
      },
    ];

    const merged = mergeRemoteHistory(current, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('rec_1');
    expect(merged[0].imageUri).toBe('photo_1720000000000_abcd.jpg');
    expect(merged[0].imageAssetId).toBe('asset_1');
  });

  it('replaces ephemeral local history image uri with remote render url', () => {
    const current = [
      {
        id: 'rec_1',
        foodName: 'Local',
        safetyStatus: 'SAFE' as const,
        ingredients: [],
        imageUri: 'content://media/external/images/media/321',
        timestamp: new Date('2026-02-24T00:00:00Z'),
      },
    ];

    const remote = [
      {
        id: 'his_1',
        user_id: 'usr_1',
        entry: {
          id: 'rec_1',
          foodName: 'Remote',
          safetyStatus: 'SAFE',
          ingredients: [],
          image_asset_id: 'asset_1',
          image_render_url:
            'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444800&sig=abc',
          timestamp: '2026-02-25T03:00:00Z',
        },
      },
    ];

    const merged = mergeRemoteHistory(current, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].imageUri).toBe(
      'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444800&sig=abc'
    );
    expect(merged[0].imageAssetId).toBe('asset_1');
  });

  it('keeps existing remote history render url when asset id is unchanged and url is still valid', () => {
    const current = [
      {
        id: 'rec_1',
        foodName: 'Local',
        safetyStatus: 'SAFE' as const,
        ingredients: [],
        imageUri:
          'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444800&sig=old',
        imageAssetId: 'asset_1',
        timestamp: new Date('2026-02-24T00:00:00Z'),
      },
    ];

    const remote = [
      {
        id: 'his_1',
        user_id: 'usr_1',
        entry: {
          id: 'rec_1',
          foodName: 'Remote',
          safetyStatus: 'SAFE',
          ingredients: [],
          image_asset_id: 'asset_1',
          image_render_url:
            'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444801&sig=new',
          timestamp: '2026-02-25T03:00:00Z',
        },
      },
    ];

    const merged = mergeRemoteHistory(current, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].imageUri).toBe(
      'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444800&sig=old'
    );
  });

  it('refreshes remote history render url when existing url is near expiry', () => {
    const nearExpirySeconds = Math.floor(Date.now() / 1000) + 5;
    const current = [
      {
        id: 'rec_1',
        foodName: 'Local',
        safetyStatus: 'SAFE' as const,
        ingredients: [],
        imageUri: `https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=${nearExpirySeconds}&sig=old`,
        imageAssetId: 'asset_1',
        timestamp: new Date('2026-02-24T00:00:00Z'),
      },
    ];

    const remote = [
      {
        id: 'his_1',
        user_id: 'usr_1',
        entry: {
          id: 'rec_1',
          foodName: 'Remote',
          safetyStatus: 'SAFE',
          ingredients: [],
          image_asset_id: 'asset_1',
          image_render_url:
            'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444801&sig=new',
          timestamp: '2026-02-25T03:00:00Z',
        },
      },
    ];

    const merged = mergeRemoteHistory(current, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].imageUri).toBe(
      'https://cdn.example.com/media/render/asset_1?w=512&q=75&fmt=auto&exp=4102444801&sig=new'
    );
  });

  it('builds profile write payload for queue dispatch', () => {
    const profile = buildDefaultProfile('usr_q');
    profile.name = 'Queue User';
    profile.settings.language = 'en-US';
    profile.settings.targetLanguage = 'ko-KR';
    profile.settings.autoPlayAudio = true;
    profile.settings.selectedEmoji = '🍎';
    profile.profileImage = 'https://cdn.example.com/avatar-a.png';
    profile.profileImageAssetId = 'asset_profile_a';
    profile.gender = 'male';
    profile.birthYear = 1988;
    profile.safetyProfile.allergies = ['peanut'];
    profile.safetyProfile.dislikedIngredients = ['celery'];
    profile.safetyProfile.dietaryRestrictions = ['vegan'];
    profile.safetyProfile.severityMap = { peanut: 'severe' };
    profile.currentTripStart = '2026-03-02T10:00:00Z';
    profile.currentTripLocation = 'Tokyo, JP';
    profile.currentTripCoordinates = { latitude: 35.6764, longitude: 139.6500 };
    profile.syncVersions = {
      profileUpdatedAt: '2026-02-25T00:00:00Z',
      allergiesUpdatedAt: '2026-02-25T00:01:00Z',
      settingsUpdatedAt: '2026-02-25T00:02:00Z',
    };

    const payload = buildProfileWritePayload(profile);
    expect(payload.profile.display_name).toBe('Queue User');
    expect(payload.profile.profile_image_url).toBeNull();
    expect(payload.profile.profile_image_asset_id).toBe('asset_profile_a');
    expect(payload.profile.profile_image_local_uri).toBeNull();
    expect(payload.profile.gender).toBe('male');
    expect(payload.profile.birth_year).toBe(1988);
    expect(payload.profile.disliked_ingredients).toEqual(['celery']);
    expect(payload.profile.current_trip_start).toBe('2026-03-02T10:00:00Z');
    expect(payload.profile.current_trip_location).toBe('Tokyo, JP');
    expect(payload.profile.current_trip_coordinates).toEqual({
      latitude: 35.6764,
      longitude: 139.65,
    });
    expect(payload.settings.language).toBe('en-US');
    expect(payload.allergies.allergies).toEqual(['peanut']);
    expect(payload.allergies.severity_map['peanut']).toBe('severe');
    expect(payload.profile.expected_updated_at).toBe('2026-02-25T00:00:00Z');
    expect(payload.allergies.expected_updated_at).toBe('2026-02-25T00:01:00Z');
    expect(payload.settings.expected_updated_at).toBe('2026-02-25T00:02:00Z');
  });

  it('does not sync local file profile image uri to server payload', () => {
    const profile = buildDefaultProfile('usr_local_only');
    profile.profileImage = 'file:///var/mobile/Containers/Data/profile.jpg';

    const payload = buildProfileWritePayload(profile);
    expect(payload.profile.profile_image_url).toBeNull();
    expect(payload.profile.profile_image_local_uri).toBe('file:///var/mobile/Containers/Data/profile.jpg');
  });

  it('queues base64 data-url profile image for upload-first sync', () => {
    const profile = buildDefaultProfile('usr_data_url');
    profile.profileImage = 'data:image/jpeg;base64,Zm9vYmFy';

    const payload = buildProfileWritePayload(profile);
    expect(payload.profile.profile_image_url).toBeNull();
    expect(payload.profile.profile_image_local_uri).toBe('data:image/jpeg;base64,Zm9vYmFy');
  });

  it('keeps settings.language=auto without forcing profile locale/timezone overwrite', () => {
    const profile = buildDefaultProfile('usr_auto_locale');
    profile.settings.language = 'auto';
    profile.settings.targetLanguage = undefined;

    const payload = buildProfileWritePayload(profile);
    expect(payload.settings.language).toBe('auto');
    expect(payload.profile.locale).toBeNull();
    expect(payload.profile.timezone).toBeNull();
  });

  it('normalizes legacy language settings to canonical locale format', () => {
    const legacy = buildDefaultProfile('usr_legacy_language');
    legacy.settings.language = 'en';
    legacy.settings.targetLanguage = 'ko';

    const normalized = normalizeLegacyProfileForUser('usr_legacy_language', legacy);
    expect(normalized.settings.language).toBe('en-US');
    expect(normalized.settings.targetLanguage).toBe('ko-KR');
  });
});
