import type { UserProfile } from '@/models/User';
import { ensureProfileImageExists } from '../profileImage';

const mockSafeStorageSet = jest.fn();
const mockPickRandomAvatar = jest.fn();
const mockGetUserStorageKey = jest.fn();

jest.mock('../../storage', () => ({
  SafeStorage: {
    set: (...args: unknown[]) => mockSafeStorageSet(...args),
  },
}));

jest.mock('../constants', () => ({
  getUserStorageKey: (...args: unknown[]) => mockGetUserStorageKey(...args),
}));

jest.mock('../profileFactory', () => ({
  pickRandomAvatar: (...args: unknown[]) => mockPickRandomAvatar(...args),
}));

jest.mock('../../imageStorage', () => ({
  resolveImageUri: (value: string) => value,
}));

const buildProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'usr_profile',
  email: 'user@example.com',
  name: 'Tester',
  safetyProfile: {
    allergies: [],
    dietaryRestrictions: [],
    severityMap: {},
  },
  settings: {
    language: 'auto',
    autoPlayAudio: false,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('ensureProfileImageExists', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickRandomAvatar.mockReturnValue('https://api.dicebear.com/7.x/avataaars/png?seed=Fallback');
    mockGetUserStorageKey.mockImplementation((uid: string) => `@foodlens_user_profile:${uid}`);
  });

  it('does not replace asset-backed profile with random avatar', async () => {
    const profile = buildProfile({
      profileImage: '',
      profileImageAssetId: 'asset_profile_1',
    });

    const result = await ensureProfileImageExists('usr_profile', profile);

    expect(result.profileImage).toBe('');
    expect(mockPickRandomAvatar).not.toHaveBeenCalled();
    expect(mockSafeStorageSet).not.toHaveBeenCalled();
  });

  it('assigns random avatar only when image and asset id are both missing', async () => {
    const profile = buildProfile({
      profileImage: '',
      profileImageAssetId: undefined,
    });

    const result = await ensureProfileImageExists('usr_profile', profile);

    expect(result.profileImage).toBe('https://api.dicebear.com/7.x/avataaars/png?seed=Fallback');
    expect(mockPickRandomAvatar).toHaveBeenCalledTimes(1);
    expect(mockSafeStorageSet).toHaveBeenCalledWith('@foodlens_user_profile:usr_profile', result);
  });
});
