import NetInfo from '@react-native-community/netinfo';
import { getCurrentUserId, hasAuthenticatedUser } from '@/services/auth/currentUser_Logic';
import { SafeStorage } from '@/services/storage_Logic';
import { Phase2Api, Phase2SyncApiError } from '../phase2Api_Logic';
import { dispatchPhase2SyncQueue } from '../phase2SyncQueue';
import type { Phase2SyncOperation } from '../phase2Sync.types';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(),
    addEventListener: jest.fn(),
  },
}));

jest.mock('@/services/auth/currentUser_Logic', () => ({
  getCurrentUserId: jest.fn(),
  hasAuthenticatedUser: jest.fn(),
}));

jest.mock('@/services/storage_Logic', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../phase2Api_Logic', () => ({
  Phase2Api: {
    putProfile: jest.fn(),
    putAllergies: jest.fn(),
    putSettings: jest.fn(),
    postHistory: jest.fn(),
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

const mockedNetInfo = NetInfo as unknown as { fetch: jest.Mock };
const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;
const mockedHasAuthenticatedUser = hasAuthenticatedUser as jest.Mock;
const mockedGetCurrentUserId = getCurrentUserId as jest.Mock;
const mockedPhase2Api = Phase2Api as jest.Mocked<typeof Phase2Api>;

let queueState: Phase2SyncOperation[] = [];

const pendingProfileOperation = (id: string, userId: string): Phase2SyncOperation => ({
  id,
  userId,
  entity: 'profile',
  state: 'pending',
  payload: { display_name: `${userId}-name` },
  attempts: 0,
  nextAttemptAt: Date.now(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

beforeEach(() => {
  jest.clearAllMocks();
  queueState = [];

  mockedNetInfo.fetch.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  mockedHasAuthenticatedUser.mockReturnValue(true);
  mockedGetCurrentUserId.mockReturnValue('usr_a');

  mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
    if (key === '@foodlens_phase2_sync_queue_v1') {
      return queueState as unknown;
    }
    return fallback;
  });
  mockedSafeStorage.set.mockImplementation(async (key, value) => {
    if (key === '@foodlens_phase2_sync_queue_v1') {
      queueState = value as Phase2SyncOperation[];
    }
  });

  mockedPhase2Api.putProfile.mockResolvedValue({
    profile: {
      user_id: 'usr_a',
      email: 'a@example.com',
    },
    requestId: 'req-profile-a',
  });
  mockedPhase2Api.putAllergies.mockResolvedValue({
    allergies: {
      user_id: 'usr_a',
      allergies: [],
      dietary_restrictions: [],
    },
    requestId: 'req-allergies-a',
  });
  mockedPhase2Api.putSettings.mockResolvedValue({
    settings: {
      user_id: 'usr_a',
      language: 'ko-KR',
    },
    requestId: 'req-settings-a',
  });
  mockedPhase2Api.postHistory.mockResolvedValue({
    historyItem: {
      id: 'his_1',
      user_id: 'usr_a',
      entry: {},
    },
    requestId: 'req-history-a',
  });
});

describe('phase2SyncQueue', () => {
  it('dispatches only the active user queue entries', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a'), pendingProfileOperation('op-b', 'usr_b')];

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).toHaveBeenCalledTimes(1);
    expect(mockedPhase2Api.putProfile).toHaveBeenCalledWith({ display_name: 'usr_a-name' });

    const userA = queueState.find((item) => item.id === 'op-a');
    const userB = queueState.find((item) => item.id === 'op-b');
    expect(userA?.state).toBe('synced');
    expect(userA?.requestId).toBe('req-profile-a');
    expect(userB?.state).toBe('pending');
  });

  it('skips dispatch when no authenticated user is active', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a')];
    mockedHasAuthenticatedUser.mockReturnValue(false);

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).not.toHaveBeenCalled();
    expect(queueState[0].state).toBe('pending');
  });

  it('keeps queue pending when session is unavailable', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a')];
    mockedPhase2Api.putProfile.mockRejectedValueOnce(
      new Phase2SyncApiError('Session is not available.', 'AUTH_SESSION_REQUIRED', 401)
    );

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).toHaveBeenCalledTimes(1);
    expect(queueState[0].state).toBe('pending');
    expect(queueState[0].attempts).toBe(0);
    expect(queueState[0].lastError).toBeUndefined();
  });
});
