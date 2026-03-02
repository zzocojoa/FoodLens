import {
  buildBarcodeCacheKey,
  buildImageCacheKey,
  getAiCacheValue,
  setAiCacheValue,
  sha256Hex,
} from '../cache';

const mockMemoryStore = new Map<string, unknown>();

jest.mock('@/services/storage_Logic', () => ({
  SafeStorage: {
    get: jest.fn(async (key: string, fallback: unknown) =>
      mockMemoryStore.has(key) ? mockMemoryStore.get(key) : fallback
    ),
    set: jest.fn(async (key: string, value: unknown) => {
      mockMemoryStore.set(key, value);
    }),
  },
}));

describe('aiCore cache', () => {
  beforeEach(() => {
    mockMemoryStore.clear();
  });

  it('builds deterministic barcode cache key', () => {
    const key = buildBarcodeCacheKey({
      barcode: '8801234567890',
      allergyInfo: 'Soy, Wheat',
      locale: 'ko-KR',
    });
    expect(key).toContain('8801234567890');
    expect(key).toContain('soy, wheat');
    expect(key).toContain('ko-kr');
  });

  it('builds deterministic image cache key', () => {
    const key = buildImageCacheKey({
      endpoint: '/analyze/label',
      imageHash: 'hash123',
      allergyInfo: 'None',
      locale: 'en-US',
      isoCountryCode: 'us',
    });
    expect(key).toBe('img|/analyze/label|hash123|none|en-us|US');
  });

  it('stores and retrieves cached value', async () => {
    await setAiCacheValue('k1', { value: 1 }, { ttlSeconds: 60, maxEntries: 10 });
    const cached = await getAiCacheValue<{ value: number }>('k1');
    expect(cached).toEqual({ value: 1 });
  });

  it('expires cached value by ttl', async () => {
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy.mockReturnValue(1000);
    await setAiCacheValue('k-expire', { value: 1 }, { ttlSeconds: 1, maxEntries: 10 });
    dateSpy.mockReturnValue(2501);

    const cached = await getAiCacheValue('k-expire');
    expect(cached).toBeNull();
    dateSpy.mockRestore();
  });

  it('enforces LRU max entries', async () => {
    const dateSpy = jest.spyOn(Date, 'now');
    dateSpy.mockReturnValue(1000);
    await setAiCacheValue('k1', 1, { ttlSeconds: 60, maxEntries: 2 });
    dateSpy.mockReturnValue(1100);
    await setAiCacheValue('k2', 2, { ttlSeconds: 60, maxEntries: 2 });
    dateSpy.mockReturnValue(1200);
    await setAiCacheValue('k3', 3, { ttlSeconds: 60, maxEntries: 2 });

    const k1 = await getAiCacheValue('k1');
    const k2 = await getAiCacheValue('k2');
    const k3 = await getAiCacheValue('k3');
    expect(k1).toBeNull();
    expect(k2).toBe(2);
    expect(k3).toBe(3);
    dateSpy.mockRestore();
  });

  it('falls back when subtle crypto is unavailable', async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });
    const digest = await sha256Hex('abc');
    expect(digest.startsWith('fnv1a-')).toBe(true);

    Object.defineProperty(globalThis, 'crypto', {
      value: originalCrypto,
      configurable: true,
    });
  });
});
