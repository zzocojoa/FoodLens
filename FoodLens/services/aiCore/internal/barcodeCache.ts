import { SafeStorage } from '../../storage';
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

// Lightweight non-crypto hash to avoid storing raw allergy strings in cache keys.
const hashContext = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const buildBarcodeCacheKey = (barcode: string, context?: string): string => {
  const contextHash = hashContext(normalizeCacheContext(context));
  return `${BARCODE_CACHE_KEY_PREFIX}${barcode}_${contextHash}`;
};

export const BarcodeCache = {
  /**
   * Get cached result for a barcode
   */
  async get(barcode: string, context?: string): Promise<BarcodeLookupResult | null> {
    const key = buildBarcodeCacheKey(barcode, context);
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
    
    const key = buildBarcodeCacheKey(barcode, context);
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
