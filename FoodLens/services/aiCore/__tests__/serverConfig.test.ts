jest.mock('@/services/storage', () => ({
    SafeStorage: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
    },
}));

import { SafeStorage } from '@/services/storage';
import { STORAGE_KEY } from '../constants';
import { ServerConfig } from '../serverConfig';

const mockedSafeStorage = SafeStorage as jest.Mocked<typeof SafeStorage>;

describe('ServerConfig', () => {
    const originalEnv = process.env;
    const originalDevFlag = (globalThis as { __DEV__?: boolean }).__DEV__;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        delete process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'];
        (globalThis as { __DEV__?: boolean }).__DEV__ = true;
        mockedSafeStorage.get.mockResolvedValue(undefined as never);
        mockedSafeStorage.set.mockResolvedValue(undefined);
        mockedSafeStorage.remove.mockResolvedValue(undefined);
    });

    afterAll(() => {
        process.env = originalEnv;
        (globalThis as { __DEV__?: boolean }).__DEV__ = originalDevFlag;
    });

    it('uses the normalized analysis server env when present', async () => {
        process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';

        const result = await ServerConfig.getServerUrl();

        expect(result).toBe('https://api.foodlens.example.com');
        expect(mockedSafeStorage.get).not.toHaveBeenCalled();
    });

    it('uses the analysis server env outside development runtime', async () => {
        (globalThis as { __DEV__?: boolean }).__DEV__ = false;
        process.env['EXPO_PUBLIC_ANALYSIS_SERVER_URL'] = 'https://api.foodlens.example.com/';

        const result = await ServerConfig.getServerUrl();

        expect(result).toBe('https://api.foodlens.example.com');
        expect(mockedSafeStorage.get).not.toHaveBeenCalled();
    });

    it('falls back to the normalized stored url when env is missing', async () => {
        mockedSafeStorage.get.mockResolvedValue('https://stored.foodlens.example.com///' as never);

        const result = await ServerConfig.getServerUrl();

        expect(result).toBe('https://stored.foodlens.example.com');
        expect(mockedSafeStorage.get).toHaveBeenCalledWith(STORAGE_KEY, undefined);
    });

    it('throws when env and stored url are both missing in development runtime', async () => {
        mockedSafeStorage.get.mockResolvedValue('   ' as never);

        await expect(ServerConfig.getServerUrl()).rejects.toThrow(
            'Missing FoodLens backend base URL',
        );
        expect(mockedSafeStorage.get).toHaveBeenCalledWith(STORAGE_KEY, undefined);
    });

    it('throws when backend base url is missing outside development runtime', async () => {
        (globalThis as { __DEV__?: boolean }).__DEV__ = false;
        mockedSafeStorage.get.mockResolvedValue('https://stored.foodlens.example.com///' as never);

        await expect(ServerConfig.getServerUrl()).rejects.toThrow(
            'Missing FoodLens backend base URL',
        );

        expect(mockedSafeStorage.get).not.toHaveBeenCalled();
    });

    it('stores a normalized custom server url', async () => {
        await ServerConfig.setServerUrl('https://custom.foodlens.example.com/');

        expect(mockedSafeStorage.set).toHaveBeenCalledWith(
            STORAGE_KEY,
            'https://custom.foodlens.example.com',
        );
        expect(mockedSafeStorage.remove).not.toHaveBeenCalled();
    });

    it('removes the stored url when the input is blank', async () => {
        await ServerConfig.setServerUrl('   ');

        expect(mockedSafeStorage.remove).toHaveBeenCalledWith(STORAGE_KEY);
        expect(mockedSafeStorage.set).not.toHaveBeenCalled();
    });

    it('clears custom server override attempts outside development runtime', async () => {
        (globalThis as { __DEV__?: boolean }).__DEV__ = false;

        await ServerConfig.setServerUrl('https://custom.foodlens.example.com/');

        expect(mockedSafeStorage.remove).toHaveBeenCalledWith(STORAGE_KEY);
        expect(mockedSafeStorage.set).not.toHaveBeenCalled();
    });
});
