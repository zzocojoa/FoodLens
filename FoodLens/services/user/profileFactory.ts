import { DEFAULT_AVATARS, DEFAULT_USER_PROFILE, UserProfile } from '../../models/User';

const FALLBACK_AVATAR = 'https://api.dicebear.com/7.x/avataaars/png?seed=Felix';

export const pickRandomAvatar = (): string => {
  const avatars = DEFAULT_AVATARS.length > 0 ? DEFAULT_AVATARS : [FALLBACK_AVATAR];
  return avatars[Math.floor(Math.random() * avatars.length)];
};

export const buildDefaultProfile = (uid: string): UserProfile => {
  return {
    ...DEFAULT_USER_PROFILE,
    uid: uid || 'guest-user',
    email: 'guest@foodlens.ai',
    profileImage: pickRandomAvatar(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

