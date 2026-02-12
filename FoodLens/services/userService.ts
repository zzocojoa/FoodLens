import { UserProfile, DEFAULT_USER_PROFILE, DEFAULT_AVATARS } from '../models/User';
import { SafeStorage } from './storage'; 
import * as FileSystem from 'expo-file-system/legacy';
import { resolveImageUri } from './imageStorage';

const USER_STORAGE_KEY = '@foodlens_user_profile';

export const UserService = {
  /**
   * Get user profile from local storage
   */
  async getUserProfile(uid: string): Promise<UserProfile> {
    // SafeStorage handles try-catch and JSON parsing internally
    const profile = await SafeStorage.get<UserProfile | null>(USER_STORAGE_KEY, null);

    if (profile) {
      // Resolve image URI if it's a filename
      const resolvedImage = resolveImageUri(profile.profileImage);
      if (resolvedImage) {
          profile.profileImage = resolvedImage;
      }

      console.log(`[UserService] Loaded profile:`, { 
        uid: profile.uid, 
        hasImage: !!profile.profileImage, 
        imageLen: profile.profileImage?.length 
      });

      // VALIDATION: If it's a local file, check if it exists
      let isValidImage = true;
      if (profile.profileImage?.startsWith('file://')) {
          try {
              const fileInfo = await FileSystem.getInfoAsync(profile.profileImage);
              if (!fileInfo.exists) {
                  console.warn("[UserService] Saved profile image file does not exist. Resetting.");
                  isValidImage = false;
              }
          } catch (e) {
              console.warn("Failed to validate local image file", e);
              isValidImage = false;
          }
      }

      // Lazy Migration: If existing profile has no image OR INVALID image, assign one now
      if (!isValidImage || !profile.profileImage || profile.profileImage.trim() === '') {
          console.log("[UserService] Image missing or invalid. Starting migration...");
          try {
              // Guard against empty presets
              const avatars = DEFAULT_AVATARS.length > 0 ? DEFAULT_AVATARS : ["https://api.dicebear.com/7.x/avataaars/png?seed=Felix"];
              const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)];
              
              profile.profileImage = randomAvatar;

              // Persist the migration
              await SafeStorage.set(USER_STORAGE_KEY, profile);
              console.log(`[Migration] Auto-assigned avatar for user ${uid}: ${randomAvatar}`);
          } catch (error) {
              // Silent fail to keep app running
              console.warn("[Migration] Failed to persist auto-assigned avatar:", error);
          }
      } else {
        console.log("[UserService] Profile has valid image:", profile.profileImage);
      }
      return profile;
    }

    // Pick a random avatar from the presets
    const randomAvatar = DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];

    // Fallback: Default Object Pattern
    // Ensures UI never crashes due to null profile
    return {
        ...DEFAULT_USER_PROFILE,
        uid: uid || "guest-user",
        email: "guest@foodlens.ai",
        profileImage: randomAvatar,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
  },

  /**
   * Create or update user profile in local storage
   */
  async CreateOrUpdateProfile(uid: string, email: string, profileData: Partial<UserProfile> = {}) {
    try {
      const now = new Date().toISOString();
      // Reuse getUserProfile to check existence (it now always returns an object, so we check uid)
      // Actually, we need to know if it REALLY exists to decide "Create" vs "Update".
      // But since we merge, it effectively works as Upsert.
      
      // To strictly follow "Create or Update", lets just get the current reliable object
      const exists = await this.getUserProfile(uid);
      
      const isNew = exists.uid === "guest-user" && uid !== "guest-user"; // Heuristic for new profile

      const newProfile: UserProfile = {
          ...exists,
          uid, // Ensure UID is set
          email: email || exists.email,
          updatedAt: now,
          createdAt: isNew ? now : exists.createdAt,
          ...profileData,
          safetyProfile: {
            ...exists.safetyProfile,
            ...(profileData.safetyProfile || {})
          },
          settings: {
            ...exists.settings,
            ...(profileData.settings || {})
          }
      };

      await SafeStorage.set(USER_STORAGE_KEY, newProfile);
      return newProfile;
    } catch (error) {
      console.error("Error saving user profile:", error);
      throw error;
    }
  },
  
  /**
   * Update specific fields (e.g. allergies)
   */
  async updateSafetyProfile(uid: string, safetyProfile: UserProfile['safetyProfile']) {
    return this.CreateOrUpdateProfile(uid, "", { safetyProfile });
  },

  /**
   * General purpose partial update
   */
  async updateUserProfile(uid: string, updates: Partial<UserProfile>) {
    return this.CreateOrUpdateProfile(uid, "", updates);
  }
};
