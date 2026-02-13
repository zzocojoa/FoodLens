import { SafeStorage } from '../../storage';
import { BarcodeLookupResult } from '../types';

const BARCODE_CACHE_KEY_PREFIX = 'barcode_cache_';
const CACHE_EXPIRY_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface CachedBarcode {
  result: BarcodeLookupResult;
  timestamp: number;
}

export const BarcodeCache = {
  /**
   * Get cached result for a barcode
   */
  async get(barcode: string): Promise<BarcodeLookupResult | null> {
    const key = `${BARCODE_CACHE_KEY_PREFIX}${barcode}`;
    const cached = await SafeStorage.get<CachedBarcode | null>(key, null);
    
    if (cached) {
      const now = Date.now();
      if (now - cached.timestamp < CACHE_EXPIRY_MS) {
        return cached.result;
      } else {
        // Cache expired
        await SafeStorage.remove(key);
      }
    }
    return null;
  },

  /**
   * Save result to cache
   */
  async set(barcode: string, result: BarcodeLookupResult): Promise<void> {
    if (!result.found) return; // Don't cache negative results
    
    const key = `${BARCODE_CACHE_KEY_PREFIX}${barcode}`;
    await SafeStorage.set(key, {
      result,
      timestamp: Date.now(),
    });
  },

  /**
   * Clear all barcode cache (optional utility)
   */
  async clear(): Promise<void> {
    // Note: SafeStorage doesn't support prefix-based removal easily yet, 
    // but we can clear individual keys or leave it for automatic expiry.
  }
};
