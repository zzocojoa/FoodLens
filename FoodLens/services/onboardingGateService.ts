import { hasSeenOnboarding, setOnboardingComplete } from './storage';
import { Phase2Api, Phase2SyncApiError } from './sync/phase2Api';
import type {
  MeAllergiesResponse,
  MeProfileResponse,
  MeSettingsResponse,
} from './sync/phase2Sync.types';

const onboardingGateInFlight = new Map<string, Promise<boolean>>();

const hasProfileEvidence = (profile: MeProfileResponse): boolean => {
  if (typeof profile.birth_year === 'number' && Number.isFinite(profile.birth_year)) return true;
  if (typeof profile.gender === 'string' && profile.gender.trim().length > 0) return true;
  if (Array.isArray(profile.disliked_ingredients) && profile.disliked_ingredients.length > 0) return true;
  if (typeof profile.current_trip_start === 'string' && profile.current_trip_start.trim().length > 0) return true;
  if (typeof profile.current_trip_location === 'string' && profile.current_trip_location.trim().length > 0) return true;
  if (
    profile.current_trip_coordinates &&
    typeof profile.current_trip_coordinates.latitude === 'number' &&
    typeof profile.current_trip_coordinates.longitude === 'number'
  ) {
    return true;
  }
  return false;
};

const hasAllergyEvidence = (allergies: MeAllergiesResponse): boolean => {
  if (Array.isArray(allergies.allergies) && allergies.allergies.length > 0) return true;
  if (Array.isArray(allergies.dietary_restrictions) && allergies.dietary_restrictions.length > 0) return true;
  if (allergies.severity_map && Object.keys(allergies.severity_map).length > 0) return true;
  return false;
};

const hasSettingsEvidence = (settings: MeSettingsResponse): boolean => {
  if (settings.auto_play_audio === true) return true;
  if (typeof settings.selected_emoji === 'string' && settings.selected_emoji.trim().length > 0) return true;
  if (typeof settings.target_language === 'string' && settings.target_language.trim().length > 0) return true;
  if (typeof settings.language === 'string') {
    const normalized = settings.language.trim().toLowerCase();
    if (normalized.length > 0 && normalized !== 'auto') return true;
  }
  return false;
};

const hasHistoryEvidence = async (): Promise<boolean> => {
  try {
    const history = await Phase2Api.getHistory(1);
    return history.history.length > 0;
  } catch {
    return false;
  }
};

const resolveFromServer = async (userId: string): Promise<boolean> => {
  try {
    const [profileResult, allergiesResult, settingsResult] = await Promise.all([
      Phase2Api.getProfile(),
      Phase2Api.getAllergies(),
      Phase2Api.getSettings(),
    ]);

    const completed =
      hasProfileEvidence(profileResult.profile) ||
      hasAllergyEvidence(allergiesResult.allergies) ||
      hasSettingsEvidence(settingsResult.settings) ||
      (await hasHistoryEvidence());

    if (completed) {
      await setOnboardingComplete(userId);
    }
    return completed;
  } catch (error) {
    if (error instanceof Phase2SyncApiError && error.code === 'AUTH_SESSION_REQUIRED') {
      return false;
    }
    return false;
  }
};

export const hasCompletedOnboarding = async (userId: string): Promise<boolean> => {
  if (!userId || userId.trim().length === 0) return false;

  const localSeen = await hasSeenOnboarding(userId);
  if (localSeen) return true;

  const normalizedUserId = userId.trim();
  const inFlight = onboardingGateInFlight.get(normalizedUserId);
  if (inFlight) return inFlight;

  const request = resolveFromServer(normalizedUserId).finally(() => {
    onboardingGateInFlight.delete(normalizedUserId);
  });
  onboardingGateInFlight.set(normalizedUserId, request);
  return request;
};
