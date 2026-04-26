import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { TravelerAllergensProvider, useTravelerAllergens } from '../useTravelerAllergens';
import { UserService } from '@/services/userService';

const mockGetCurrentUserIdSnapshot = jest.fn();
const mockSubscribeUserProfileUpdated = jest.fn();

type ProfileUpdateListener = (
  reason: 'local_write' | 'server_pull' | 'sync_apply' | 'client_state_write'
) => void;

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserIdSnapshot: (...args: unknown[]) => mockGetCurrentUserIdSnapshot(...args),
}));

jest.mock('@/services/user/userProfileStore', () => ({
  subscribeUserProfileUpdated: (...args: unknown[]) => mockSubscribeUserProfileUpdated(...args),
}));

jest.mock('@/services/userService', () => ({
  UserService: {
    getUserProfile: jest.fn(),
  },
}));

describe('useTravelerAllergens', () => {
  const mockGetUserProfile = UserService.getUserProfile as jest.MockedFunction<typeof UserService.getUserProfile>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserIdSnapshot.mockReturnValue('usr_traveler');
    mockSubscribeUserProfileUpdated.mockReturnValue(() => {});
    mockGetUserProfile.mockResolvedValue({
      uid: 'usr_traveler',
      email: 'traveler@foodlens.ai',
      safetyProfile: {
        allergies: ['Peanut'],
        dietaryRestrictions: ['Vegan'],
        dislikedIngredients: [],
        severityMap: {},
      },
      settings: {
        language: 'en',
        autoPlayAudio: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as never);
  });

  it('ignores client_state_write updates', async () => {
    let listener: ProfileUpdateListener | null = null;
    mockSubscribeUserProfileUpdated.mockImplementation((_userId: string, callback: ProfileUpdateListener) => {
      listener = callback;
      return jest.fn();
    });

    const { result } = renderHook(() => useTravelerAllergens());

    await waitFor(() => {
      expect(result.current).toEqual(['Peanut']);
    });

    expect(mockGetUserProfile).toHaveBeenCalledTimes(1);

    const invokeListener = (
      reason: Parameters<ProfileUpdateListener>[0]
    ): void => {
      if (listener === null) {
        throw new Error('Expected profile update listener to be registered');
      }

      (listener as ProfileUpdateListener)(reason);
    };

    invokeListener('client_state_write');

    await waitFor(() => {
      expect(mockGetUserProfile).toHaveBeenCalledTimes(1);
    });

    invokeListener('sync_apply');

    await waitFor(() => {
      expect(mockGetUserProfile).toHaveBeenCalledTimes(2);
    });
  });

  it('uses provided allergens without loading the profile', () => {
    const wrapper = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
      React.createElement(
        TravelerAllergensProvider,
        { allergens: ['Shellfish', 'Halal'] },
        children
      )
    );

    const { result } = renderHook(() => useTravelerAllergens(), { wrapper });

    expect(result.current).toEqual(['Shellfish', 'Halal']);
    expect(mockGetCurrentUserIdSnapshot).not.toHaveBeenCalled();
    expect(mockGetUserProfile).not.toHaveBeenCalled();
    expect(mockSubscribeUserProfileUpdated).not.toHaveBeenCalled();
  });
});
