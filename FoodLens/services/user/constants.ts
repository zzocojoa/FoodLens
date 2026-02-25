export const USER_STORAGE_KEY = '@foodlens_user_profile';

export const USER_STORAGE_KEY_PREFIX = '@foodlens_user_profile:';

export const getUserStorageKey = (userId: string): string => `${USER_STORAGE_KEY_PREFIX}${userId}`;
