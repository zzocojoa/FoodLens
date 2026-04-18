import { dataStore } from '../dataStore';

const mockSafeStorageGet = jest.fn();
const mockSafeStorageSet = jest.fn();
const mockSafeStorageRemove = jest.fn();

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: (...args: unknown[]) => mockSafeStorageGet(...args),
    set: (...args: unknown[]) => mockSafeStorageSet(...args),
    remove: (...args: unknown[]) => mockSafeStorageRemove(...args),
    clearAll: jest.fn(async () => undefined),
  },
}));

describe('dataStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSafeStorageGet.mockImplementation(async (_key: string, fallback: unknown) => fallback);
    mockSafeStorageSet.mockResolvedValue(undefined);
    mockSafeStorageRemove.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await dataStore.clear();
  });

  it('applies pending analysis origin to the next stored result', () => {
    dataStore.setPendingAnalysisOrigin('barcode_to_label_fallback');

    dataStore.setData(
      {
        foodName: 'Kimchi',
        safetyStatus: 'SAFE',
        ingredients: [],
      },
      null,
      'file://kimchi.jpg',
      '2026-04-10T00:00:00.000Z'
    );

    expect(dataStore.getData().result?.analysisOrigin).toBe('barcode_to_label_fallback');
    expect(dataStore.getPendingAnalysisOrigin()).toBeNull();
  });

  it('does not overwrite an existing analysis origin', () => {
    dataStore.setPendingAnalysisOrigin('barcode_to_label_fallback');

    dataStore.setData(
      {
        foodName: 'Kimchi',
        safetyStatus: 'SAFE',
        analysisOrigin: 'barcode_lookup',
        ingredients: [],
      },
      null,
      'file://kimchi.jpg',
      '2026-04-10T00:00:00.000Z'
    );

    expect(dataStore.getData().result?.analysisOrigin).toBe('barcode_lookup');
    expect(dataStore.getPendingAnalysisOrigin()).toBeNull();
  });

  it('stores schema version in backup payload', async () => {
    dataStore.setData(
      {
        foodName: 'Kimchi',
        safetyStatus: 'SAFE',
        ingredients: [],
      },
      null,
      'file://kimchi.jpg',
      '2026-04-10T00:00:00.000Z'
    );

    await dataStore.saveBackup();

    expect(mockSafeStorageSet).toHaveBeenCalledWith(
      'foodlens_analysis_backup_v1',
      expect.objectContaining({
        schemaVersion: 2,
        imageUri: 'file://kimchi.jpg',
      })
    );
  });

  it('removes legacy backup payloads without schema version', async () => {
    mockSafeStorageGet.mockResolvedValue({
      result: {
        foodName: 'Kimchi',
        safetyStatus: 'SAFE',
        ingredients: [],
      },
      location: null,
      imageUri: 'file://kimchi.jpg',
      timestamp: Date.now(),
      originalTimestamp: '2026-04-10T00:00:00.000Z',
      recordId: null,
    });

    await expect(dataStore.restoreBackup()).resolves.toBe(false);
    expect(mockSafeStorageRemove).toHaveBeenCalledWith('foodlens_analysis_backup_v1');
  });

  it('restores schema-matched backup payloads', async () => {
    mockSafeStorageGet.mockResolvedValue({
      schemaVersion: 2,
      result: {
        foodName: 'Kimchi',
        safetyStatus: 'SAFE',
        ingredients: [],
      },
      location: null,
      imageUri: 'file://kimchi.jpg',
      timestamp: Date.now(),
      originalTimestamp: '2026-04-10T00:00:00.000Z',
      recordId: 'rec_1',
    });

    await expect(dataStore.restoreBackup()).resolves.toBe(true);
    expect(dataStore.getData()).toEqual({
      result: expect.objectContaining({
        foodName: 'Kimchi',
        safetyStatus: 'SAFE',
      }),
      location: null,
      imageUri: 'file://kimchi.jpg',
      timestamp: '2026-04-10T00:00:00.000Z',
      recordId: 'rec_1',
    });
  });
});
