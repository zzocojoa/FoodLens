import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService';
import { CURRENT_USER_ID } from '@/services/auth/currentUser';

const TEST_UID = CURRENT_USER_ID;

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
