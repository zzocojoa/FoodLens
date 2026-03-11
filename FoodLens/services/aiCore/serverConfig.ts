import { SafeStorage } from '@/services/storage';
import { DEFAULT_SERVER_URL, STORAGE_KEY } from './constants';

export const ServerConfig = {
    getServerUrl: async (): Promise<string> => {
        const envUrl = process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'];
        if (envUrl) return envUrl;

        const stored = await SafeStorage.get<string>(STORAGE_KEY, DEFAULT_SERVER_URL);
        return stored;
    },

    setServerUrl: async (url: string): Promise<void> => {
        try {
            if (!url) {
                await SafeStorage.remove(STORAGE_KEY);
            } else {
                const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                await SafeStorage.set(STORAGE_KEY, cleanUrl);
            }
        } catch (error) {
            console.error('Failed to save server URL', error);
        }
    },
};
