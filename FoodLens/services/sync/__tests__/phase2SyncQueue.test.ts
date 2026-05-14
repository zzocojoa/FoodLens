import NetInfo from '@react-native-community/netinfo';
import { waitFor } from '@testing-library/react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { UserProfile } from '@/models/User';
import { getCurrentUserId, hasAuthenticatedUser } from '@/services/auth/currentUser';
import { restoreSession } from '@/services/auth/sessionManager';
import type { AnalysisRecord } from '@/services/analysis/types';
import { queryClient } from '@/services/queryClient';
import { SafeStorage } from '@/services/storage';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import { Phase2Api, Phase2SyncApiError } from '../phase2Api';
import {
  __resetPhase2SettingsDispatchDedupeForTests,
  dispatchPhase2SyncQueue,
  enqueueHistoryTimestampPatch,
  enqueuePhase2Sync,
  getPhase2ConflictedOperations,
  resolvePhase2Conflict,
} from '../phase2SyncQueue';
import type { Phase2SyncOperation } from '../phase2Sync.types';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(),
    addEventListener: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  default: {
    cacheDirectory: '/tmp/',
    documentDirectory: '/tmp/',
    EncodingType: {
      Base64: 'base64',
    },
    writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
  },
  cacheDirectory: '/tmp/',
  documentDirectory: '/tmp/',
  EncodingType: {
    Base64: 'base64',
  },
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserId: jest.fn(),
  hasAuthenticatedUser: jest.fn(),
}));

