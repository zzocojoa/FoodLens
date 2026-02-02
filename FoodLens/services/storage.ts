import AsyncStorage from '@react-native-async-storage/async-storage';

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
            if (jsonValue === null) {
                return fallback;
            }
            return JSON.parse(jsonValue) as T;
        } catch (error) {
            console.error(`[SafeStorage] Error parsing key "${key}":`, error);
            // Self-healing: Remove corrupted data so app can recover on next launch/save
            try {
                await AsyncStorage.removeItem(key);
                console.log(`[SafeStorage] Corrupted key "${key}" cleared.`);
            } catch (e) {
                console.error(`[SafeStorage] Failed to clear key "${key}":`, e);
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
            console.error(`[SafeStorage] Error saving key "${key}":`, error);
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
            console.error(`[SafeStorage] Error removing key "${key}":`, error);
        }
    }
};
