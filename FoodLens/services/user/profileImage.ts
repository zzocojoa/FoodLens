import * as FileSystem from 'expo-file-system/legacy';
import { resolveImageUri } from '../imageStorage';
import { SafeStorage } from '../storage';
import { USER_STORAGE_KEY } from './constants';
import { pickRandomAvatar } from './profileFactory';
import { UserProfile } from '../../models/User';

export const resolveAndValidateProfileImage = async (
  profile: UserProfile,
): Promise<{ profile: UserProfile; isValidImage: boolean }> => {
  const resolvedImage = resolveImageUri(profile.profileImage);
  if (resolvedImage) {
    profile.profileImage = resolvedImage;
  }

  let isValidImage = true;
  if (profile.profileImage?.startsWith('file://')) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(profile.profileImage);
      if (!fileInfo.exists) {
        console.warn('[UserService] Saved profile image file does not exist. Resetting.');
        isValidImage = false;
      }
    } catch (error) {
      console.warn('Failed to validate local image file', error);
      isValidImage = false;
    }
  }

  return { profile, isValidImage };
};

export const ensureProfileImageExists = async (uid: string, profile: UserProfile): Promise<UserProfile> => {
  if (profile.profileImage && profile.profileImage.trim() !== '') {
    return profile;
  }

  console.log('[UserService] Image missing or invalid. Starting migration...');
  try {
    profile.profileImage = pickRandomAvatar();
    await SafeStorage.set(USER_STORAGE_KEY, profile);
    console.log(`[Migration] Auto-assigned avatar for user ${uid}: ${profile.profileImage}`);
  } catch (error) {
    console.warn('[Migration] Failed to persist auto-assigned avatar:', error);
  }

  return profile;
};

