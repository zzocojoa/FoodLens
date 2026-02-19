import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService';
import { getCurrentUserId } from '@/services/auth/currentUser';

export const useTravelerCardTargetLanguage = () => {
  const [targetLanguage, setTargetLanguage] = useState<string | undefined>(undefined);

  useEffect(() => {
    UserService.getUserProfile(getCurrentUserId())
      .then((profile) => {
        if (!profile) return;
        setTargetLanguage(profile.settings?.targetLanguage);
      })
      .catch((error) => console.warn(error));
  }, []);

  return targetLanguage;
};
