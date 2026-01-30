import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { UserProfile, DEFAULT_USER_PROFILE } from '../models/User';

const COLLECTION_NAME = 'users';

export const UserService = {
  /**
   * Get user profile by UID
   */
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const docRef = doc(db, COLLECTION_NAME, uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data() as UserProfile;
      } else {
        return null;
      }
    } catch (error) {
      console.error("Error getting user profile:", error);
      throw error;
    }
  },

  /**
   * Create or overwrite user profile
   */
  async CreateOrUpdateProfile(uid: string, email: string, profileData: Partial<UserProfile> = {}) {
    try {
      const docRef = doc(db, COLLECTION_NAME, uid);
      const now = new Date().toISOString();

      // Check if exists
      const exists = await this.getUserProfile(uid);

      if (!exists) {
        // Create new
        const newProfile: UserProfile = {
            ...DEFAULT_USER_PROFILE,
            uid,
            email,
            createdAt: now,
            updatedAt: now,
            ...profileData,
            safetyProfile: {
                ...DEFAULT_USER_PROFILE.safetyProfile,
                ...(profileData.safetyProfile || {})
            },
            settings: {
                ...DEFAULT_USER_PROFILE.settings,
                ...(profileData.settings || {})
            }
        };
        await setDoc(docRef, newProfile);
        return newProfile;
      } else {
        // Update existing
        const updatePayload = {
            ...profileData,
            updatedAt: now
        };
        await updateDoc(docRef, updatePayload);
        return { ...exists, ...updatePayload };
      }
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
  }
};
