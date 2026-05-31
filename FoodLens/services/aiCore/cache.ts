import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

import { SafeStorage } from '@/services/storage';

import { AI_CACHE_MAX_ENTRIES, AI_CACHE_TTL_SECONDS } from './constants';

const CACHE_STORAGE_KEY = '@foodlens_ai_cache_v1';

type AiCacheEntry = {
  key: string;
  value: unknown;
  expiresAt: number;
  accessedAt: number;
};

type AiCacheStore = {
  entries: Record<string, AiCacheEntry>;
};

const emptyStore = (): AiCacheStore => ({ entries: {} });

const nowMs = (): number => Date.now();

const loadStore = async (): Promise<AiCacheStore> => {
  return SafeStorage.get<AiCacheStore>(CACHE_STORAGE_KEY, emptyStore());
};

const saveStore = async (store: AiCacheStore): Promise<void> => {
  await SafeStorage.set(CACHE_STORAGE_KEY, store);
};

export const clearAiCache = async (): Promise<void> => {
  await SafeStorage.remove(CACHE_STORAGE_KEY);
};

const normalizeStore = (store: AiCacheStore): AiCacheStore => {
  if (!store || typeof store !== 'object' || !store.entries || typeof store.entries !== 'object') {
    return emptyStore();
  }
  return store;
};

const pruneExpired = (store: AiCacheStore): void => {
  const current = nowMs();
  Object.entries(store.entries).forEach(([key, entry]) => {
    if (!entry || entry.expiresAt <= current) {
      delete store.entries[key];
    }
  });
};

const pruneLru = (store: AiCacheStore, maxEntries: number): void => {
  const keys = Object.keys(store.entries);
  if (keys.length <= maxEntries) return;

  const sortedKeys = keys.sort((a, b) => (store.entries[a].accessedAt || 0) - (store.entries[b].accessedAt || 0));
  const removeCount = keys.length - maxEntries;
  for (let index = 0; index < removeCount; index += 1) {
    delete store.entries[sortedKeys[index]];
  }
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

export const sha256Hex = async (text: string): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
  }

  const encoder = new TextEncoder();
  const digest = await subtle.digest('SHA-256', encoder.encode(text));
  return toHex(new Uint8Array(digest));
};

type AiCacheKeyKind = 'barcode' | 'image' | 'unknown';

const fingerprintSensitiveSegment = async (value: string): Promise<string> => {
  const digest = await sha256Hex(value);
  return digest.slice(0, 32);
};

const getAiCacheKeyKind = (key: string): AiCacheKeyKind => {
  if (key.startsWith('barcode|')) return 'barcode';
  if (key.startsWith('img|')) return 'image';
  return 'unknown';
};

const isLegacySensitiveAiCacheKey = (key: string): boolean => {
  const segments = key.split('|');
  if (segments[0] === 'barcode') {
    return !segments[1]?.startsWith('b:') || !segments[2]?.startsWith('a:');
  }
  if (segments[0] === 'img') {
    return !segments[3]?.startsWith('a:');
  }
  return false;
};

const assertSafeAiCacheKey = (key: string): void => {
  if (!isLegacySensitiveAiCacheKey(key)) return;
  throw new Error('AI cache key uses a legacy sensitive format');
};

const pruneLegacySensitiveKeys = (store: AiCacheStore): void => {
  Object.entries(store.entries).forEach(([key, entry]) => {
    const entryKey = typeof entry?.key === 'string' ? entry.key : key;
    if (isLegacySensitiveAiCacheKey(key) || isLegacySensitiveAiCacheKey(entryKey)) {
      delete store.entries[key];
    }
  });
};

export const buildImageContentHash = async (imageUri: string): Promise<string> => {
  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
  return sha256Hex(base64);
};

export const buildImageCacheKey = async (params: {
  endpoint: '/analyze' | '/analyze/label' | '/analyze/smart';
  imageHash: string;
  allergyInfo: string;
  locale: string;
  isoCountryCode: string;
}): Promise<string> => {
  const normalizedAllergy = params.allergyInfo.trim().toLowerCase() || 'none';
  const normalizedLocale = params.locale.trim().toLowerCase() || 'en-us';
  const normalizedCountry = params.isoCountryCode.trim().toUpperCase() || 'US';
  const allergyFingerprint = await fingerprintSensitiveSegment(normalizedAllergy);
  return `img|${params.endpoint}|${params.imageHash}|a:${allergyFingerprint}|${normalizedLocale}|${normalizedCountry}`;
};

export const buildBarcodeCacheKey = async (params: {
  barcode: string;
  allergyInfo: string;
  locale: string;
}): Promise<string> => {
  const normalizedBarcode = params.barcode.trim();
  const normalizedAllergy = params.allergyInfo.trim().toLowerCase() || 'none';
  const normalizedLocale = params.locale.trim().toLowerCase() || 'en-us';
  const [barcodeFingerprint, allergyFingerprint] = await Promise.all([
    fingerprintSensitiveSegment(normalizedBarcode),
    fingerprintSensitiveSegment(normalizedAllergy),
  ]);
  return `barcode|b:${barcodeFingerprint}|a:${allergyFingerprint}|${normalizedLocale}`;
};

export const getAiCacheValue = async <T>(key: string): Promise<T | null> => {
  const rawStore = await loadStore();
  const store = normalizeStore(rawStore);
  pruneLegacySensitiveKeys(store);
  pruneExpired(store);
  const entry = store.entries[key];
  if (!entry) {
    await saveStore(store);
    return null;
  }

  entry.accessedAt = nowMs();
  await saveStore(store);
  console.log('[AI Cache] cache_hit=true', { cache_key_kind: getAiCacheKeyKind(key) });
  return entry.value as T;
};

export const setAiCacheValue = async (
  key: string,
  value: unknown,
  options?: { ttlSeconds?: number; maxEntries?: number }
): Promise<void> => {
  assertSafeAiCacheKey(key);
  const ttlSeconds = options?.ttlSeconds ?? AI_CACHE_TTL_SECONDS;
  const maxEntries = options?.maxEntries ?? AI_CACHE_MAX_ENTRIES;
  const rawStore = await loadStore();
  const store = normalizeStore(rawStore);
  const current = nowMs();
  pruneLegacySensitiveKeys(store);
  pruneExpired(store);
  store.entries[key] = {
    key,
    value,
    accessedAt: current,
    expiresAt: current + Math.max(1, ttlSeconds) * 1000,
  };
  pruneLru(store, Math.max(1, maxEntries));
  await saveStore(store);
};
