/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';
import { UserService } from '../../../../services/userService';
import { useAllergiesData } from '../useAllergiesData';

jest.mock('@react-navigation/native', () => ({
    useFocusEffect: () => {},
}));

jest.mock('../../constants/allergies.constants', () => ({
    getAllergiesUserId: () => 'test-user-v1',
}));

jest.mock('@/services/user/userProfileStore', () => ({
    subscribeUserProfileUpdated: () => () => {},
}));

jest.mock('../../../../services/userService', () => ({
    UserService: {
        getUserProfile: jest.fn(),
    },
}));

jest.mock('@/services/logger', () => ({
    logger: {
        error: jest.fn(),
    },
}));

describe('useAllergiesData', () => {
    const mockedGetUserProfile = UserService.getUserProfile as jest.MockedFunction<
        typeof UserService.getUserProfile
    >;

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('loads and merges allergies + dietary restrictions', async () => {
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
        expect(result.current.dietaryRestrictions).toEqual(['Vegan']);
        expect(result.current.severityMap).toEqual({});
        expect(result.current.loadError).toBe(false);
        expect(mockedGetUserProfile).toHaveBeenCalledWith('test-user-v1', {
            allowBackgroundRefresh: false,
        });
    });

    test('marks load error when loading fails', async () => {
        mockedGetUserProfile.mockRejectedValue(new Error('storage failed'));

        const { result } = renderHook(() => useAllergiesData());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.allergies).toEqual([]);
        expect(result.current.dietaryRestrictions).toEqual([]);
        expect(result.current.severityMap).toEqual({});
        expect(result.current.loadError).toBe(true);
    });
});
