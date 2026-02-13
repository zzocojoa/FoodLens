import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService';

const TEST_UID = 'test-user-v1';

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
