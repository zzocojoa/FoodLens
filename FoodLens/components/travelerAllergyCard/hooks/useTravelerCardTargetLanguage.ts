import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService_Logic';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser_Logic';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore_Logic';

export const useTravelerCardTargetLanguage = () => {
  const [targetLanguage, setTargetLanguage] = useState<string | undefined>(undefined);

  useEffect(() => {
    const userId = getCurrentUserIdSnapshot();
    if (!userId || userId === 'auth-required') {
      setTargetLanguage(undefined);
      return;
    }

    let active = true;
    const syncTargetLanguage = async () => {
      try {
        const profile = await UserService.getUserProfile(userId, { allowBackgroundRefresh: false });
        if (!active || !profile) return;
        setTargetLanguage(profile.settings?.targetLanguage);
      } catch (error) {
        if (!active) return;
        console.warn(error);
      }
    };

    void syncTargetLanguage();
    const unsubscribe = subscribeUserProfileUpdated(userId, () => {
      void syncTargetLanguage();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return targetLanguage;
};
