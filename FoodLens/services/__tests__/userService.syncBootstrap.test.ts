import { UserService } from '../userService';
import { SafeStorage } from '../storage_Logic';
import { Phase2Api } from '../sync/phase2Api_Logic';
import {
  dispatchPhase2SyncQueue,
  enqueuePhase2Sync,
  getPhase2OperationsByIds,
} from '../sync/phase2SyncQueue_Logic';
import { restoreSession } from '../auth/sessionManager_Logic';
import { getCurrentUserId, hasAuthenticatedUser } from '../auth/currentUser_Logic';

jest.mock('../storage_Logic', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../sync/phase2SyncQueue_Logic', () => ({
  enqueuePhase2Sync: jest.fn(),
  dispatchPhase2SyncQueue: jest.fn(),
  getPhase2OperationsByIds: jest.fn(),
  startPhase2SyncRuntime: jest.fn(),
}));

jest.mock('../sync/phase2Api_Logic', () => ({
  Phase2Api: {
    getProfile: jest.fn(),
    getAllergies: jest.fn(),
    getSettings: jest.fn(),
  },
  Phase2SyncApiError: class MockPhase2SyncApiError extends Error {
    code: string;
    status: number;
    requestId?: string;

    constructor(message: string, code: string, status: number, requestId?: string) {
      super(message);
      this.code = code;
      this.status = status;
      this.requestId = requestId;
    }
  },
}));

jest.mock('../user/profileImage_Logic', () => ({
  resolveAndValidateProfileImage: jest.fn(async (profile) => ({ profile, isValidImage: true })),
  ensureProfileImageExists: jest.fn(async (_uid, profile) => profile),
}));

