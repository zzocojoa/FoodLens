import { completeOnboardingProfile } from '../onboardingProfileService';

const mockSetOnboardingComplete = jest.fn();
const mockCreateOrUpdateProfile = jest.fn();
const mockGetCurrentUserId = jest.fn();
const mockBuildOnboardingCompletedPatch = jest.fn();
const mockUpdateUserClientState = jest.fn();

jest.mock('@/services/storage', () => ({
  setOnboardingComplete: (...args: unknown[]) => mockSetOnboardingComplete(...args),
}));

jest.mock('@/services/userService', () => ({
  UserService: {
    CreateOrUpdateProfile: (...args: unknown[]) => mockCreateOrUpdateProfile(...args),
  },
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserId: () => mockGetCurrentUserId(),
}));

jest.mock('@/services/user/clientStateService', () => ({
  buildOnboardingCompletedPatch: (...args: unknown[]) => mockBuildOnboardingCompletedPatch(...args),
  updateUserClientState: (...args: unknown[]) => mockUpdateUserClientState(...args),
}));

describe('completeOnboardingProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserId.mockReturnValue('usr_onboarding');
    mockCreateOrUpdateProfile.mockResolvedValue(undefined);
    mockBuildOnboardingCompletedPatch.mockReturnValue({ onboarding: { completedAt: 'now' } });
    mockUpdateUserClientState.mockResolvedValue(undefined);
    mockSetOnboardingComplete.mockResolvedValue(undefined);
  });

  it('persists safety passport destination and allergy profile without fake demographic fields', async () => {
    await completeOnboardingProfile({
      gender: null,
      birthDate: null,
      selectedAllergies: ['peanut', 'custom:no raw onion'],
      severityMap: {
        peanut: 'severe',
        'custom:no raw onion': 'moderate',
      },
      currentTripLocation: 'Japan',
      targetLanguage: 'ja-JP',
      currentTripStart: '2026-05-09T00:00:00.000Z',
    });

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith(
      'usr_onboarding',
      '',
      {
        currentTripLocation: 'Japan',
        currentTripStart: '2026-05-09T00:00:00.000Z',
        settings: {
          targetLanguage: 'ja-JP',
        },
        safetyProfile: {
          allergies: ['peanut', 'custom:no raw onion'],
          severityMap: {
            peanut: 'severe',
            'custom:no raw onion': 'moderate',
          },
          dietaryRestrictions: [],
        },
      }
    );
    expect(mockUpdateUserClientState).toHaveBeenCalledWith(
      'usr_onboarding',
      { onboarding: { completedAt: 'now' } }
    );
    expect(mockSetOnboardingComplete).toHaveBeenCalledWith('usr_onboarding');
  });
});
