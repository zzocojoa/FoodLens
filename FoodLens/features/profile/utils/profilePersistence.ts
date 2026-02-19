import { UserService } from '@/services/userService';
import { TEST_EMAIL, getProfileUserId } from '../constants/profile.constants';

export const loadTestUserProfile = () => UserService.getUserProfile(getProfileUserId());

export const saveTestUserProfile = async (allergies: string[], otherRestrictions: string[]) => {
    await UserService.CreateOrUpdateProfile(getProfileUserId(), TEST_EMAIL, {
        safetyProfile: {
            allergies,
            dietaryRestrictions: otherRestrictions,
        },
        settings: {
            language: 'en',
            autoPlayAudio: false,
        },
    });
};
