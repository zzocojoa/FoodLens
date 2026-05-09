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

  it('uses default labels for allergy ingredient values before AI analysis', async () => {
    mockGetUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['peanut'],
        dietaryRestrictions: ['peach', 'gluten_free'],
      },
    });

    await expect(getAllergyString()).resolves.toBe('Peanut');
  });

  it('projects canonical allergy keys and custom text into one AI-readable string', async () => {
    mockGetUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['peach', 'custom:my custom allergy'],
        dietaryRestrictions: ['custom:my custom restriction'],
      },
    });

    await expect(getAllergyString()).resolves.toBe('Peach, my custom allergy');
  });

  it('ignores dietary restriction storage tokens when building the AI allergy string', async () => {
    mockGetUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: ['peanut'],
        dietaryRestrictions: ['vegan', 'custom:no nightshades'],
        severityMap: {
          peanut: 'severe',
          vegan: 'mild',
          'custom:no nightshades': 'moderate',
        },
      },
    });

    const allergyString = await getAllergyString();

    expect(allergyString).toBe('Peanut');
    expect(allergyString).not.toContain('custom:');
  });

  it('returns None only after a profile loads with no allergies', async () => {
    mockGetUserProfile.mockResolvedValue({
      safetyProfile: {
        allergies: [],
        dietaryRestrictions: [],
      },
    });

    await expect(getAllergyString()).resolves.toBe('None');
  });

  it('fails closed when the profile cannot be loaded', async () => {
    mockGetUserProfile.mockRejectedValue(new Error('profile storage unavailable'));

    await expect(getAllergyString()).rejects.toThrow('profile storage unavailable');
  });
});
