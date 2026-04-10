import { dataStore } from '../dataStore';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    clearAll: jest.fn(async () => undefined),
  },
}));

describe('dataStore', () => {
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
});
