import { setOnboardingComplete } from '@/services/storage';
import { UserService } from '@/services/userService';
import { getCurrentUserId } from '@/services/auth/currentUser';
import {
  buildOnboardingCompletedPatch,
  updateUserClientState,
} from '@/services/user/clientStateService';
import type { CompletePayload } from '../types/onboarding.types';

export const completeOnboardingProfile = async (payload: CompletePayload): Promise<void> => {
  const currentUserId = getCurrentUserId();
  const profilePatch = {
    ...(payload.gender ? { gender: payload.gender } : {}),
    ...(payload.birthDate ? { birthYear: payload.birthDate.getFullYear() } : {}),
    ...(payload.currentTripLocation ? { currentTripLocation: payload.currentTripLocation } : {}),
    ...(payload.currentTripStart ? { currentTripStart: payload.currentTripStart } : {}),
    ...(payload.targetLanguage ? { settings: { targetLanguage: payload.targetLanguage } } : {}),
    // 기존 호환성 유지: safety profile은 allergies를 string[]로 저장합니다.
    safetyProfile: {
      allergies: payload.selectedAllergies,
      severityMap: payload.severityMap,
      dietaryRestrictions: [],
    },
  };

  await UserService.CreateOrUpdateProfile(currentUserId, '', {
    ...profilePatch,
  });
  await updateUserClientState(
    currentUserId,
    buildOnboardingCompletedPatch(new Date().toISOString())
  );

  await setOnboardingComplete(currentUserId);
};
