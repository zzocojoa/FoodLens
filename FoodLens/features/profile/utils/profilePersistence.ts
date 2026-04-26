import { UserService } from '@/services/userService';
import { TEST_EMAIL, getProfileUserId } from '../constants/profile.constants';
import { AllergySeverity } from '../types/profile.types';

export const PROFILE_AUTH_REQUIRED_ERROR = 'PROFILE_AUTH_REQUIRED';

const isAuthenticatedProfileUserId = (userId: string): boolean =>
  userId.trim().length > 0 && userId !== 'auth-required';

export const loadTestUserProfile = () =>
  UserService.getUserProfile(getProfileUserId(), { allowBackgroundRefresh: false });

export const saveTestUserProfile = async (
    allergies: string[],
    otherRestrictions: string[],
    severityMap: Record<string, AllergySeverity>,
) => {
    const userId = getProfileUserId();
    if (!isAuthenticatedProfileUserId(userId)) {
        throw new Error(PROFILE_AUTH_REQUIRED_ERROR);
    }

    await UserService.CreateOrUpdateProfile(userId, TEST_EMAIL, {
        safetyProfile: {
            allergies,
            severityMap,
            dietaryRestrictions: otherRestrictions,
        },
    });
};
