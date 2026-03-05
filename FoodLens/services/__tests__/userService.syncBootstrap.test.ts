import { UserService } from '../userService';
import { SafeStorage } from '../storage_Logic';
import { Phase2Api } from '../sync/phase2Api_Logic';
import { enqueuePhase2Sync } from '../sync/phase2SyncQueue_Logic';

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

const scopedProfileKey = '@foodlens_user_profile:usr_a';
const migrationMarkerKey = '@foodlens_phase2_profile_migrated:usr_a';
const serverSyncMarkerKey = '@foodlens_phase2_profile_server_synced:usr_a';

describe('UserService bootstrap sync guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnqueuePhase2Sync.mockResolvedValue('op-x');
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
});
