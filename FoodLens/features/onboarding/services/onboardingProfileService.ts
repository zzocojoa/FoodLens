import { setOnboardingComplete } from '@/services/storage';
import { UserService } from '@/services/userService';
import { getCurrentUserId } from '@/services/auth/currentUser';
import {
  getI18nSnapshot,
  initializeI18nStore,
  setI18nSettings,
} from '@/features/i18n/services/i18nStore';
import {
  buildOnboardingCompletedPatch,
  updateUserClientState,
} from '@/services/user/clientStateService';
import type { CompletePayload } from '../types/onboarding.types';

const applyOnboardingTravelerLanguage = async (
  targetLanguage: CompletePayload['targetLanguage']
): Promise<void> => {
  if (!targetLanguage) {
    return;
  }

  await initializeI18nStore();
  await setI18nSettings({
    ...getI18nSnapshot().settings,
    targetLanguage,
  });
};

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
  await applyOnboardingTravelerLanguage(payload.targetLanguage);
  await updateUserClientState(
    currentUserId,
    buildOnboardingCompletedPatch(new Date().toISOString())
  );

  await setOnboardingComplete(currentUserId);
};
