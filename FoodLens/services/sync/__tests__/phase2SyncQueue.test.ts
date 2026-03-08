import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { getCurrentUserId, hasAuthenticatedUser } from '@/services/auth/currentUser_Logic';
import { restoreSession } from '@/services/auth/sessionManager_Logic';
import { SafeStorage } from '@/services/storage_Logic';
import { Phase2Api, Phase2SyncApiError } from '../phase2Api_Logic';
import {
  __resetPhase2SettingsDispatchDedupeForTests,
  dispatchPhase2SyncQueue,
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

jest.mock('@/services/auth/currentUser_Logic', () => ({
  getCurrentUserId: jest.fn(),
  hasAuthenticatedUser: jest.fn(),
}));

jest.mock('@/services/auth/sessionManager_Logic', () => ({
  restoreSession: jest.fn(),
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

  it('uploads local/data history images first and dispatches image_asset_id', async () => {
    const historyOp: Phase2SyncOperation = {
      id: 'op-history-a',
      userId: 'usr_a',
      entity: 'history',
      payload: {
        id: 'analysis_1',
        foodName: 'Sushi',
        imageUri: 'data:image/jpeg;base64,Zm9vYmFy',
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

  it('continues profile sync without image when media upload is non-blocking failure', async () => {
    queueState = [
      {
        ...pendingProfileOperation('op-profile-media-fallback', 'usr_a'),
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

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.putProfile).toHaveBeenCalledTimes(1);
    const sentPayload = mockedPhase2Api.putProfile.mock.calls[0][0] as Record<string, unknown>;
    expect(sentPayload['display_name']).toBe('usr_a-name');
    expect(sentPayload['profile_image_url']).toBeUndefined();
    expect(sentPayload['profile_image_local_uri']).toBeUndefined();
    expect(sentPayload['profile_image_asset_id']).toBeUndefined();
    expect(queueState[0].state).toBe('synced');
  });

  it('continues history sync without image when media upload is non-blocking failure', async () => {
    const historyOp: Phase2SyncOperation = {
      id: 'op-history-media-fallback',
      userId: 'usr_a',
      entity: 'history',
      payload: {
        id: 'analysis_2',
        foodName: 'Pasta',
        imageUri: 'data:image/jpeg;base64,Zm9vYmFy',
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

    await dispatchPhase2SyncQueue();

    expect(mockedPhase2Api.postHistory).toHaveBeenCalledTimes(1);
    const sent = mockedPhase2Api.postHistory.mock.calls[0][0] as {
      entry: Record<string, unknown>;
      idempotency_key?: string;
    };
    expect(sent.idempotency_key).toBe('analysis_2');
    expect(sent.entry['id']).toBe('analysis_2');
    expect(sent.entry['foodName']).toBe('Pasta');
    expect(sent.entry['imageUri']).toBeUndefined();
    expect(sent.entry['image_asset_id']).toBeUndefined();
    expect(sent.entry['image_render_url']).toBeUndefined();
    expect(queueState[0].state).toBe('synced');
  });
});
