import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import type { UserProfileUpdateReason } from '@/services/user/userProfileStore';

const shouldRefreshTravelerAllergens = (reason: UserProfileUpdateReason): boolean => {
  return reason !== 'client_state_write';
};

export const useTravelerAllergens = () => {
  const [allergens, setAllergens] = useState<string[]>([]);

  useEffect(() => {
    const userId = getCurrentUserIdSnapshot();
    if (!userId || userId === 'auth-required') {
      setAllergens([]);
      return;
    }

    let active = true;
    const syncAllergens = async () => {
      try {
        const profile = await UserService.getUserProfile(userId, { allowBackgroundRefresh: false });
        if (!active || !profile) return;
        setAllergens([...profile.safetyProfile.allergies, ...profile.safetyProfile.dietaryRestrictions]);
      } catch (error) {
        if (!active) return;
        console.warn(error);
      }
    };

    void syncAllergens();
    const unsubscribe = subscribeUserProfileUpdated(userId, (reason) => {
      if (!shouldRefreshTravelerAllergens(reason)) {
        return;
      }

      void syncAllergens();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return allergens;
};
