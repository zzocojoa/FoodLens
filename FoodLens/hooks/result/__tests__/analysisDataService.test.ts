import { analysisDataService } from '../analysisDataService';
import { dataStore } from '@/services/dataStore';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    clearAll: jest.fn(async () => undefined),
  },
}));

describe('analysisDataService', () => {
  afterEach(async () => {
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
});