jest.mock('@/services/auth/sessionManager', () => ({
  restoreSession: jest.fn(),
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock('../phase2Api', () => ({
  Phase2Api: {
    putProfile: jest.fn(),
    putAllergies: jest.fn(),
    putSettings: jest.fn(),
    postHistory: jest.fn(),
    patchHistoryTimestamp: jest.fn(),
    postMediaUpload: jest.fn(),
    patchHistoryImage: jest.fn(),
    deleteHistory: jest.fn(),
  },
  Phase2SyncApiError: class MockPhase2SyncApiError extends Error {
    code: string;
    status: number;
    requestId?: string;
    serverPayload?: Record<string, unknown>;

    constructor(
      message: string,
      code: string,
      status: number,
      requestId?: string,
      serverPayload?: Record<string, unknown>
    ) {
      super(message);
      this.code = code;
      this.status = status;
      this.requestId = requestId;
      this.serverPayload = serverPayload;
    }
  },
}));

const mockedNetInfo = NetInfo as unknown as { fetch: jest.Mock };
const mockedFileSystem = FileSystem as unknown as {
  writeAsStringAsync: jest.Mock;
  deleteAsync: jest.Mock;
};
const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;
const mockedHasAuthenticatedUser = hasAuthenticatedUser as jest.Mock;
const mockedGetCurrentUserId = getCurrentUserId as jest.Mock;
const mockedRestoreSession = restoreSession as jest.Mock;
const mockedPhase2Api = Phase2Api as jest.Mocked<typeof Phase2Api>;

let queueState: Phase2SyncOperation[] = [];
const TEST_MEDIA_UPLOAD_COOLDOWN_MS = 5 * 60 * 1_000;

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
  __resetPhase2SettingsDispatchDedupeForTests();
  queryClient.clear();
  queueState = [];
  mockedFileSystem.writeAsStringAsync.mockResolvedValue(undefined);
  mockedFileSystem.deleteAsync.mockResolvedValue(undefined);

  mockedNetInfo.fetch.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  mockedHasAuthenticatedUser.mockReturnValue(true);
  mockedGetCurrentUserId.mockReturnValue('usr_a');
  mockedRestoreSession.mockResolvedValue(null);

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
  mockedPhase2Api.patchHistoryTimestamp.mockResolvedValue({
    historyItem: {
      id: 'his_1',
      user_id: 'usr_a',
      entry: {},
      updated_at: '2026-03-20T00:00:00Z',
    },
    requestId: 'req-history-patch-a',
  });
  mockedPhase2Api.postMediaUpload.mockResolvedValue({
    asset: {
      asset_id: 'asset_history_1',
      user_id: 'usr_a',
      scope: 'history',
      mime_type: 'image/jpeg',
      size_bytes: 1234,
      sha256: 'hash',
      object_key: 'media/usr_a/history/asset_history_1/original.jpg',
      render_url: 'https://cdn.example.com/media/render/asset_history_1',
    },
    requestId: 'req-media-a',
  });
  mockedPhase2Api.patchHistoryImage.mockResolvedValue({
    historyItem: {
      id: 'his_1',
      user_id: 'usr_a',
      entry: {},
    },
    requestId: 'req-history-image-a',
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

  it('publishes sync_apply after applying server profile version locally', async () => {
    const appliedProfileVersions: string[] = [];
    let profileState: UserProfile = {
      uid: 'usr_a',
      email: 'a@example.com',
      name: 'A',
      profileImage: '',
      safetyProfile: {
        allergies: [],
        dietaryRestrictions: [],
        severityMap: {},
        dislikedIngredients: [],
      },
      settings: {
        language: 'en-US',
        autoPlayAudio: false,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      syncVersions: {
        profileUpdatedAt: '2026-01-01T00:00:00.000Z',
      },
    };
    queueState = [pendingProfileOperation('op-profile-version-a', 'usr_a')];
    mockedPhase2Api.putProfile.mockResolvedValueOnce({
      profile: {
        user_id: 'usr_a',
        email: 'a@example.com',
        updated_at: '2026-03-20T00:00:00.000Z',
      },
      requestId: 'req-profile-version-a',
    });
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        return queueState as unknown;
      }
      if (key === '@foodlens_user_profile:usr_a') {
        return profileState;
      }
      return fallback;
    });
    mockedSafeStorage.set.mockImplementation(async (key, value) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        queueState = value as Phase2SyncOperation[];
        return;
      }
      if (key === '@foodlens_user_profile:usr_a') {
        profileState = value as UserProfile;
      }
    });
    const unsubscribe = subscribeUserProfileUpdated('usr_a', (reason) => {
      appliedProfileVersions.push(`${reason}:${profileState.syncVersions?.profileUpdatedAt || ''}`);
    });

    await dispatchPhase2SyncQueue();

    unsubscribe();
    expect(appliedProfileVersions).toEqual([
      'sync_apply:2026-03-20T00:00:00.000Z',
    ]);
    expect(queueState[0].state).toBe('synced');
  });

  it('publishes sync_apply after applying server settings without updated_at', async () => {
    const appliedReasons: string[] = [];
    let profileState: UserProfile = {
      uid: 'usr_a',
      email: 'a@example.com',
      name: 'A',
      profileImage: '',
      safetyProfile: {
        allergies: [],
        dietaryRestrictions: [],
        severityMap: {},
        dislikedIngredients: [],
      },
      settings: {
        language: 'en-US',
        autoPlayAudio: false,
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    queueState = [
      {
        id: 'op-settings-without-updated-at',
        userId: 'usr_a',
        entity: 'settings',
        state: 'pending',
        payload: {
          language: 'ko-KR',
          auto_play_audio: true,
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
    ];
    mockedPhase2Api.putSettings.mockResolvedValueOnce({
      settings: {
        user_id: 'usr_a',
        language: 'ko-KR',
        auto_play_audio: true,
      },
      requestId: 'req-settings-without-updated-at',
    });
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        return queueState as unknown;
      }
      if (key === '@foodlens_user_profile:usr_a') {
        return profileState;
      }
      return fallback;
    });
    mockedSafeStorage.set.mockImplementation(async (key, value) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        queueState = value as Phase2SyncOperation[];
        return;
      }
      if (key === '@foodlens_user_profile:usr_a') {
        profileState = value as UserProfile;
      }
    });
    const unsubscribe = subscribeUserProfileUpdated('usr_a', (reason) => {
      appliedReasons.push(`${reason}:${profileState.settings.language}`);
    });

    await dispatchPhase2SyncQueue();

    unsubscribe();
    expect(appliedReasons).toEqual(['sync_apply:ko-KR']);
    expect(queueState[0].state).toBe('synced');
  });

  it('skips dispatch when no authenticated user is active', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a')];
    mockedHasAuthenticatedUser.mockReturnValue(false);
    mockedRestoreSession.mockResolvedValue(null);

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).not.toHaveBeenCalled();
    expect(queueState[0].state).toBe('pending');
  });

  it('dispatches using restored session when current user marker is missing', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a')];
    mockedHasAuthenticatedUser.mockReturnValue(false);
    mockedRestoreSession.mockResolvedValue({
      user: { id: 'usr_a' },
    });

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).toHaveBeenCalledTimes(1);
    expect(queueState[0].state).toBe('synced');
  });

  it('dispatches using restored session when current marker is stale', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a')];
    mockedHasAuthenticatedUser.mockReturnValue(true);
    mockedGetCurrentUserId.mockReturnValue('usr_stale');
    mockedRestoreSession.mockResolvedValue({
      user: { id: 'usr_a' },
    });

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).toHaveBeenCalledTimes(1);
    expect(queueState[0].state).toBe('synced');
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

  it('keeps queue pending when auth token is temporarily invalid', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a')];
    mockedPhase2Api.putProfile.mockRejectedValueOnce(
      new Phase2SyncApiError('Invalid access token.', 'AUTH_TOKEN_INVALID', 401, 'req-auth-pending-a')
    );

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).toHaveBeenCalledTimes(1);
    expect(queueState[0].state).toBe('pending');
    expect(queueState[0].attempts).toBe(0);
    expect(queueState[0].lastError).toBeUndefined();
  });

  it('moves entry to conflicted on conflict response', async () => {
    queueState = [pendingProfileOperation('op-a', 'usr_a')];
    mockedPhase2Api.putProfile.mockRejectedValueOnce(
      new Phase2SyncApiError('Conflict detected.', 'PHASE2_CONFLICT', 409, 'req-conflict-a', {
        user_id: 'usr_a',
        display_name: 'server-name',
      })
    );

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).toHaveBeenCalledTimes(1);
    expect(queueState[0].state).toBe('conflicted');
    expect(queueState[0].requestId).toBe('req-conflict-a');
    expect(queueState[0].lastError).toBe('PHASE2_CONFLICT');
    expect(queueState[0].conflict?.code).toBe('PHASE2_CONFLICT');
    expect(queueState[0].conflict?.serverPayload).toEqual({
      user_id: 'usr_a',
      display_name: 'server-name',
    });
  });

  it('resolves conflict with server precedence without redispatch', async () => {
    const conflicted: Phase2SyncOperation = {
      ...pendingProfileOperation('op-a', 'usr_a'),
      state: 'conflicted',
      conflict: {
        code: 'PHASE2_CONFLICT',
        message: 'Conflict detected.',
        detectedAt: Date.now(),
      },
    };
    queueState = [conflicted];

    const resolved = await resolvePhase2Conflict({
      operationId: 'op-a',
      resolution: 'use_server',
    });

    expect(resolved).toBe(true);
    expect(queueState[0].state).toBe('synced');
    expect(queueState[0].conflict).toBeUndefined();
    expect(mockedPhase2Api.putProfile).not.toHaveBeenCalled();
  });

  it('resolves conflict with local precedence and redispatches', async () => {
    const conflicted: Phase2SyncOperation = {
      ...pendingProfileOperation('op-a', 'usr_a'),
      state: 'conflicted',
      conflict: {
        code: 'PHASE2_CONFLICT',
        message: 'Conflict detected.',
        detectedAt: Date.now(),
      },
      payload: { display_name: 'local-value' },
    };
    queueState = [conflicted];
    mockedPhase2Api.putProfile.mockResolvedValueOnce({
      profile: {
        user_id: 'usr_a',
        email: 'a@example.com',
      },
      requestId: 'req-profile-retry',
    });

    const resolved = await resolvePhase2Conflict({
      operationId: 'op-a',
      resolution: 'use_local',
      mergedPayload: { display_name: 'merged-value' },
    });

    expect(resolved).toBe(true);
    expect(mockedPhase2Api.putProfile).toHaveBeenCalledWith({ display_name: 'merged-value' });
    expect(queueState[0].state).toBe('synced');
    expect(queueState[0].requestId).toBe('req-profile-retry');
  });

  it('returns conflicted entries filtered by user', async () => {
    queueState = [
      {
        ...pendingProfileOperation('op-a', 'usr_a'),
        state: 'conflicted',
        conflict: { code: 'PHASE2_CONFLICT', detectedAt: Date.now() },
      },
      pendingProfileOperation('op-b', 'usr_a'),
      {
        ...pendingProfileOperation('op-c', 'usr_b'),
        state: 'conflicted',
        conflict: { code: 'PHASE2_CONFLICT', detectedAt: Date.now() },
      },
    ];

    const forAll = await getPhase2ConflictedOperations();
    const forUserA = await getPhase2ConflictedOperations('usr_a');

    expect(forAll).toHaveLength(2);
    expect(forUserA).toHaveLength(1);
    expect(forUserA[0].id).toBe('op-a');
  });

  it('dedupes identical pending payload for same entity and user', async () => {
    queueState = [
      {
        id: 'op-settings-pending-a',
        userId: 'usr_a',
        entity: 'settings',
        state: 'pending',
        payload: {
          language: 'ko-KR',
          target_language: 'ja-JP',
          auto_play_audio: false,
          expected_updated_at: '2026-03-08T15:00:00.000Z',
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
    ];

    const opId = await enqueuePhase2Sync('usr_a', 'settings', {
      language: 'ko-KR',
      target_language: 'ja-JP',
      auto_play_audio: false,
      expected_updated_at: '2026-03-08T15:00:05.000Z',
    });

    expect(opId).toBe('op-settings-pending-a');
    expect(queueState).toHaveLength(1);
    expect(mockedPhase2Api.putSettings).not.toHaveBeenCalled();
  });

  it('dedupes against last synced payload for same entity and user', async () => {
    queueState = [
      {
        id: 'op-settings-synced-a',
        userId: 'usr_a',
        entity: 'settings',
        state: 'synced',
        payload: {
          language: 'en-US',
          target_language: null,
          auto_play_audio: false,
          expected_updated_at: '2026-03-08T15:00:00.000Z',
        },
        attempts: 0,
        nextAttemptAt: Number.MAX_SAFE_INTEGER,
        createdAt: Date.now() - 3_000,
        updatedAt: Date.now() - 1_000,
      } as Phase2SyncOperation,
    ];

    const opId = await enqueuePhase2Sync('usr_a', 'settings', {
      language: 'en-US',
      target_language: null,
      auto_play_audio: false,
      expected_updated_at: '2026-03-08T15:00:10.000Z',
    });

    expect(opId).toBe('op-settings-synced-a');
    expect(queueState).toHaveLength(1);
    expect(queueState[0].state).toBe('synced');
    expect(mockedPhase2Api.putSettings).not.toHaveBeenCalled();
  });

  it('dedupes repeated settings PUT at dispatch stage within time window', async () => {
    const basePayload = {
      language: 'ko-KR',
      target_language: 'ja-JP',
      auto_play_audio: false,
      selected_emoji: null,
    };
    queueState = [
      {
        id: 'op-settings-1',
        userId: 'usr_a',
        entity: 'settings',
        state: 'pending',
        payload: {
          ...basePayload,
          expected_updated_at: '2026-03-08T15:00:00.000Z',
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
      {
        id: 'op-settings-2',
        userId: 'usr_a',
        entity: 'settings',
        state: 'pending',
        payload: {
          ...basePayload,
          expected_updated_at: '2026-03-08T15:00:03.000Z',
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now() + 1,
        updatedAt: Date.now() + 1,
      } as Phase2SyncOperation,
    ];

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putSettings).toHaveBeenCalledTimes(1);
    expect(queueState[0].state).toBe('synced');
    expect(queueState[1].state).toBe('synced');
  });

  it('writes merged settings only to the scoped profile snapshot', async () => {
    queueState = [
      {
        id: 'op-settings-scoped-write',
        userId: 'usr_a',
        entity: 'settings',
        state: 'pending',
        payload: {
          language: 'ko-KR',
          target_language: 'ja-JP',
          auto_play_audio: false,
          selected_emoji: null,
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
    ];
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        return queueState as unknown;
      }
      if (key === '@foodlens_user_profile:usr_a') {
        return {
          uid: 'usr_a',
          email: 'a@example.com',
          name: 'A',
          profileImage: '',
          safetyProfile: {
            allergies: [],
            dietaryRestrictions: [],
            severityMap: {},
            dislikedIngredients: [],
          },
          settings: {
            language: 'en-US',
            targetLanguage: undefined,
            autoPlayAudio: false,
          },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as unknown;
      }
      return fallback;
    });

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putSettings).toHaveBeenCalledTimes(1);
    expect(mockedSafeStorage.set).toHaveBeenCalledWith(
      '@foodlens_user_profile:usr_a',
      expect.objectContaining({
        uid: 'usr_a',
        settings: expect.objectContaining({
          language: 'ko-KR',
        }),
      })
    );
    expect(mockedSafeStorage.set).not.toHaveBeenCalledWith(
      '@foodlens_user_profile',
      expect.anything()
    );
  });

  it('auto-merges settings client_state conflict and retries once', async () => {
    queueState = [
      {
        id: 'op-settings-client-state',
        userId: 'usr_a',
        entity: 'settings',
        state: 'pending',
        payload: {
          language: 'ko-KR',
          auto_play_audio: false,
          client_state: {
            home: { selected_date: '2026-03-20' },
            history: { archive_mode: 'map' },
          },
          expected_updated_at: '2026-03-19T00:00:00Z',
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
    ];
    mockedPhase2Api.putSettings
      .mockRejectedValueOnce(
        new Phase2SyncApiError('Conflict detected.', 'PHASE2_CONFLICT', 409, 'req-settings-conflict', {
          user_id: 'usr_a',
          language: 'ko-KR',
          auto_play_audio: false,
          client_state: {
            onboarding: { completed_at: '2026-03-01T00:00:00Z' },
            history: { filter: 'ok' },
          },
          updated_at: '2026-03-20T00:00:00Z',
        })
      )
      .mockResolvedValueOnce({
        settings: {
          user_id: 'usr_a',
          language: 'ko-KR',
          auto_play_audio: false,
          client_state: {
            onboarding: { completed_at: '2026-03-01T00:00:00Z' },
            home: { selected_date: '2026-03-20' },
            history: { archive_mode: 'map', filter: 'ok' },
          },
          updated_at: '2026-03-20T00:00:01Z',
        },
        requestId: 'req-settings-merged',
      });

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putSettings).toHaveBeenCalledTimes(2);
    expect(mockedPhase2Api.putSettings.mock.calls[1][0]).toEqual({
      language: 'ko-KR',
      target_language: undefined,
      auto_play_audio: false,
      selected_emoji: undefined,
      client_state: {
        onboarding: { completed_at: '2026-03-01T00:00:00Z' },
        home: { selected_date: '2026-03-20' },
        history: { archive_mode: 'map', filter: 'ok' },
      },
      expected_updated_at: '2026-03-20T00:00:00Z',
    });
    expect(queueState[0].state).toBe('synced');
    expect(queueState[0].requestId).toBe('req-settings-merged');
  });

  it('retries history timestamp patch once on conflict and then syncs', async () => {
    queueState = [
      {
        id: 'op-history-patch',
        userId: 'usr_a',
        entity: 'history',
        state: 'pending',
        payload: {
          kind: 'timestamp_patch',
          history_item_id: 'analysis_3',
          timestamp: '2026-03-21T00:00:00.000Z',
          expected_updated_at: '2026-03-20T00:00:00Z',
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
    ];
    mockedPhase2Api.patchHistoryTimestamp
      .mockRejectedValueOnce(
        new Phase2SyncApiError('Conflict detected.', 'PHASE2_CONFLICT', 409, 'req-history-conflict', {
          id: 'his_3',
          user_id: 'usr_a',
          entry: {
            id: 'analysis_3',
            foodName: 'Soup',
            safetyStatus: 'SAFE',
            ingredients: [],
            timestamp: '2026-03-20T00:00:00.000Z',
          },
          updated_at: '2026-03-20T00:00:05Z',
        })
      )
      .mockResolvedValueOnce({
        historyItem: {
          id: 'his_3',
          user_id: 'usr_a',
          entry: {
            id: 'analysis_3',
            foodName: 'Soup',
            safetyStatus: 'SAFE',
            ingredients: [],
            timestamp: '2026-03-21T00:00:00.000Z',
          },
          updated_at: '2026-03-20T00:00:06Z',
        },
        requestId: 'req-history-patch-merged',
      });

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.patchHistoryTimestamp).toHaveBeenCalledTimes(2);
    expect(mockedPhase2Api.patchHistoryTimestamp.mock.calls[1][0]).toEqual({
      historyItemId: 'analysis_3',
      timestamp: '2026-03-21T00:00:00.000Z',
      expected_updated_at: '2026-03-20T00:00:05Z',
    });
    expect(queueState[0].state).toBe('synced');
  });

  it('preserves newer timestamp patch queued while previous patch is sending', async () => {
    type HistoryPatchResult = {
      historyItem: {
        id: string;
        user_id: string;
        entry: Record<string, unknown>;
        updated_at: string;
      };
      requestId: string;
    };

    queueState = [
      {
        id: 'op-history-patch-sending',
        userId: 'usr_a',
        entity: 'history',
        state: 'pending',
        payload: {
          kind: 'timestamp_patch',
          history_item_id: 'analysis_4',
          timestamp: '2026-03-21T00:00:00.000Z',
          expected_updated_at: '2026-03-20T00:00:00Z',
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
    ];

    let resolveFirstPatch: ((value: HistoryPatchResult) => void) | undefined;
    let resolveSecondPatch: ((value: HistoryPatchResult) => void) | undefined;

    mockedPhase2Api.patchHistoryTimestamp
      .mockImplementationOnce(
        () =>
          new Promise<HistoryPatchResult>((resolve) => {
            resolveFirstPatch = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<HistoryPatchResult>((resolve) => {
            resolveSecondPatch = resolve;
          })
      );

    const firstDispatch = dispatchPhase2SyncQueue();

    await waitFor(() => {
      expect(queueState[0].state).toBe('sending');
      expect(mockedPhase2Api.patchHistoryTimestamp).toHaveBeenCalledTimes(1);
    });

    const secondOperationId = await enqueueHistoryTimestampPatch('usr_a', {
      kind: 'timestamp_patch',
      history_item_id: 'analysis_4',
      timestamp: '2026-03-22T00:00:00.000Z',
      expected_updated_at: '2026-03-20T00:00:06Z',
    });

    expect(queueState.some((item) => item.id === secondOperationId && item.state === 'pending')).toBe(true);
    expect(queueState.some((item) => item.id === 'op-history-patch-sending' && item.state === 'sending')).toBe(true);

    expect(resolveFirstPatch).toBeDefined();
    const flushFirstPatch = resolveFirstPatch as (value: HistoryPatchResult) => void;
    flushFirstPatch({
      historyItem: {
        id: 'his_4',
        user_id: 'usr_a',
        entry: {},
        updated_at: '2026-03-20T00:00:06Z',
      },
      requestId: 'req-history-patch-first',
    });
    await firstDispatch;

    await waitFor(() => {
      expect(mockedPhase2Api.patchHistoryTimestamp).toHaveBeenCalledTimes(2);
      expect(queueState.some((item) => item.id === secondOperationId)).toBe(true);
    });

    expect(resolveSecondPatch).toBeDefined();
    const flushSecondPatch = resolveSecondPatch as (value: HistoryPatchResult) => void;
    flushSecondPatch({
      historyItem: {
        id: 'his_4',
        user_id: 'usr_a',
        entry: {},
        updated_at: '2026-03-20T00:00:07Z',
      },
      requestId: 'req-history-patch-second',
    });

    await waitFor(() => {
      const secondOperation = queueState.find((item) => item.id === secondOperationId);
      expect(secondOperation?.state).toBe('synced');
      expect(secondOperation?.requestId).toBe('req-history-patch-second');
    });
  });

  it('preserves newer allergy payload queued while previous allergy payload is sending', async () => {
    type AllergiesResult = {
      allergies: {
        user_id: string;
        allergies: string[];
        dietary_restrictions: string[];
        updated_at: string;
      };
      requestId: string;
    };

    queueState = [
      {
        id: 'op-allergies-sending',
        userId: 'usr_a',
        entity: 'allergies',
        state: 'pending',
        payload: {
          allergies: [],
          dietary_restrictions: ['peach'],
          severity_map: {},
          expected_updated_at: '2026-03-20T00:00:00Z',
        },
        attempts: 0,
        nextAttemptAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as Phase2SyncOperation,
    ];

    let resolveFirstAllergies: ((value: AllergiesResult) => void) | undefined;
    let resolveSecondAllergies: ((value: AllergiesResult) => void) | undefined;

    mockedPhase2Api.putAllergies
      .mockImplementationOnce(
        () =>
          new Promise<AllergiesResult>((resolve) => {
            resolveFirstAllergies = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<AllergiesResult>((resolve) => {
            resolveSecondAllergies = resolve;
          })
      );

    const firstDispatch = dispatchPhase2SyncQueue();

    await waitFor(() => {
      expect(queueState[0].state).toBe('sending');
      expect(mockedPhase2Api.putAllergies).toHaveBeenCalledTimes(1);
    });

    const secondOperationId = await enqueuePhase2Sync('usr_a', 'allergies', {
      allergies: [],
      dietary_restrictions: [],
      severity_map: {},
      expected_updated_at: '2026-03-20T00:00:01Z',
    });

    expect(secondOperationId).not.toBe('op-allergies-sending');
    expect(queueState.some((item) => item.id === secondOperationId && item.state === 'pending')).toBe(true);
    expect(queueState.some((item) => item.id === 'op-allergies-sending' && item.state === 'sending')).toBe(true);

    expect(resolveFirstAllergies).toBeDefined();
    const flushFirstAllergies = resolveFirstAllergies as (value: AllergiesResult) => void;
    flushFirstAllergies({
      allergies: {
        user_id: 'usr_a',
        allergies: [],
        dietary_restrictions: ['peach'],
        updated_at: '2026-03-20T00:00:01Z',
      },
      requestId: 'req-allergies-first',
    });
    await firstDispatch;

    await waitFor(() => {
      expect(mockedPhase2Api.putAllergies).toHaveBeenCalledTimes(2);
      expect(mockedPhase2Api.putAllergies.mock.calls[1][0]).toEqual({
        allergies: [],
        dietary_restrictions: [],
        severity_map: {},
        expected_updated_at: '2026-03-20T00:00:01Z',
      });
    });

    expect(resolveSecondAllergies).toBeDefined();
    const flushSecondAllergies = resolveSecondAllergies as (value: AllergiesResult) => void;
    flushSecondAllergies({
      allergies: {
        user_id: 'usr_a',
        allergies: [],
        dietary_restrictions: [],
        updated_at: '2026-03-20T00:00:02Z',
      },
      requestId: 'req-allergies-second',
    });

    await waitFor(() => {
      const secondOperation = queueState.find((item) => item.id === secondOperationId);
      expect(secondOperation?.state).toBe('synced');
      expect(secondOperation?.requestId).toBe('req-allergies-second');
    });
  });

  it('uploads local/data history images first and dispatches image_asset_id', async () => {
    const historyOp: Phase2SyncOperation = {
      id: 'op-history-a',
      userId: 'usr_a',
      entity: 'history',
      payload: {
        kind: 'create',
        entry: {
          id: 'analysis_1',
          foodName: 'Sushi',
          imageUri: 'data:image/jpeg;base64,Zm9vYmFy',
        },
      },
      idempotencyKey: 'analysis_1',
      attempts: 0,
      state: 'pending',
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    queueState = [historyOp];

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.postMediaUpload).toHaveBeenCalledTimes(1);
    expect(mockedPhase2Api.postHistory).toHaveBeenCalledTimes(1);
    expect(mockedPhase2Api.postHistory).toHaveBeenCalledWith({
      entry: {
        id: 'analysis_1',
        foodName: 'Sushi',
        image_asset_id: 'asset_history_1',
        image_render_url: 'https://cdn.example.com/media/render/asset_history_1',
      },
      idempotency_key: 'analysis_1',
    });
    expect(queueState[0].state).toBe('synced');
  });

  it('treats bare managed history filenames as local upload candidates without sending them as render urls', async () => {
    const historyOp: Phase2SyncOperation = {
      id: 'op-history-bare-filename',
      userId: 'usr_a',
      entity: 'history',
      payload: {
        kind: 'create',
        entry: {
          id: 'analysis_1',
          foodName: 'Bibimbap',
          imageUri: 'photo_1720000000000_abcd.jpg',
        },
      },
      idempotencyKey: 'analysis_1',
      attempts: 0,
      state: 'pending',
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    queueState = [historyOp];

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.postMediaUpload).toHaveBeenCalledTimes(1);
    expect(mockedPhase2Api.postMediaUpload).toHaveBeenCalledWith({
      fileUri: 'file:///tmp/foodlens_images/photo_1720000000000_abcd.jpg',
      contentType: 'image/jpeg',
      fileName: 'foodlens-history.jpg',
      scope: 'history',
      linkedEntryId: 'analysis_1',
    });
    expect(mockedPhase2Api.postHistory).toHaveBeenCalledTimes(1);
    const sent = mockedPhase2Api.postHistory.mock.calls[0][0] as {
      entry: Record<string, unknown>;
      idempotency_key?: string;
    };
    expect(sent.idempotency_key).toBe('analysis_1');
    expect(sent.entry['id']).toBe('analysis_1');
    expect(sent.entry['foodName']).toBe('Bibimbap');
    expect(sent.entry['imageUri']).toBeUndefined();
    expect(sent.entry['image_asset_id']).toBe('asset_history_1');
    expect(sent.entry['image_render_url']).toBe('https://cdn.example.com/media/render/asset_history_1');
    expect(sent.entry['image_render_url']).not.toBe('photo_1720000000000_abcd.jpg');
    expect(queueState[0].state).toBe('synced');
  });

  it('preserves content uris during history media upload preparation', async () => {
    const contentUri = 'content://media/external/images/media/12345';
    const historyOp: Phase2SyncOperation = {
      id: 'op-history-content-uri',
      userId: 'usr_a',
      entity: 'history',
      payload: {
        kind: 'create',
        entry: {
          id: 'analysis_content_1',
          foodName: 'Kimchi',
          imageUri: contentUri,
        },
      },
      idempotencyKey: 'analysis_content_1',
      attempts: 0,
      state: 'pending',
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    queueState = [historyOp];

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.postMediaUpload).toHaveBeenCalledTimes(1);
    const uploadPayload = mockedPhase2Api.postMediaUpload.mock.calls[0][0] as {
      fileUri: string;
      contentType: string;
      fileName: string;
      scope: 'history' | 'profile';
      linkedEntryId?: string;
    };
    expect(uploadPayload.fileUri).toBe(contentUri);
    expect(uploadPayload.fileUri.startsWith('file://content://')).toBe(false);
    expect(uploadPayload.contentType).toBe('image/jpeg');
    expect(uploadPayload.fileName).toBe('foodlens-history.jpg');
    expect(uploadPayload.scope).toBe('history');
    expect(uploadPayload.linkedEntryId).toBe('analysis_content_1');
    expect(queueState[0].state).toBe('synced');
  });

  it('updates the history query cache after applying a server history item locally', async () => {
    const analysesKey = '@foodlens_analyses:usr_a';
    const existingAnalysis = {
      id: 'analysis_cache_1',
      foodName: 'Old soup',
      safetyStatus: 'CAUTION',
      ingredients: [],
      timestamp: new Date('2026-03-19T00:00:00.000Z'),
    } as AnalysisRecord;
    const otherUserAnalysis = {
      id: 'analysis_other_user',
      foodName: 'Other user soup',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-18T00:00:00.000Z'),
    } as AnalysisRecord;
    let analysesState: AnalysisRecord[] = [existingAnalysis];
    const historyOp: Phase2SyncOperation = {
      id: 'op-history-cache',
      userId: 'usr_a',
      entity: 'history',
      payload: {
        kind: 'create',
        entry: {
          id: 'analysis_cache_1',
          foodName: 'Old soup',
          safetyStatus: 'CAUTION',
          ingredients: [],
          timestamp: '2026-03-19T00:00:00.000Z',
        },
      },
      idempotencyKey: 'analysis_cache_1',
      attempts: 0,
      state: 'pending',
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    queueState = [historyOp];
    queryClient.setQueryData(['history', 'usr_a'], [existingAnalysis]);
    queryClient.setQueryData(['history', 'usr_b'], [otherUserAnalysis]);
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        return queueState as unknown;
      }
      if (key === analysesKey) {
        return analysesState as unknown;
      }
      return fallback;
    });
    mockedSafeStorage.set.mockImplementation(async (key, value) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        queueState = value as Phase2SyncOperation[];
        return;
      }
      if (key === analysesKey) {
        analysesState = value as AnalysisRecord[];
      }
    });
    mockedPhase2Api.postHistory.mockResolvedValueOnce({
      historyItem: {
        id: 'server_history_cache_1',
        user_id: 'usr_a',
        entry: {
          id: 'analysis_cache_1',
          foodName: 'Server soup',
          safetyStatus: 'SAFE',
          ingredients: [],
          timestamp: '2026-03-20T00:00:00.000Z',
          image_asset_id: 'asset_history_cache_1',
          image_render_url: 'https://cdn.example.com/media/render/asset_history_cache_1',
        },
        updated_at: '2026-03-20T00:00:01.000Z',
      },
      requestId: 'req-history-cache',
    });

    await dispatchPhase2SyncQueue();

    expect(queueState[0].state).toBe('synced');
    expect(analysesState[0].foodName).toBe('Server soup');
    expect(analysesState[0].imageAssetId).toBe('asset_history_cache_1');
    expect(queryClient.getQueryData(['history', 'usr_a'])).toEqual(analysesState);
    expect(queryClient.getQueryData(['history', 'usr_b'])).toEqual([otherUserAnalysis]);
  });

  it('updates the history query cache after legacy history image upload succeeds', async () => {
    const analysesKey = '@foodlens_analyses:usr_a';
    const localImageUri = 'data:image/jpeg;base64,Zm9vYmFy';
    const renderUrl = 'https://cdn.example.com/media/render/asset_history_migrated?w=512&exp=4102444800&sig=new';
    const storedAnalysis = {
      id: 'analysis_migrated_1',
      foodName: 'Local noodles',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-21T00:00:00.000Z'),
      imageUri: localImageUri,
    } as AnalysisRecord;
    const cachedAnalysis = {
      ...storedAnalysis,
      timestamp: new Date(storedAnalysis.timestamp),
    } as AnalysisRecord;
    let analysesState: AnalysisRecord[] = [storedAnalysis];

    queryClient.setQueryData(['history', 'usr_a'], [cachedAnalysis]);
    mockedPhase2Api.postMediaUpload.mockResolvedValueOnce({
      asset: {
        asset_id: 'asset_history_migrated',
        user_id: 'usr_a',
        scope: 'history',
        mime_type: 'image/jpeg',
        size_bytes: 1234,
        sha256: 'hash',
        object_key: 'media/usr_a/history/asset_history_migrated/original.jpg',
        render_url: renderUrl,
      },
      requestId: 'req-media-migrated',
    });
    mockedSafeStorage.get.mockImplementation(async (key, fallback) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        return queueState as unknown;
      }
      if (key === analysesKey) {
        return analysesState as unknown;
      }
      return fallback;
    });
    mockedSafeStorage.set.mockImplementation(async (key, value) => {
      if (key === '@foodlens_phase2_sync_queue_v1') {
        queueState = value as Phase2SyncOperation[];
        return;
      }
      if (key === analysesKey) {
        analysesState = value as AnalysisRecord[];
      }
    });

    await dispatchPhase2SyncQueue();

    const cached = queryClient.getQueryData<AnalysisRecord[]>(['history', 'usr_a']);

    expect(mockedPhase2Api.postMediaUpload).toHaveBeenCalledWith({
      fileUri: expect.any(String),
      contentType: 'image/jpeg',
      fileName: 'foodlens-history.jpg',
      scope: 'history',
      linkedEntryId: 'analysis_migrated_1',
    });
    expect(mockedPhase2Api.patchHistoryImage).toHaveBeenCalledWith(
      'analysis_migrated_1',
      'asset_history_migrated'
    );
    expect(analysesState[0].imageAssetId).toBe('asset_history_migrated');
    expect(analysesState[0].imageRenderUrl).toBe(renderUrl);
    expect(cached?.[0].imageAssetId).toBe('asset_history_migrated');
    expect(cached?.[0].imageRenderUrl).toBe(renderUrl);
    expect(cached?.[0].imageUri).toBe(renderUrl);
  });

  it('leaves profile sync retryable when media upload fails with MEDIA_*', async () => {
    queueState = [
      {
        ...pendingProfileOperation('op-profile-media-fallback', 'usr_a'),
        attempts: 2,
        payload: {
          display_name: 'usr_a-name',
          profile_image_url: 'file:///tmp/profile.jpg',
          profile_image_local_uri: 'file:///tmp/profile.jpg',
        },
      },
    ];

    mockedPhase2Api.postMediaUpload.mockRejectedValueOnce(
      new Phase2SyncApiError(
        'Configured media bucket was not found.',
        'MEDIA_GCS_BUCKET_NOT_FOUND',
        503,
        'req-media-fallback-a'
      )
    );

    const startedAt = Date.now();
    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.postMediaUpload).toHaveBeenCalledTimes(1);
    expect(mockedPhase2Api.putProfile).not.toHaveBeenCalled();
    expect(queueState[0].state).toBe('failed');
    expect(queueState[0].attempts).toBe(2);
    expect(queueState[0].requestId).toBe('req-media-fallback-a');
    expect(queueState[0].lastError).toBe('MEDIA_GCS_BUCKET_NOT_FOUND');
    expect(queueState[0].nextAttemptAt).not.toBe(Number.MAX_SAFE_INTEGER);
    expect(queueState[0].nextAttemptAt).toBeGreaterThanOrEqual(
      startedAt + TEST_MEDIA_UPLOAD_COOLDOWN_MS
    );
    expect(queueState[0].payload['profile_image_url']).toBe('file:///tmp/profile.jpg');
    expect(queueState[0].payload['profile_image_local_uri']).toBe('file:///tmp/profile.jpg');
  });

  it('leaves history sync retryable when media upload fails with MEDIA_*', async () => {
    const historyOp: Phase2SyncOperation = {
      id: 'op-history-media-fallback',
      userId: 'usr_a',
      entity: 'history',
      payload: {
        kind: 'create',
        entry: {
          id: 'analysis_2',
          foodName: 'Pasta',
          imageUri: 'data:image/jpeg;base64,Zm9vYmFy',
        },
      },
      idempotencyKey: 'analysis_2',
      attempts: 0,
      state: 'pending',
      nextAttemptAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    queueState = [historyOp];

    mockedPhase2Api.postMediaUpload.mockRejectedValueOnce(
      new Phase2SyncApiError(
        'Configured media bucket was not found.',
        'MEDIA_GCS_BUCKET_NOT_FOUND',
        503,
        'req-media-fallback-b'
      )
    );

    const startedAt = Date.now();
    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.postMediaUpload).toHaveBeenCalledTimes(1);
    expect(mockedPhase2Api.postHistory).not.toHaveBeenCalled();
    expect(queueState[0].state).toBe('failed');
    expect(queueState[0].attempts).toBe(0);
    expect(queueState[0].requestId).toBe('req-media-fallback-b');
    expect(queueState[0].lastError).toBe('MEDIA_GCS_BUCKET_NOT_FOUND');
    expect(queueState[0].nextAttemptAt).not.toBe(Number.MAX_SAFE_INTEGER);
    expect(queueState[0].nextAttemptAt).toBeGreaterThanOrEqual(
      startedAt + TEST_MEDIA_UPLOAD_COOLDOWN_MS
    );
    const payload = queueState[0].payload as {
      kind: 'create';
      entry: Record<string, unknown>;
    };
    expect(payload.entry['imageUri']).toBe('data:image/jpeg;base64,Zm9vYmFy');
    expect(payload.entry['image_asset_id']).toBeUndefined();
    expect(payload.entry['image_render_url']).toBeUndefined();
  });
});
