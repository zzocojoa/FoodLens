import { useEffect, useState } from 'react';
import { UserService } from '@/services/userService_Logic';
import { getCurrentUserId } from '@/services/auth/currentUser_Logic';

export const useTravelerAllergens = () => {
  const [allergens, setAllergens] = useState<string[]>([]);

  useEffect(() => {
    UserService.getUserProfile(getCurrentUserId())
      .then((profile) => {
        if (!profile) return;
        setAllergens([...profile.safetyProfile.allergies, ...profile.safetyProfile.dietaryRestrictions]);
      })
      .catch((error) => console.warn(error));
  }, []);

  return allergens;
};
