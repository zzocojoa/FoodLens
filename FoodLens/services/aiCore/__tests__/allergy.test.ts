import { getAllergyString } from '../allergy';

const mockGetUserProfile = jest.fn();

jest.mock('@/services/userService', () => ({
  UserService: {
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
  },
}));

jest.mock('../constants', () => ({
  getAiUserId: () => 'usr_ai',
}));

describe('getAllergyString', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses default labels for canonical ingredient values before AI analysis', async () => {
    mockGetUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['peanut'],
        dietaryRestrictions: ['peach', 'gluten_free'],
      },
    });

    await expect(getAllergyString()).resolves.toBe('Peanut, Peach, Gluten Free');
  });

  it('projects canonical allergy keys and custom text into one AI-readable string', async () => {
    mockGetUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['peach'],
        dietaryRestrictions: ['custom:my custom restriction'],
      },
    });

    await expect(getAllergyString()).resolves.toBe('Peach, my custom restriction');
  });
});
