import { AnalysisService } from '../analysisService';
import { getStoredAnalyses, saveAnalyses } from '../analysis/storage';
import { enqueueHistorySync, dispatchPhase2SyncQueue } from '../sync/phase2SyncQueue';
import { queryClient } from '../queryClient';
import { Phase2Api, Phase2SyncApiError } from '../sync/phase2Api';
import { mergeRemoteHistory } from '../sync/phase2Mappers';
import { getCurrentUserId, hasAuthenticatedUser } from '../auth/currentUser';

jest.mock('../analysis/storage', () => ({
  getStoredAnalyses: jest.fn(),
  saveAnalyses: jest.fn(),
}));

jest.mock('../sync/phase2SyncQueue', () => ({
  dispatchPhase2SyncQueue: jest.fn(async () => undefined),
  enqueueHistorySync: jest.fn(async () => undefined),
  getPhase2SyncQueueSnapshot: jest.fn(async () => []),
  startPhase2SyncRuntime: jest.fn(),
}));

jest.mock('../sync/phase2Mappers', () => ({
  mergeRemoteHistory: jest.fn((local) => local),
  serializeHistoryRecord: jest.fn((record) => record),
}));

jest.mock('../storage', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
  },
}));

jest.mock('../imageStorage', () => ({
  deleteImage: jest.fn(async () => undefined),
}));

