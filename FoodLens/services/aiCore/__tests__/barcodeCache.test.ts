const mockSafeStorageGet = jest.fn();
const mockSafeStorageSet = jest.fn();
const mockSafeStorageRemove = jest.fn();
const mockSafeStorageRemoveByPrefix = jest.fn();
const mockSha256Hex = jest.fn();

jest.mock('../../storage', () => ({
  SafeStorage: {
    get: (...args: unknown[]) => mockSafeStorageGet(...args),
    set: (...args: unknown[]) => mockSafeStorageSet(...args),
    remove: (...args: unknown[]) => mockSafeStorageRemove(...args),
    removeByPrefix: (...args: unknown[]) => mockSafeStorageRemoveByPrefix(...args),
  },
}));

jest.mock('../cache', () => ({
  sha256Hex: (...args: unknown[]) => mockSha256Hex(...args),
}));

import { BarcodeCache } from '../internal/barcodeCache';

describe('BarcodeCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSafeStorageGet.mockResolvedValue(null);
    mockSafeStorageSet.mockResolvedValue(undefined);
    mockSafeStorageRemove.mockResolvedValue(undefined);
    mockSafeStorageRemoveByPrefix.mockResolvedValue(undefined);
    mockSha256Hex.mockImplementation(async (input: string) =>
      input === '8801073212619' ? 'a'.repeat(64) : 'b'.repeat(64)
    );
  });

  it('uses SHA-256 fingerprints instead of raw barcode or context in storage keys', async () => {
    await BarcodeCache.set(
      '8801073212619',
      {
        found: true,
        source: 'test',
      } as never,
      'milk allergy'
    );

    expect(mockSafeStorageSet).toHaveBeenCalledWith(
      `barcode_cache_${'a'.repeat(32)}_${'b'.repeat(32)}`,
      expect.objectContaining({
        result: expect.objectContaining({ found: true }),
      })
    );
    expect(mockSafeStorageSet).not.toHaveBeenCalledWith(
      expect.stringContaining('8801073212619'),
      expect.anything()
    );
    expect(mockSafeStorageSet).not.toHaveBeenCalledWith(
      expect.stringContaining('milk allergy'),
      expect.anything()
    );
  });
});
