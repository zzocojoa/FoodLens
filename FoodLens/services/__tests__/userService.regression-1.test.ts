import { UserService } from '../userService';
import { logger } from '../logger';

jest.mock('../storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    getSync: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../sync/phase2SyncQueue', () => ({
  enqueuePhase2Sync: jest.fn(),
  dispatchPhase2SyncQueue: jest.fn(),
  getQueuedPhase2EntityPayload: jest.fn(async () => null),
  getPhase2OperationsByIds: jest.fn(async () => []),
  startPhase2SyncRuntime: jest.fn(),
}));

jest.mock('../sync/phase2Api', () => ({
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

jest.mock('../user/profileImage', () => ({
  resolveAndValidateProfileImage: jest.fn(async (profile) => ({ profile, isValidImage: true })),
  ensureProfileImageExists: jest.fn(async (_uid, profile) => profile),
}));

jest.mock('../user/profileFactory', () => ({
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

jest.mock('../auth/sessionManager', () => ({
  restoreSession: jest.fn(async () => null),
}));

jest.mock('../auth/currentUser', () => ({
  hasAuthenticatedUser: jest.fn(() => false),
  getCurrentUserId: jest.fn(() => 'auth-required'),
}));

jest.mock('../user/userProfileStore', () => ({
  publishUserProfileUpdated: jest.fn(),
}));

jest.mock('../logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('UserService regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not warn when auth-required fallback is expected on public routes', async () => {
    const profile = await UserService.getUserProfile('auth-required', {
      allowBackgroundRefresh: false,
    });

    expect(profile.uid).toBe('auth-required');
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });
});
