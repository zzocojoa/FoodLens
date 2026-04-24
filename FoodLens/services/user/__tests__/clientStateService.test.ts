import type { UserProfile } from '@/models/User';
import { SafeStorage } from '@/services/storage';
import {
  dispatchPhase2SyncQueue,
  enqueuePhase2Sync,
  startPhase2SyncRuntime,
} from '@/services/sync/phase2SyncQueue';
import { buildProfileWritePayload } from '@/services/sync/phase2Mappers';
import { publishUserProfileUpdated } from '../userProfileStore';
import { buildHomeSelectedDatePatch, updateUserClientState } from '../clientStateService';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    getSync: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  dispatchPhase2SyncQueue: jest.fn(),
  enqueuePhase2Sync: jest.fn(),
  startPhase2SyncRuntime: jest.fn(),
}));

jest.mock('@/services/sync/phase2Mappers', () => ({
  buildProfileWritePayload: jest.fn(),
}));

jest.mock('../userProfileStore', () => ({
  publishUserProfileUpdated: jest.fn(),
}));

jest.mock('@/services/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;
const mockedDispatchPhase2SyncQueue =
  dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedEnqueuePhase2Sync = enqueuePhase2Sync as jest.MockedFunction<typeof enqueuePhase2Sync>;
const mockedStartPhase2SyncRuntime =
  startPhase2SyncRuntime as jest.MockedFunction<typeof startPhase2SyncRuntime>;
const mockedBuildProfileWritePayload =
  buildProfileWritePayload as jest.MockedFunction<typeof buildProfileWritePayload>;
const mockedPublishUserProfileUpdated =
  publishUserProfileUpdated as jest.MockedFunction<typeof publishUserProfileUpdated>;

const buildProfile = (): UserProfile => ({
  uid: 'usr_home',
  email: 'user@example.com',
  name: 'Tester',
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
    clientState: {},
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('clientStateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSafeStorage.get.mockResolvedValue(buildProfile() as never);
    mockedSafeStorage.set.mockResolvedValue(undefined);
    mockedEnqueuePhase2Sync.mockResolvedValue('op-settings');
    mockedDispatchPhase2SyncQueue.mockResolvedValue(undefined);
    mockedBuildProfileWritePayload.mockReturnValue({
      profile: {},
      allergies: {},
      settings: {
        client_state: {
          home: {
            selectedDate: '2026-03-20',
          },
        },
      },
    } as unknown as ReturnType<typeof buildProfileWritePayload>);
  });

  it('publishes client_state_write when synced client state changes', async () => {
    await updateUserClientState('usr_home', buildHomeSelectedDatePatch(new Date(2026, 2, 20)));

    expect(mockedPublishUserProfileUpdated).toHaveBeenCalledWith('usr_home', 'client_state_write');
    expect(mockedStartPhase2SyncRuntime).toHaveBeenCalledTimes(1);
    expect(mockedEnqueuePhase2Sync).toHaveBeenCalledTimes(1);
  });
});
