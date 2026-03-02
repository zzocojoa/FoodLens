import { AnalysisService } from '../analysisService';
import { getStoredAnalyses, saveAnalyses } from '../analysis/storage_Logic';
import { enqueueHistorySync, dispatchPhase2SyncQueue } from '../sync/phase2SyncQueue_Logic';

jest.mock('../analysis/storage_Logic', () => ({
  getStoredAnalyses: jest.fn(),
  saveAnalyses: jest.fn(),
}));

jest.mock('../sync/phase2SyncQueue_Logic', () => ({
  dispatchPhase2SyncQueue: jest.fn(async () => undefined),
  enqueueHistorySync: jest.fn(async () => undefined),
  startPhase2SyncRuntime: jest.fn(),
}));

jest.mock('../sync/phase2Mappers_Logic', () => ({
  mergeRemoteHistory: jest.fn(),
  serializeHistoryRecord: jest.fn((record) => record),
}));

jest.mock('../storage_Logic', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
  },
}));

jest.mock('../imageStorage_Logic', () => ({
  deleteImage: jest.fn(async () => undefined),
}));

jest.mock('../sync/phase2Api_Logic', () => ({
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

describe('AnalysisService barcode dedupe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});

