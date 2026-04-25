import { AnalysisService } from '../analysisService';
import { getStoredAnalyses, saveAnalyses } from '../analysis/storage';
import { enqueueHistorySync, dispatchPhase2SyncQueue } from '../sync/phase2SyncQueue';
import { queryClient } from '../queryClient';
import { Phase2Api } from '../sync/phase2Api';

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

const mockedGetStoredAnalyses = getStoredAnalyses as jest.MockedFunction<typeof getStoredAnalyses>;
const mockedSaveAnalyses = saveAnalyses as jest.MockedFunction<typeof saveAnalyses>;
const mockedEnqueueHistorySync = enqueueHistorySync as jest.MockedFunction<typeof enqueueHistorySync>;
const mockedDispatchPhase2SyncQueue = dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedGetHistory = Phase2Api.getHistory as jest.MockedFunction<typeof Phase2Api.getHistory>;

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
});
