import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';

const LOG_PREFIX = '[SafeStorage]';
const MIGRATION_KEY = 'foodlens_storage_migrated_v1';

// Initialize MMKV instance with fallback detection
let storageInstance: MMKV | null = null;
try {
  // MMKV will throw an error if Remote Debugging is enabled
  storageInstance = new MMKV();
} catch (e) {
  console.warn(`${LOG_PREFIX} MMKV initialization failed. Falling back to AsyncStorage (Internal mode). This usually happens if Remote Debugging is enabled.`);
}

export const storage = storageInstance;

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
        if (!storage) return; // MMKV not available (Debugger mode)
        
        const isMigrated = storage.getBoolean(MIGRATION_KEY);
        if (isMigrated) return;

        console.log(`${LOG_PREFIX} Starting migration from AsyncStorage...`);
        const keys = await AsyncStorage.getAllKeys();
        
        if (keys.length > 0) {
            const pairs = await AsyncStorage.multiGet(keys);
            for (const [key, value] of pairs) {
                if (value !== null) {
                    storage.set(key, value);
                }
            }
        }

        storage.set(MIGRATION_KEY, true);
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
     * Get and parse JSON data safely
     * @param key Storage Key
     * @param fallback Default value if key is missing or parsing fails
     */
    async get<T>(key: string, fallback: T): Promise<T> {
        try {
            if (storage) {
                const jsonValue = storage.getString(key);
                return parseStoredValue(jsonValue, fallback);
            }
            // Fallback for Debugging Mode
            const asyncJson = await AsyncStorage.getItem(key);
            return parseStoredValue(asyncJson, fallback);
        } catch (error) {
            logParseError(key, error);
            // Self-healing: Remove corrupted data
            try {
                if (storage) {
                    storage.delete(key);
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
            if (storage) {
                storage.set(key, jsonValue);
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
            if (storage) {
                storage.delete(key);
            } else {
                await AsyncStorage.removeItem(key);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} Error removing key "${key}":`, error);
        }
    },

    async clearAll(): Promise<void> {
        try {
            if (storage) {
                storage.clearAll();
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