jest.mock('../sync/phase2Api', () => ({
  Phase2Api: {
    getHistory: jest.fn(async () => ({ history: [], requestId: 'req-history' })),
    deleteHistory: jest.fn(async () => ({ deleted: true, requestId: 'req-delete' })),
  },
  Phase2SyncApiError: class MockPhase2SyncApiError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

jest.mock('../auth/currentUser', () => ({
  getCurrentUserId: jest.fn(() => 'usr_test'),
  hasAuthenticatedUser: jest.fn(() => true),
}));

const mockedGetStoredAnalyses = getStoredAnalyses as jest.MockedFunction<typeof getStoredAnalyses>;
const mockedSaveAnalyses = saveAnalyses as jest.MockedFunction<typeof saveAnalyses>;
const mockedEnqueueHistorySync = enqueueHistorySync as jest.MockedFunction<typeof enqueueHistorySync>;
const mockedDispatchPhase2SyncQueue = dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedGetHistory = Phase2Api.getHistory as jest.MockedFunction<typeof Phase2Api.getHistory>;
const mockedMergeRemoteHistory = mergeRemoteHistory as jest.MockedFunction<typeof mergeRemoteHistory>;
const mockedGetCurrentUserId = getCurrentUserId as jest.MockedFunction<typeof getCurrentUserId>;
const mockedHasAuthenticatedUser = hasAuthenticatedUser as jest.MockedFunction<typeof hasAuthenticatedUser>;

type DeferredPromise<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const createDeferredPromise = <T>(): DeferredPromise<T> => {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  if (resolvePromise === null) {
    throw new Error('Failed to initialize deferred promise resolver');
  }
  return {
    promise,
    resolve: resolvePromise,
  };
};

describe('AnalysisService barcode dedupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockedGetCurrentUserId.mockReturnValue('usr_test');
    mockedHasAuthenticatedUser.mockReturnValue(true);
  });

  afterEach(() => {
    queryClient.clear();
    jest.restoreAllMocks();
  });

  it('skips duplicate barcode saves within short window', async () => {
    const now = new Date('2026-03-02T14:05:10.000Z');
    const existingRecord = {
      id: 'record-existing',
      foodName: 'Jin Ramen',
      safetyStatus: 'SAFE',
      ingredients: [],
      nutrition: {
        dataSource: 'BARCODE_OFF',
      },
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
      isBarcode: true,
      raw_data: {
        scanned_barcode: '8801073212619',
        source: 'BARCODE_OFF',
      },
    } as any;
    mockedGetStoredAnalyses.mockResolvedValue([existingRecord]);

    const result = await AnalysisService.saveAnalysis(
      'usr_test',
      {
        foodName: 'Jin Ramen',
        safetyStatus: 'SAFE',
        ingredients: [],
        isBarcode: true,
        nutrition: {
          dataSource: 'BARCODE_OFF',
        },
        raw_data: {
          scanned_barcode: '8801073212619',
          source: 'BARCODE_OFF',
        },
      } as any,
      undefined,
      undefined,
      now.toISOString()
    );

    expect(result).toBe(existingRecord);
    expect(mockedSaveAnalyses).not.toHaveBeenCalled();
    expect(mockedEnqueueHistorySync).not.toHaveBeenCalled();
    expect(mockedDispatchPhase2SyncQueue).not.toHaveBeenCalled();
  });

  it('updates history query cache immediately after a successful save', async () => {
    mockedGetStoredAnalyses.mockResolvedValue([]);

    const saved = await AnalysisService.saveAnalysis(
      'usr_test',
      {
        foodName: 'Test cereal',
        safetyStatus: 'SAFE',
        decisionStatus: 'OK',
        analysisOrigin: 'food_photo',
        recommendedAction: 'eat',
        uncertaintyReason: 'unknown',
        ingredients: [],
        raw_data: {},
      } as any,
      'file:///tmp/test.jpg'
    );

    // Save path should hydrate history cache without waiting for screen refetch.
    const cached = queryClient.getQueryData<any[]>(['history', 'usr_test']);
    expect(Array.isArray(cached)).toBe(true);
    expect(cached?.length).toBe(1);
    expect(cached?.[0]?.id).toBe(saved.id);
    expect(cached?.[0]?.foodName).toBe('Test cereal');
    expect(cached?.[0]?.decisionStatus).toBe('OK');
    expect(cached?.[0]?.analysisOrigin).toBe('food_photo');
    expect(cached?.[0]?.recommendedAction).toBe('eat');
    expect(cached?.[0]?.uncertaintyReason).toBe('unknown');
    expect(mockedEnqueueHistorySync).toHaveBeenCalledWith(
      'usr_test',
      expect.objectContaining({
        decisionStatus: 'OK',
        analysisOrigin: 'food_photo',
        recommendedAction: 'eat',
        uncertaintyReason: 'unknown',
      }),
      saved.id
    );
  });

  it('returns cached history without waiting for queue dispatch', async () => {
    const existingRecord = {
      id: 'record-existing',
      foodName: 'Kimchi stew',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    const dispatchDeferred = createDeferredPromise<void>();
    mockedGetStoredAnalyses.mockResolvedValue([existingRecord]);
    mockedDispatchPhase2SyncQueue.mockReturnValue(dispatchDeferred.promise);

    const result = await AnalysisService.getAllAnalyses('usr_test');

    expect(result).toEqual([existingRecord]);
    expect(mockedDispatchPhase2SyncQueue).toHaveBeenCalledTimes(1);
    dispatchDeferred.resolve(undefined);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  it('returns empty local history without waiting for server pull', async () => {
    const remoteDeferred = createDeferredPromise<{ history: []; requestId: string }>();
    mockedGetStoredAnalyses.mockResolvedValue([]);
    mockedDispatchPhase2SyncQueue.mockResolvedValue(undefined);
    mockedGetHistory.mockReturnValue(remoteDeferred.promise);

    const result = await AnalysisService.getAllAnalyses('usr_empty_test');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(result).toEqual([]);
    expect(mockedGetHistory).toHaveBeenCalledTimes(1);
    remoteDeferred.resolve({ history: [], requestId: 'req-history' });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });

  it('forces cloud history sync, flushes queued writes, and updates the history query cache before resolving', async () => {
    const localRecord = {
      id: 'record-local',
      foodName: 'Local rice',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    const remoteRecord = {
      id: 'record-remote',
      foodName: 'Remote soup',
      safetyStatus: 'CAUTION',
      ingredients: [],
      timestamp: new Date('2026-03-03T14:05:09.000Z'),
    } as any;
    const remoteHistoryItem = {
      id: 'remote-history-item',
      user_id: 'usr_test',
      entry: {
        id: 'record-remote',
      },
    };

    mockedGetStoredAnalyses.mockResolvedValue([localRecord]);
    const remotePull = createDeferredPromise<{ history: unknown[]; requestId: string }>();
    mockedGetHistory.mockReturnValueOnce(remotePull.promise as never);
    mockedMergeRemoteHistory.mockReturnValueOnce([remoteRecord]);

    let settled = false;
    const resultPromise = AnalysisService.syncHistoryFromCloud('usr_test', { force: true }).then((result) => {
      settled = true;
      return result;
    });

    await Promise.resolve();
    expect(settled).toBe(false);

    remotePull.resolve({
      history: [remoteHistoryItem],
      requestId: 'req-history',
    });
    const result = await resultPromise;

    expect(mockedDispatchPhase2SyncQueue).toHaveBeenCalledTimes(1);
    expect(mockedGetHistory).toHaveBeenCalledTimes(1);
    expect(mockedGetHistory.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockedDispatchPhase2SyncQueue.mock.invocationCallOrder[0]
    );
    expect(mockedMergeRemoteHistory).toHaveBeenCalledWith([localRecord], [remoteHistoryItem], {
      keepLocalOnlyIds: new Set<string>(),
      preserveLocalTimestampIds: new Set<string>(),
    });
    expect(mockedSaveAnalyses).toHaveBeenCalledWith('usr_test', [remoteRecord]);
    expect(queryClient.getQueryData(['history', 'usr_test'])).toEqual([remoteRecord]);
    expect(result).toEqual([remoteRecord]);
  });

  it('preserves local records created while a cloud history pull is in flight', async () => {
    const localAtPullStart = {
      id: 'record-local-start',
      foodName: 'Local rice',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    const localCreatedDuringPull = {
      id: 'record-local-created-during-pull',
      foodName: 'New local soup',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-03T14:05:09.000Z'),
    } as any;
    const remoteRecord = {
      id: 'record-remote',
      foodName: 'Remote soup',
      safetyStatus: 'CAUTION',
      ingredients: [],
      timestamp: new Date('2026-03-04T14:05:09.000Z'),
    } as any;
    const remoteHistoryItem = {
      id: 'remote-history-item',
      user_id: 'usr_test',
      entry: {
        id: 'record-remote',
      },
    };
    const mergedRecords = [remoteRecord, localCreatedDuringPull];

    mockedGetStoredAnalyses
      .mockResolvedValueOnce([localAtPullStart])
      .mockResolvedValueOnce([localCreatedDuringPull, localAtPullStart]);
    mockedGetHistory.mockResolvedValueOnce({
      history: [remoteHistoryItem],
      requestId: 'req-history',
    });
    mockedMergeRemoteHistory.mockReturnValueOnce(mergedRecords);

    const result = await AnalysisService.syncHistoryFromCloudWithStatus('usr_test', {
      force: true,
    });

    expect(mockedMergeRemoteHistory).toHaveBeenCalledWith(
      [localCreatedDuringPull, localAtPullStart],
      [remoteHistoryItem],
      {
        keepLocalOnlyIds: new Set(['record-local-created-during-pull']),
        preserveLocalTimestampIds: new Set<string>(),
      }
    );
    expect(mockedSaveAnalyses).toHaveBeenCalledWith('usr_test', mergedRecords);
    expect(result).toEqual({
      records: mergedRecords,
      status: 'synced',
    });
  });

  it('bypasses history pull cooldown when force cloud sync is requested twice', async () => {
    mockedGetCurrentUserId.mockReturnValue('usr_force_history');
    mockedGetStoredAnalyses.mockResolvedValue([]);
    mockedGetHistory
      .mockResolvedValueOnce({ history: [], requestId: 'req-history-1' })
      .mockResolvedValueOnce({ history: [], requestId: 'req-history-2' });

    await AnalysisService.syncHistoryFromCloud('usr_force_history', { force: true });
    await AnalysisService.syncHistoryFromCloud('usr_force_history', { force: true });

    expect(mockedGetHistory).toHaveBeenCalledTimes(2);
  });

  it('returns auth-required status without clearing local history when cloud refresh lacks a session', async () => {
    mockedGetCurrentUserId.mockReturnValue('usr_auth_history');
    const localRecord = {
      id: 'record-local',
      foodName: 'Local rice',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    mockedGetStoredAnalyses.mockResolvedValue([localRecord]);
    mockedGetHistory.mockRejectedValueOnce(
      new Phase2SyncApiError('Session is not available.', 'AUTH_SESSION_REQUIRED', 401)
    );

    const result = await AnalysisService.syncHistoryFromCloudWithStatus('usr_auth_history', {
      force: true,
    });

    expect(result).toEqual({
      records: [localRecord],
      status: 'auth_required',
      errorCode: 'AUTH_SESSION_REQUIRED',
      requestId: undefined,
    });
    expect(mockedSaveAnalyses).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['history', 'usr_auth_history'])).toBeUndefined();
  });

  it('returns failed status without clearing local history when cloud refresh cannot reach the server', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedGetCurrentUserId.mockReturnValue('usr_failed_history');
    const localRecord = {
      id: 'record-local',
      foodName: 'Local rice',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    mockedGetStoredAnalyses.mockResolvedValue([localRecord]);
    mockedGetHistory.mockRejectedValueOnce(new Error('network down'));

    const result = await AnalysisService.syncHistoryFromCloudWithStatus('usr_failed_history', {
      force: true,
    });

    expect(result).toEqual({
      records: [localRecord],
      status: 'failed',
      errorCode: 'PHASE2_HISTORY_PULL_FAILED',
      requestId: undefined,
    });
    expect(mockedSaveAnalyses).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['history', 'usr_failed_history'])).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith('', '[Phase2Sync] history pull failed', {
      request_id: 'unknown',
      user_id: 'usr_failed_history',
      code: 'PHASE2_HISTORY_PULL_FAILED',
    });
    warnSpy.mockRestore();
  });

  it('skips save and cache writes when the active user changes before a cloud history pull resolves', async () => {
    const localRecord = {
      id: 'record-local',
      foodName: 'Local rice',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    const remoteHistoryItem = {
      id: 'remote-history-item',
      user_id: 'usr_a',
      entry: {
        id: 'record-remote',
      },
    };
    mockedGetStoredAnalyses.mockResolvedValue([localRecord]);
    const remotePull = createDeferredPromise<{ history: unknown[]; requestId: string }>();
    mockedGetHistory.mockReturnValueOnce(remotePull.promise as never);
    mockedGetCurrentUserId.mockReturnValue('usr_a');

    const resultPromise = AnalysisService.syncHistoryFromCloudWithStatus('usr_a', {
      force: true,
    });
    await Promise.resolve();

    mockedGetCurrentUserId.mockReturnValue('usr_b');
    remotePull.resolve({
      history: [remoteHistoryItem],
      requestId: 'req-history',
    });

    await expect(resultPromise).resolves.toEqual({
      records: [localRecord],
      status: 'stale_user',
    });
    expect(mockedMergeRemoteHistory).not.toHaveBeenCalled();
    expect(mockedSaveAnalyses).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['history', 'usr_a'])).toBeUndefined();
  });

  it('skips save and cache writes when the active user changes after merge but before persist', async () => {
    const localRecord = {
      id: 'record-local',
      foodName: 'Local rice',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    const remoteRecord = {
      id: 'record-remote',
      foodName: 'Remote soup',
      safetyStatus: 'CAUTION',
      ingredients: [],
      timestamp: new Date('2026-03-03T14:05:09.000Z'),
    } as any;
    const remoteHistoryItem = {
      id: 'remote-history-item',
      user_id: 'usr_a',
      entry: {
        id: 'record-remote',
      },
    };
    mockedGetStoredAnalyses.mockResolvedValue([localRecord]);
    mockedGetHistory.mockResolvedValueOnce({
      history: [remoteHistoryItem],
      requestId: 'req-history',
    });
    mockedGetCurrentUserId.mockReturnValue('usr_a');
    mockedMergeRemoteHistory.mockImplementationOnce(() => {
      mockedGetCurrentUserId.mockReturnValue('usr_b');
      return [remoteRecord];
    });

    await expect(AnalysisService.syncHistoryFromCloudWithStatus('usr_a', {
      force: true,
    })).resolves.toEqual({
      records: [localRecord],
      status: 'stale_user',
    });
    expect(mockedSaveAnalyses).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(['history', 'usr_a'])).toBeUndefined();
  });

  it('does not poison the history pull cooldown when an account switch marks the pull stale', async () => {
    const localRecord = {
      id: 'record-local',
      foodName: 'Local rice',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-02T14:05:09.000Z'),
    } as any;
    mockedGetStoredAnalyses.mockResolvedValue([localRecord]);
    const stalePull = createDeferredPromise<{ history: unknown[]; requestId: string }>();
    mockedGetHistory.mockReturnValueOnce(stalePull.promise as never);
    mockedGetCurrentUserId.mockReturnValue('usr_cooldown');

    const staleResultPromise = AnalysisService.syncHistoryFromCloudWithStatus('usr_cooldown', {
      force: false,
    });
    await Promise.resolve();

    mockedGetCurrentUserId.mockReturnValue('usr_other');
    stalePull.resolve({
      history: [],
      requestId: 'req-stale',
    });

    await expect(staleResultPromise).resolves.toEqual({
      records: [localRecord],
      status: 'stale_user',
    });

    mockedGetCurrentUserId.mockReturnValue('usr_cooldown');
    mockedGetHistory.mockResolvedValueOnce({
      history: [],
      requestId: 'req-after-stale',
    });
    mockedMergeRemoteHistory.mockReturnValueOnce([localRecord]);

    await AnalysisService.syncHistoryFromCloudWithStatus('usr_cooldown', {
      force: false,
    });

    expect(mockedGetHistory).toHaveBeenCalledTimes(2);
    expect(mockedMergeRemoteHistory).toHaveBeenCalledTimes(1);
  });
});