jest.mock('../user/profileFactory_Logic', () => ({
  buildDefaultProfile: jest.fn((uid: string) => ({
    uid,
    email: '',
    name: '',
    profileImage: '',
    safetyProfile: {
      allergies: [],
      dietaryRestrictions: [],
      severityMap: {},
      dislikedIngredients: [],
    },
    settings: {
      language: 'ko-KR',
      autoPlayAudio: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })),
}));

jest.mock('../auth/sessionManager_Logic', () => ({
  restoreSession: jest.fn(async () => ({
    user: { id: 'usr_a' },
  })),
}));

jest.mock('../auth/currentUser_Logic', () => ({
  hasAuthenticatedUser: jest.fn(() => true),
  getCurrentUserId: jest.fn(() => 'usr_a'),
}));

jest.mock('../user/userProfileStore_Logic', () => ({
  publishUserProfileUpdated: jest.fn(),
}));

const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;
const mockedPhase2Api = Phase2Api as jest.Mocked<typeof Phase2Api>;
const mockedEnqueuePhase2Sync = enqueuePhase2Sync as jest.MockedFunction<typeof enqueuePhase2Sync>;
const mockedDispatchPhase2SyncQueue =
  dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedGetPhase2OperationsByIds =
  getPhase2OperationsByIds as jest.MockedFunction<typeof getPhase2OperationsByIds>;
const mockedRestoreSession = restoreSession as jest.MockedFunction<typeof restoreSession>;
const mockedHasAuthenticatedUser = hasAuthenticatedUser as jest.MockedFunction<typeof hasAuthenticatedUser>;
const mockedGetCurrentUserId = getCurrentUserId as jest.MockedFunction<typeof getCurrentUserId>;

const scopedProfileKey = '@foodlens_user_profile:usr_a';
const migrationMarkerKey = '@foodlens_phase2_profile_migrated:usr_a';
const serverSyncMarkerKey = '@foodlens_phase2_profile_server_synced:usr_a';

describe('UserService bootstrap sync guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRestoreSession.mockResolvedValue({
      user: { id: 'usr_a' },
    } as never);
    mockedHasAuthenticatedUser.mockReturnValue(true);
    mockedGetCurrentUserId.mockReturnValue('usr_a');
    mockedEnqueuePhase2Sync.mockResolvedValue('op-x');
    mockedDispatchPhase2SyncQueue.mockResolvedValue(undefined);
    mockedGetPhase2OperationsByIds.mockResolvedValue([]);
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === scopedProfileKey) return null as unknown;
      if (key === migrationMarkerKey) return false as unknown;
      if (key === '@foodlens_user_profile') return null as unknown;
      if (key === serverSyncMarkerKey) return false as unknown;
      return fallback as unknown;
    });
    mockedSafeStorage.set.mockResolvedValue(undefined);
    mockedSafeStorage.remove.mockResolvedValue(undefined);
  });

  it('returns fallback profile instead of throwing when profile read happens before auth hydration', async () => {
    mockedRestoreSession.mockResolvedValue(null as never);
    mockedHasAuthenticatedUser.mockReturnValue(false);
    mockedGetCurrentUserId.mockReturnValue('auth-required');

    const profile = await UserService.getUserProfile('auth-required', {
      allowBackgroundRefresh: false,
    });

    expect(profile.uid).toBe('auth-required');
    expect(mockedPhase2Api.getProfile).not.toHaveBeenCalled();
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
  });

  it('returns null from background cloud sync when unauthenticated', async () => {
    mockedRestoreSession.mockResolvedValue(null as never);
    mockedHasAuthenticatedUser.mockReturnValue(false);
    mockedGetCurrentUserId.mockReturnValue('auth-required');

    const result = await UserService.syncProfileFromCloud('auth-required', {
      force: true,
    });

    expect(result).toBeNull();
    expect(mockedPhase2Api.getProfile).not.toHaveBeenCalled();
    expect(mockedPhase2Api.getAllergies).not.toHaveBeenCalled();
    expect(mockedPhase2Api.getSettings).not.toHaveBeenCalled();
  });

  it('does not push default profile when server snapshot exists', async () => {
    mockedPhase2Api.getProfile.mockResolvedValue({
      profile: {
        user_id: 'usr_a',
        email: 'server@example.com',
        display_name: 'Server Name',
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-profile',
    } as never);
    mockedPhase2Api.getAllergies.mockResolvedValue({
      allergies: {
        user_id: 'usr_a',
        allergies: ['egg'],
        dietary_restrictions: [],
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-allergies',
    } as never);
    mockedPhase2Api.getSettings.mockResolvedValue({
      settings: {
        user_id: 'usr_a',
        language: 'ko-KR',
        auto_play_audio: false,
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-settings',
    } as never);

    const profile = await UserService.getUserProfile('usr_a');

    expect(profile.name).toBe('Server Name');
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
  });

  it('does not push default profile when initial server pull fails', async () => {
    mockedPhase2Api.getProfile.mockRejectedValue(new Error('network down'));
    mockedPhase2Api.getAllergies.mockRejectedValue(new Error('network down'));
    mockedPhase2Api.getSettings.mockRejectedValue(new Error('network down'));

    const profile = await UserService.getUserProfile('usr_a');

    expect(profile.uid).toBe('usr_a');
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
  });

  it('returns remote snapshot on background refresh when already server-synced', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(9_999_999_999_999);
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === scopedProfileKey) {
        return {
          uid: 'usr_a',
          email: 'local@example.com',
          name: 'Local Name',
          profileImage: '',
          safetyProfile: {
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
            dislikedIngredients: [],
          },
          settings: {
            language: 'ko-KR',
            autoPlayAudio: false,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as unknown;
      }
      if (key === migrationMarkerKey) return true as unknown;
      if (key === serverSyncMarkerKey) return true as unknown;
      return fallback as unknown;
    });

    mockedPhase2Api.getProfile.mockResolvedValue({
      profile: {
        user_id: 'usr_a',
        email: 'server@example.com',
        display_name: 'Server Name',
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-profile',
    } as never);
    mockedPhase2Api.getAllergies.mockResolvedValue({
      allergies: {
        user_id: 'usr_a',
        allergies: ['egg'],
        dietary_restrictions: [],
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-allergies',
    } as never);
    mockedPhase2Api.getSettings.mockResolvedValue({
      settings: {
        user_id: 'usr_a',
        language: 'ko-KR',
        auto_play_audio: false,
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-settings',
    } as never);

    const profile = await UserService.getUserProfile('usr_a');

    expect(profile.name).toBe('Server Name');
    expect(profile.email).toBe('server@example.com');
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('skips enqueue when profile update has no effective changes', async () => {
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === scopedProfileKey) {
        return {
          uid: 'usr_a',
          email: 'local@example.com',
          name: 'Same Name',
          profileImage: 'https://cdn.example.com/a.jpg',
          profileImageAssetId: 'asset_1',
          safetyProfile: {
            allergies: ['egg'],
            dietaryRestrictions: [],
            severityMap: { egg: 'moderate' },
            dislikedIngredients: [],
          },
          settings: {
            language: 'ko-KR',
            autoPlayAudio: false,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-03-05T00:00:00.000Z',
        } as unknown;
      }
      if (key === migrationMarkerKey) return true as unknown;
      if (key === serverSyncMarkerKey) return true as unknown;
      return fallback as unknown;
    });

    const profile = await UserService.CreateOrUpdateProfile('usr_a', 'local@example.com', {
      name: 'Same Name',
      safetyProfile: {
        allergies: ['egg'],
        dietaryRestrictions: [],
        severityMap: { egg: 'moderate' } as never,
        dislikedIngredients: [],
      },
      settings: {
        language: 'ko-KR',
        autoPlayAudio: false,
      },
      profileImage: 'https://cdn.example.com/a.jpg',
      profileImageAssetId: 'asset_1',
    });

    expect(profile.name).toBe('Same Name');
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
  });

  it('bypasses profile pull cooldown when forceServerRefresh is true', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_717_171_717_171);
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === scopedProfileKey) {
        return {
          uid: 'usr_a',
          email: 'local@example.com',
          name: 'Local Name',
          profileImage: '',
          safetyProfile: {
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
            dislikedIngredients: [],
          },
          settings: {
            language: 'ko-KR',
            autoPlayAudio: false,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as unknown;
      }
      if (key === migrationMarkerKey) return true as unknown;
      if (key === serverSyncMarkerKey) return true as unknown;
      return fallback as unknown;
    });

    mockedPhase2Api.getProfile.mockResolvedValue({
      profile: {
        user_id: 'usr_a',
        email: 'server@example.com',
        display_name: 'Server Name',
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-profile',
    } as never);
    mockedPhase2Api.getAllergies.mockResolvedValue({
      allergies: {
        user_id: 'usr_a',
        allergies: [],
        dietary_restrictions: [],
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-allergies',
    } as never);
    mockedPhase2Api.getSettings.mockResolvedValue({
      settings: {
        user_id: 'usr_a',
        language: 'ko-KR',
        auto_play_audio: false,
        updated_at: '2026-03-05T00:00:00.000Z',
      },
      requestId: 'req-settings',
    } as never);

    await UserService.getUserProfile('usr_a', {
      allowBackgroundRefresh: false,
      forceServerRefresh: true,
    });
    await UserService.getUserProfile('usr_a', {
      allowBackgroundRefresh: false,
      forceServerRefresh: true,
    });

    expect(mockedPhase2Api.getProfile).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  });

  it('queues only settings write when updating traveler language', async () => {
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === scopedProfileKey) {
        return {
          uid: 'usr_a',
          email: 'local@example.com',
          name: 'Local Name',
          profileImage: '',
          profileImageAssetId: '',
          safetyProfile: {
            allergies: ['egg'],
            dietaryRestrictions: [],
            severityMap: { egg: 'moderate' },
            dislikedIngredients: [],
          },
          settings: {
            language: 'ko-KR',
            targetLanguage: undefined,
            autoPlayAudio: false,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-03-05T00:00:00.000Z',
        } as unknown;
      }
      if (key === migrationMarkerKey) return true as unknown;
      if (key === serverSyncMarkerKey) return true as unknown;
      return fallback as unknown;
    });

    mockedEnqueuePhase2Sync.mockImplementation(async (_uid, entity) => `op-${entity}` as never);
    mockedGetPhase2OperationsByIds.mockImplementation(async (ids) =>
      ids.map((id) => ({
        id,
        entity: 'settings',
        state: 'synced',
        lastError: null,
      })) as never
    );

    await UserService.CreateOrUpdateProfile('usr_a', 'local@example.com', {
      settings: {
        targetLanguage: 'ja-JP',
      },
    });

    expect(mockedEnqueuePhase2Sync).toHaveBeenCalledTimes(1);
    expect(mockedEnqueuePhase2Sync).toHaveBeenCalledWith(
      'usr_a',
      'settings',
      expect.objectContaining({
        target_language: 'ja-JP',
      })
    );
  });

  it('queues only profile write when updating display name', async () => {
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === scopedProfileKey) {
        return {
          uid: 'usr_a',
          email: 'local@example.com',
          name: 'Old Name',
          profileImage: '',
          profileImageAssetId: '',
          safetyProfile: {
            allergies: ['egg'],
            dietaryRestrictions: [],
            severityMap: { egg: 'moderate' },
            dislikedIngredients: [],
          },
          settings: {
            language: 'ko-KR',
            targetLanguage: 'en-US',
            autoPlayAudio: false,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-03-05T00:00:00.000Z',
        } as unknown;
      }
      if (key === migrationMarkerKey) return true as unknown;
      if (key === serverSyncMarkerKey) return true as unknown;
      return fallback as unknown;
    });

    mockedEnqueuePhase2Sync.mockImplementation(async (_uid, entity) => `op-${entity}` as never);
    mockedGetPhase2OperationsByIds.mockImplementation(async (ids) =>
      ids.map((id) => ({
        id,
        entity: 'profile',
        state: 'synced',
        lastError: null,
      })) as never
    );

    await UserService.CreateOrUpdateProfile('usr_a', 'local@example.com', {
      name: 'New Name',
    });

    expect(mockedEnqueuePhase2Sync).toHaveBeenCalledTimes(1);
    expect(mockedEnqueuePhase2Sync).toHaveBeenCalledWith(
      'usr_a',
      'profile',
      expect.objectContaining({
        display_name: 'New Name',
      })
    );
  });
});
