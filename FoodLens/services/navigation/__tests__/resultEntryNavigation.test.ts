import { dataStore } from '@/services/dataStore';
import { navigateToStoredResult } from '../resultEntryNavigation';

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: jest.fn(async (_key: string, fallback: unknown) => fallback),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    clearAll: jest.fn(async () => undefined),
  },
}));

describe('resultEntryNavigation', () => {
  afterEach(async () => {
    await dataStore.clear();
  });

  it('stores the history record id for result report metadata', () => {
    const router = {
      push: jest.fn(),
    };

    navigateToStoredResult(router, {
      id: 'record-42',
      foodName: 'Kimchi',
      safetyStatus: 'SAFE',
      ingredients: [],
      timestamp: new Date('2026-03-29T00:00:00.000Z'),
    });

    expect(dataStore.getData().recordId).toBe('record-42');
    expect(router.push).toHaveBeenCalled();
  });
});
