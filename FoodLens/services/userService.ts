import { UserProfile, DEFAULT_USER_PROFILE } from '../models/User';
import { SafeStorage } from './storage'; // NEW

const USER_STORAGE_KEY = '@foodlens_user_profile';

export const UserService = {
  /**
   * Get user profile from local storage
   */
  async getUserProfile(uid: string): Promise<UserProfile> {
    // SafeStorage handles try-catch and JSON parsing internally
    const profile = await SafeStorage.get<UserProfile | null>(USER_STORAGE_KEY, null);

    if (profile) {
      return profile;
    }

    // Fallback: Default Object Pattern
    // Ensures UI never crashes due to null profile
    return {
        ...DEFAULT_USER_PROFILE,
        uid: uid || "guest-user",
        email: "guest@foodlens.ai",
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
