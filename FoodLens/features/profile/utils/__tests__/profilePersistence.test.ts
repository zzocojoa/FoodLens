import { PROFILE_AUTH_REQUIRED_ERROR, saveTestUserProfile } from '../profilePersistence';

const mockCreateOrUpdateProfile = jest.fn();
const mockGetProfileUserId = jest.fn(() => 'usr_profile');

jest.mock('@/services/userService', () => ({
  UserService: {
    CreateOrUpdateProfile: (...args: unknown[]) => mockCreateOrUpdateProfile(...args),
  },
}));

jest.mock('../../constants/profile.constants', () => ({
  TEST_EMAIL: 'test@foodlens.ai',
  getProfileUserId: () => mockGetProfileUserId(),
}));

describe('profilePersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProfileUserId.mockReturnValue('usr_profile');
    mockCreateOrUpdateProfile.mockResolvedValue(undefined);
  });

  it('does not overwrite language settings when saving profile restrictions', async () => {
    await saveTestUserProfile(['egg'], ['vegan', 'peach'], { egg: 'moderate' });

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith(
      'usr_profile',
      'test@foodlens.ai',
      {
        safetyProfile: {
          allergies: ['egg'],
          severityMap: { egg: 'moderate' },
          dietaryRestrictions: ['vegan', 'peach'],
        },
      }
    );
  });

  it('blocks profile writes before UserService when no authenticated user id is available', async () => {
    mockGetProfileUserId.mockReturnValue('auth-required');

    await expect(saveTestUserProfile(['egg'], [], { egg: 'moderate' })).rejects.toThrow(
      PROFILE_AUTH_REQUIRED_ERROR
    );

    expect(mockCreateOrUpdateProfile).not.toHaveBeenCalled();
  });
});
