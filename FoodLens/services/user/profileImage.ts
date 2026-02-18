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
  const imageUri = profile.profileImage || '';
  const isFilePathLike = imageUri.startsWith('file://') || imageUri.startsWith('/');
  const isPhotoLibraryUri = imageUri.startsWith('ph://') || imageUri.startsWith('assets-library://');

  if (isFilePathLike) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(imageUri);
      if (!fileInfo.exists) {
        console.warn('[UserService] Saved profile image file does not exist. Resetting.');
        isValidImage = false;
      }
    } catch (error) {
      console.warn('Failed to validate local image file', error);
      isValidImage = false;
    }
  } else if (isPhotoLibraryUri) {
    // iOS photo-library URIs are not regular file paths and cannot be validated via getInfoAsync.
    // Keep as valid to avoid unintended profile image reset in release builds.
    isValidImage = true;
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
