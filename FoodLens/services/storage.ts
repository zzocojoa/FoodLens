import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';

const LOG_PREFIX = '[SafeStorage]';
const MIGRATION_KEY = 'foodlens_storage_migrated_v1';

const STORAGE_FALLBACK_REQUEST_ID = `safe-storage-${Date.now().toString(36)}`;
const STORAGE_FALLBACK_USER_ID = 'unknown';

let mmkvWarned = false;
export let storage: MMKV | null = null;

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const logMMKVFallbackOnce = (error: unknown): void => {
  if (mmkvWarned) return;
  mmkvWarned = true;
  const details = extractErrorMessage(error);
  const hint =
    typeof globalThis !== 'undefined' && (globalThis as { HermesInternal?: unknown }).HermesInternal
      ? 'MMKV native module unavailable in current runtime.'
      : 'JSI/Hermes path unavailable (often caused by Remote Debugging).';
  console.warn(`${LOG_PREFIX} MMKV initialization failed. Falling back to AsyncStorage (Internal mode).`, {
    request_id: STORAGE_FALLBACK_REQUEST_ID,
    user_id: STORAGE_FALLBACK_USER_ID,
    hint,
    error: details,
  });
};

const getStorageInstance = (): MMKV | null => {
  if (storage) return storage;

  try {
    storage = new MMKV();
    return storage;
  } catch (error) {
    storage = null;
    logMMKVFallbackOnce(error);
    return null;
  }
};

const logParseError = (key: string, error: unknown): void => {
  console.error(`${LOG_PREFIX} Error parsing key "${key}":`, error);
};

const logClearError = (key: string, error: unknown): void => {
  console.error(`${LOG_PREFIX} Failed to clear key "${key}":`, error);
};

const parseStoredValue = <T>(jsonValue: string | undefined | null, fallback: T): T => {
  if (jsonValue === null || jsonValue === undefined) return fallback;
  try {
    return JSON.parse(jsonValue) as T;
  } catch (e) {
    return fallback;
  }
};

/**
 * Migrates data from AsyncStorage to MMKV if not already done.
 */
export const initializeSafeStorage = async () => {
    try {
        const activeStorage = getStorageInstance();
        if (!activeStorage) return; // MMKV not available in current runtime.
        
        const isMigrated = activeStorage.getBoolean(MIGRATION_KEY);
        if (isMigrated) return;

        console.log(`${LOG_PREFIX} Starting migration from AsyncStorage...`);
        const keys = await AsyncStorage.getAllKeys();
        
        if (keys.length > 0) {
            const pairs = await AsyncStorage.multiGet(keys);
            for (const [key, value] of pairs) {
                if (value !== null) {
                    activeStorage.set(key, value);
                }
            }
        }

        activeStorage.set(MIGRATION_KEY, true);
        console.log(`${LOG_PREFIX} Migration completed successfully. Total keys: ${keys.length}`);
    } catch (error) {
        console.error(`${LOG_PREFIX} Migration failed:`, error);
    }
};

/**
 * Safe Storage Wrapper
 * Handles JSON parsing errors gracefully and ensures type safety.
 * Implements "Self-healing" by clearing corrupted data.
 * Powered by react-native-mmkv for synchronous fast access.
 */
export const SafeStorage = {
    /**
     * Synchronously read data when MMKV is available.
     * Falls back to `fallback` if MMKV is unavailable (e.g. remote debug runtime).
     */
    getSync<T>(key: string, fallback: T): T {
        try {
            const activeStorage = getStorageInstance();
            if (!activeStorage) return fallback;
            const jsonValue = activeStorage.getString(key);
            return parseStoredValue(jsonValue, fallback);
        } catch (error) {
            logParseError(key, error);
            return fallback;
        }
    },

    /**
     * Get and parse JSON data safely
     * @param key Storage Key
     * @param fallback Default value if key is missing or parsing fails
     */
    async get<T>(key: string, fallback: T): Promise<T> {
        try {
            const activeStorage = getStorageInstance();
            if (activeStorage) {
                const jsonValue = activeStorage.getString(key);
                return parseStoredValue(jsonValue, fallback);
            }
            // Fallback path when MMKV is unavailable in current runtime.
            const asyncJson = await AsyncStorage.getItem(key);
            return parseStoredValue(asyncJson, fallback);
        } catch (error) {
            logParseError(key, error);
            // Self-healing: Remove corrupted data
            try {
                const activeStorage = getStorageInstance();
                if (activeStorage) {
                    activeStorage.delete(key);
                } else {
                    await AsyncStorage.removeItem(key);
                }
                console.log(`${LOG_PREFIX} Corrupted key "${key}" cleared.`);
            } catch (e) {
                logClearError(key, e);
            }
            return fallback;
        }
    },

    /**
     * Save data safely
     */
    async set<T>(key: string, value: T): Promise<void> {
        try {
            const jsonValue = JSON.stringify(value);
            const activeStorage = getStorageInstance();
            if (activeStorage) {
                activeStorage.set(key, jsonValue);
            } else {
                await AsyncStorage.setItem(key, jsonValue);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Error saving key "${key}":`, error);
            throw error;
        }
    },

    /**
     * Remove data
     */
    async remove(key: string): Promise<void> {
        try {
            const activeStorage = getStorageInstance();
            if (activeStorage) {
                activeStorage.delete(key);
            } else {
                await AsyncStorage.removeItem(key);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Error removing key "${key}":`, error);
        }
    },

    async clearAll(): Promise<void> {
        try {
            const activeStorage = getStorageInstance();
            if (activeStorage) {
                activeStorage.clearAll();
            } else {
                await AsyncStorage.clear();
            }
            console.log(`${LOG_PREFIX} All data cleared.`);
        } catch (error) {
            console.error(`${LOG_PREFIX} Error clearing all data:`, error);
        }
    }
};

// Onboarding helpers
const ONBOARDING_KEY = '@foodlens_onboarding_complete';
const ONBOARDING_KEY_BY_USER_PREFIX = '@foodlens_onboarding_complete:';

const onboardingKeyByUser = (userId: string) => `${ONBOARDING_KEY_BY_USER_PREFIX}${userId}`;

export const hasSeenOnboarding = async (userId?: string): Promise<boolean> => {
    if (!userId) {
        return SafeStorage.get<boolean>(ONBOARDING_KEY, false);
    }

    const scopedKey = onboardingKeyByUser(userId);
    const scopedSeen = await SafeStorage.get<boolean>(scopedKey, false);
    if (scopedSeen) return true;

    // Backward compatibility: migrate legacy global onboarding flag once.
    const legacySeen = await SafeStorage.get<boolean>(ONBOARDING_KEY, false);
    if (!legacySeen) return false;

    await SafeStorage.set(scopedKey, true);
    await SafeStorage.remove(ONBOARDING_KEY);
    return true;
};

export const setOnboardingComplete = async (userId?: string): Promise<void> => {
    if (!userId) {
        await SafeStorage.set(ONBOARDING_KEY, true);
        return;
    }

    await SafeStorage.set(onboardingKeyByUser(userId), true);
};
