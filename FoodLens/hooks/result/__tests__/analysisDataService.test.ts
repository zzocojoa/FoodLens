import { analysisDataService } from '../analysisDataService';
import { dataStore } from '@/services/dataStore';
import type { AnalyzedData } from '@/services/ai';
import type { AnalysisStoreBackup } from '@/services/contracts/analysisStore';
import { SafeStorage } from '@/services/storage';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    clearAll: jest.fn(async () => undefined),
  },
}));

const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;

describe('analysisDataService', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await dataStore.clear();
  });

  it('returns the stored record id in store mode', async () => {
    dataStore.setData(
      {
        foodName: 'Bibimbap',
        safetyStatus: 'CAUTION',
        ingredients: [],
        request_id: 'req-123',
      },
      null,
      '',
      '2026-03-29T10:15:00.000Z',
      'record-99'
    );

    const loaded = await analysisDataService.load({
      isRestoring: false,
      fromStore: 'true',
      data: undefined,
      location: undefined,
      isBarcode: undefined,
    });

    expect(loaded.recordId).toBe('record-99');
    expect(loaded.result?.request_id).toBe('req-123');
  });

  it('rejects stored results with invalid ingredient entries before rendering', async () => {
    const invalidResult = {
      foodName: 'Bibimbap',
      safetyStatus: 'CAUTION',
      ingredients: [null],
    } as unknown as AnalyzedData;

    dataStore.setData(invalidResult, null, '', '2026-03-29T10:15:00.000Z', 'record-bad');

    const loaded = await analysisDataService.load({
      isRestoring: false,
      fromStore: 'true',
      data: undefined,
      location: undefined,
      isBarcode: undefined,
    });

    expect(loaded.result).toBeNull();
    expect(loaded.recordId).toBe('record-bad');
  });

  it('rejects stored results with invalid translation card language before rendering', async () => {
    const invalidResult = {
      foodName: 'Bibimbap',
      safetyStatus: 'CAUTION',
      ingredients: [],
      translationCard: {
        text: '알레르기가 있습니다.',
      },
    } as unknown as AnalyzedData;

    dataStore.setData(invalidResult, null, '', '2026-03-29T10:15:00.000Z', 'record-translation');

    const loaded = await analysisDataService.load({
      isRestoring: false,
      fromStore: 'true',
      data: undefined,
      location: undefined,
      isBarcode: undefined,
    });

    expect(loaded.result).toBeNull();
    expect(loaded.recordId).toBe('record-translation');
  });

  it('rejects restored backup results with invalid ingredient entries before rendering', async () => {
    const invalidResult = {
      foodName: 'Bibimbap',
      safetyStatus: 'CAUTION',
      ingredients: [null],
    } as unknown as AnalyzedData;
    const backup = {
      schemaVersion: 2,
      result: invalidResult,
      location: null,
      imageUri: '',
      timestamp: 1774788900000,
      originalTimestamp: '2026-03-29T10:15:00.000Z',
      recordId: 'record-restored-bad',
    } satisfies AnalysisStoreBackup;

    mockedSafeStorage.get.mockResolvedValueOnce(backup as never);

    const loaded = await analysisDataService.load({
      isRestoring: true,
      fromStore: undefined,
      data: undefined,
      location: undefined,
      isBarcode: undefined,
    });

    expect(loaded.result).toBeNull();
    expect(loaded.recordId).toBe('record-restored-bad');
  });
});
