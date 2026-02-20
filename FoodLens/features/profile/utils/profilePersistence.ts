import { UserService } from '@/services/userService';
import { TEST_EMAIL, getProfileUserId } from '../constants/profile.constants';
import { AllergySeverity } from '../types/profile.types';

export const loadTestUserProfile = () => UserService.getUserProfile(getProfileUserId());

export const saveTestUserProfile = async (
    allergies: string[],
    otherRestrictions: string[],
    severityMap: Record<string, AllergySeverity>,
) => {
    await UserService.CreateOrUpdateProfile(getProfileUserId(), TEST_EMAIL, {
        safetyProfile: {
            allergies,
            severityMap,
            dietaryRestrictions: otherRestrictions,
        },
        settings: {
            language: 'en',
            autoPlayAudio: false,
        },
    });
};
