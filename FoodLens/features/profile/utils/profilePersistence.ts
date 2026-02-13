import { UserService } from '@/services/userService';
import { TEST_EMAIL, TEST_UID } from '../constants/profile.constants';

export const loadTestUserProfile = () => UserService.getUserProfile(TEST_UID);

export const saveTestUserProfile = async (allergies: string[], otherRestrictions: string[]) => {
    await UserService.CreateOrUpdateProfile(TEST_UID, TEST_EMAIL, {
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

