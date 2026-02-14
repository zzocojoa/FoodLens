import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService';
import { CURRENT_USER_ID } from '@/services/auth/currentUser';

const TEST_UID = CURRENT_USER_ID;

export const useTravelerCardTargetLanguage = () => {
  const [targetLanguage, setTargetLanguage] = useState<string | undefined>(undefined);

  useEffect(() => {
    UserService.getUserProfile(TEST_UID)
      .then((profile) => {
        if (!profile) return;
        setTargetLanguage(profile.settings?.targetLanguage);
      })
      .catch((error) => console.warn(error));
  }, []);

  return targetLanguage;
};
