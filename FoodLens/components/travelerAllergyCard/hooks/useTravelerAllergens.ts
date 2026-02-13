import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService';

const TEST_UID = 'test-user-v1';

export const useTravelerAllergens = () => {
  const [allergens, setAllergens] = useState<string[]>([]);

  useEffect(() => {
    UserService.getUserProfile(TEST_UID)
      .then((profile) => {
        if (!profile) return;
        setAllergens([...profile.safetyProfile.allergies, ...profile.safetyProfile.dietaryRestrictions]);
      })
      .catch((error) => console.warn(error));
  }, []);

  return allergens;
};
