import { SafeStorage } from '@/services/storage';
import {
    STORAGE_KEY,
    normalizeServerUrl,
    readExpoPublicAnalysisServerUrl,
} from './constants';

const MISSING_SERVER_URL_ERROR_MESSAGE =
    'Missing FoodLens backend base URL. Set EXPO_PUBLIC_ANALYSIS_SERVER_URL for release builds or save a development override.';

const isDevelopmentRuntime = (): boolean => {
    const runtime = globalThis as { __DEV__?: boolean };
    return runtime.__DEV__ === true;
};

const resolveStoredServerUrl = async (): Promise<string | undefined> => {
    if (!isDevelopmentRuntime()) {
        return undefined;
    }

    const storedValue = await SafeStorage.get<string | undefined>(STORAGE_KEY, undefined);
    return normalizeServerUrl(storedValue);
};

const createMissingServerUrlError = (): Error => new Error(MISSING_SERVER_URL_ERROR_MESSAGE);

const resolveConfiguredServerUrl = async (): Promise<string> => {
    const storedUrl = await resolveStoredServerUrl();
    if (storedUrl !== undefined) {
        return storedUrl;
    }

    throw createMissingServerUrlError();
};

export const ServerConfig = {
    getServerUrl: async (): Promise<string> => {
        const envUrl = readExpoPublicAnalysisServerUrl();
        if (envUrl !== undefined) {
            return envUrl;
        }

        return resolveConfiguredServerUrl();
    },

    setServerUrl: async (url: string): Promise<void> => {
        if (!isDevelopmentRuntime()) {
            await SafeStorage.remove(STORAGE_KEY);
            return;
        }

        const normalizedUrl = normalizeServerUrl(url);
        if (normalizedUrl === undefined) {
            await SafeStorage.remove(STORAGE_KEY);
            return;
        }

        await SafeStorage.set(STORAGE_KEY, normalizedUrl);
    },
};
