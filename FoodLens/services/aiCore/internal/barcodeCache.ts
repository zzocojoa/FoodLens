import { SafeStorage } from '../../storage';
import { sha256Hex } from '../cache';
import { BarcodeLookupResult } from '../types';

const BARCODE_CACHE_KEY_PREFIX = 'barcode_cache_';
const CACHE_EXPIRY_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface CachedBarcode {
  result: BarcodeLookupResult;
  timestamp: number;
}

const normalizeCacheContext = (context?: string): string => {
  if (!context) return 'default';
  const normalized = context.trim().toLowerCase();
  return normalized.length > 0 ? normalized : 'default';
};

const fingerprintCacheSegment = async (input: string): Promise<string> => {
  const digest = await sha256Hex(input);
  return digest.slice(0, 32);
};

const buildBarcodeCacheKey = async (barcode: string, context?: string): Promise<string> => {
  const [barcodeHash, contextHash] = await Promise.all([
    fingerprintCacheSegment(barcode.trim()),
    fingerprintCacheSegment(normalizeCacheContext(context)),
  ]);
  return `${BARCODE_CACHE_KEY_PREFIX}${barcodeHash}_${contextHash}`;
};

export const BarcodeCache = {
  /**
   * Get cached result for a barcode
   */
  async get(barcode: string, context?: string): Promise<BarcodeLookupResult | null> {
    const key = await buildBarcodeCacheKey(barcode, context);
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
  async set(barcode: string, result: BarcodeLookupResult, context?: string): Promise<void> {
    if (!result.found) return; // Don't cache negative results
    
    const key = await buildBarcodeCacheKey(barcode, context);
    await SafeStorage.set(key, {
      result,
      timestamp: Date.now(),
    });
  },

  /**
   * Clear all barcode cache (optional utility)
   */
  async clear(): Promise<void> {
    await SafeStorage.removeByPrefix(BARCODE_CACHE_KEY_PREFIX);
  }
};
