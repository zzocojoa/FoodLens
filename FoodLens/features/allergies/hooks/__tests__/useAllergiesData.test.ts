/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';
import { UserService } from '../../../../services/userService';
import { useAllergiesData } from '../useAllergiesData';

jest.mock('../../../../services/userService', () => ({
    UserService: {
        getUserProfile: jest.fn(),
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

        expect(result.current.allergies).toEqual(['Peanuts', 'Vegan']);
        expect(mockedGetUserProfile).toHaveBeenCalledWith('test-user-v1');
    });

    test('returns empty list when loading fails', async () => {
        mockedGetUserProfile.mockRejectedValue(new Error('storage failed'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const { result } = renderHook(() => useAllergiesData());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.allergies).toEqual([]);
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
    });
});

