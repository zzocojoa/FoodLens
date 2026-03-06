import { saveTestUserProfile } from '../profilePersistence';

const mockCreateOrUpdateProfile = jest.fn();

jest.mock('@/services/userService_Logic', () => ({
  UserService: {
    CreateOrUpdateProfile: (...args: unknown[]) => mockCreateOrUpdateProfile(...args),
  },
}));

jest.mock('../../constants/profile.constants', () => ({
  TEST_EMAIL: 'test@foodlens.ai',
  getProfileUserId: () => 'usr_profile',
}));

describe('profilePersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateOrUpdateProfile.mockResolvedValue(undefined);
  });

  it('does not overwrite language settings when saving profile restrictions', async () => {
    await saveTestUserProfile(['egg'], ['vegan'], { egg: 'moderate' });

    expect(mockCreateOrUpdateProfile).toHaveBeenCalledWith(
      'usr_profile',
      'test@foodlens.ai',
      {
        safetyProfile: {
          allergies: ['egg'],
          severityMap: { egg: 'moderate' },
          dietaryRestrictions: ['vegan'],
        },
      }
    );
  });
});
