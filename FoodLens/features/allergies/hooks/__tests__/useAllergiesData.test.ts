/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { UserService } from '../../../../services/userService';
import { SafeStorage } from '../../../../services/storage';
import { useAllergiesData } from '../useAllergiesData';

let mockedFocusEffectCallback: (() => void | (() => void)) | null = null;
const mockSubscribeUserProfileUpdated = jest.fn();

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: (callback: () => void | (() => void)) => {
        mockedFocusEffectCallback = callback;
    },
    useIsFocused: () => true,
}));

jest.mock('../../constants/allergies.constants', () => ({
    getAllergiesUserId: () => 'test-user-v1',
}));

jest.mock('../../../../services/storage', () => ({
    SafeStorage: {
        getSync: jest.fn(),
    },
}));

jest.mock('../../../../services/user/constants', () => ({
    getUserStorageKey: (userId: string) => `@foodlens_user_profile:${userId}`,
}));

jest.mock('@/services/user/userProfileStore', () => ({
    subscribeUserProfileUpdated: (...args: unknown[]) => mockSubscribeUserProfileUpdated(...args),
}));

jest.mock('../../../../services/userService', () => ({
    UserService: {
        getUserProfile: jest.fn(),
    },
}));

describe('useAllergiesData', () => {
    const mockedGetUserProfile = UserService.getUserProfile as jest.MockedFunction<
        typeof UserService.getUserProfile
    >;
    const mockedGetSync = SafeStorage.getSync as jest.MockedFunction<typeof SafeStorage.getSync>;

    beforeEach(() => {
        mockedFocusEffectCallback = null;
        mockedGetSync.mockReturnValue(null);
        mockSubscribeUserProfileUpdated.mockReturnValue(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    test('loads allergies and ignores dietary restrictions', async () => {
        mockedGetUserProfile.mockResolvedValue({
            uid: 'test-user-v1',
            email: 'test@foodlens.ai',
            safetyProfile: {
                allergies: ['Peanuts'],
                dietaryRestrictions: ['Vegan'],
            },
            settings: {
                language: 'ko',
                autoPlayAudio: false,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        const { result } = renderHook(() => useAllergiesData());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.allergies).toEqual(['Peanuts']);
        expect(result.current.dietaryRestrictions).toEqual([]);
        expect(result.current.severityMap).toEqual({});
        expect(mockedGetUserProfile).toHaveBeenCalledWith('test-user-v1', {
            allowBackgroundRefresh: false,
        });
    });

    test('hydrates from cached snapshot before background refresh completes', async () => {
        mockedGetSync.mockReturnValue({
            uid: 'test-user-v1',
            email: 'cached@foodlens.ai',
            safetyProfile: {
                allergies: ['Milk'],
                dietaryRestrictions: ['Vegetarian'],
                severityMap: { Milk: 'moderate' },
            },
            settings: {
                language: 'ko',
                autoPlayAudio: false,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        } as never);
        mockedGetUserProfile.mockImplementation(
            async () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            uid: 'test-user-v1',
                            email: 'fresh@foodlens.ai',
                            safetyProfile: {
                                allergies: ['Milk', 'Peanuts'],
                                dietaryRestrictions: ['Vegetarian'],
                                severityMap: { Milk: 'moderate', Peanuts: 'severe' },
                            },
                            settings: {
                                language: 'ko',
                                autoPlayAudio: false,
                            },
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        } as never);
                    }, 0);
                }),
        );

        const { result } = renderHook(() => useAllergiesData());

        expect(result.current.loading).toBe(false);
        expect(result.current.allergies).toEqual(['Milk']);
        expect(result.current.dietaryRestrictions).toEqual([]);
        expect(result.current.severityMap).toEqual({ Milk: 'moderate' });

        await waitFor(() => {
            expect(result.current.allergies).toEqual(['Milk', 'Peanuts']);
        });
    });

    test('skips duplicate first-focus refresh when initial load is already scheduled', async () => {
        jest.useFakeTimers();
        mockedGetUserProfile.mockImplementation(
            async () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            uid: 'test-user-v1',
                            email: 'test@foodlens.ai',
                            safetyProfile: {
                                allergies: ['Peanuts'],
                                dietaryRestrictions: [],
                                severityMap: {},
                            },
                            settings: {
                                language: 'ko',
                                autoPlayAudio: false,
                            },
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                        } as never);
                    }, 100);
                }),
        );

        renderHook(() => useAllergiesData());

        act(() => {
            mockedFocusEffectCallback?.();
        });

        expect(mockedGetUserProfile).toHaveBeenCalledTimes(1);
    });

    test('retries once after the skipped first-focus path when the initial load fails', async () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockedGetUserProfile
            .mockRejectedValueOnce(new Error('temporary read failure'))
            .mockResolvedValueOnce({
                uid: 'test-user-v1',
                email: 'test@foodlens.ai',
                safetyProfile: {
                    allergies: ['Peanuts'],
                    dietaryRestrictions: ['Vegan'],
                    severityMap: { Peanuts: 'severe' },
                },
                settings: {
                    language: 'ko',
                    autoPlayAudio: false,
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            } as never);

        const { result } = renderHook(() => useAllergiesData());

        act(() => {
            mockedFocusEffectCallback?.();
        });

        await waitFor(() => {
            expect(mockedGetUserProfile).toHaveBeenCalledTimes(2);
        });

        await waitFor(() => {
            expect(result.current.allergies).toEqual(['Peanuts']);
        });

        errorSpy.mockRestore();
    });

    test('returns empty list when loading fails', async () => {
        mockedGetUserProfile.mockRejectedValue(new Error('storage failed'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useAllergiesData());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.allergies).toEqual([]);
        expect(result.current.dietaryRestrictions).toEqual([]);
        expect(result.current.severityMap).toEqual({});
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
    });

    test('ignores client_state_write profile updates', async () => {
        jest.useFakeTimers();
        let listener: ((reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write') => void) | null =
            null;
        mockSubscribeUserProfileUpdated.mockImplementation(
            (_userId: string, callback: typeof listener) => {
                listener = callback;
                return jest.fn();
            },
        );
        mockedGetUserProfile.mockResolvedValue({
            uid: 'test-user-v1',
            email: 'test@foodlens.ai',
            safetyProfile: {
                allergies: ['Peanuts'],
                dietaryRestrictions: [],
                severityMap: {},
            },
            settings: {
                language: 'ko',
                autoPlayAudio: false,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        renderHook(() => useAllergiesData());

        await waitFor(() => {
            expect(mockedGetUserProfile).toHaveBeenCalledTimes(1);
        });

        act(() => {
            listener?.('client_state_write');
            jest.advanceTimersByTime(250);
        });

        expect(mockedGetUserProfile).toHaveBeenCalledTimes(1);
    });
});
