import AsyncStorage from '@react-native-async-storage/async-storage';

const LOG_PREFIX = '[SafeStorage]';

const logParseError = (key: string, error: unknown): void => {
  console.error(`${LOG_PREFIX} Error parsing key "${key}":`, error);
};

const logClearError = (key: string, error: unknown): void => {
  console.error(`${LOG_PREFIX} Failed to clear key "${key}":`, error);
};

const parseStoredValue = <T>(jsonValue: string | null, fallback: T): T => {
  if (jsonValue === null) return fallback;
  return JSON.parse(jsonValue) as T;
};

/**
 * Safe Storage Wrapper
 * Handles JSON parsing errors gracefully and ensures type safety.
 * Implements "Self-healing" by clearing corrupted data.
 */
export const SafeStorage = {
    /**
     * Get and parse JSON data safely
     * @param key Storage Key
     * @param fallback Default value if key is missing or parsing fails
     */
    async get<T>(key: string, fallback: T): Promise<T> {
        try {
            const jsonValue = await AsyncStorage.getItem(key);
            return parseStoredValue(jsonValue, fallback);
        } catch (error) {
            logParseError(key, error);
            // Self-healing: Remove corrupted data so app can recover on next launch/save
            try {
                await AsyncStorage.removeItem(key);
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
            await AsyncStorage.setItem(key, jsonValue);
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
            await AsyncStorage.removeItem(key);
        } catch (error) {
            console.error(`${LOG_PREFIX} Error removing key "${key}":`, error);
        }
    }
};
