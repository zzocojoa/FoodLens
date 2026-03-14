import { setOnboardingComplete } from '@/services/storage';
import { UserService } from '@/services/userService';
import { getCurrentUserId } from '@/services/auth/currentUser';
import type { CompletePayload } from '../types/onboarding.types';

export const completeOnboardingProfile = async (payload: CompletePayload): Promise<void> => {
  const currentUserId = getCurrentUserId();
  // Keep backward compatibility: safety profile stores allergies as string[].
  await UserService.CreateOrUpdateProfile(currentUserId, '', {
    gender: payload.gender || undefined,
    birthYear: payload.birthDate.getFullYear(),
    safetyProfile: {
      allergies: payload.selectedAllergies,
      severityMap: payload.severityMap,
      dietaryRestrictions: [],
    },
  });

  await setOnboardingComplete(currentUserId);
};
