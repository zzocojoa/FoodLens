import { UserService } from '@/services/userService_Logic';
import { getAiUserId } from './constants_Logic';

export const getAllergyString = async (): Promise<string> => {
    let allergyString = 'None';

    try {
        const user = await UserService.getUserProfile(getAiUserId());
        if (user) {
            const items = [...user.safetyProfile.allergies, ...user.safetyProfile.dietaryRestrictions];
            if (items.length > 0) {
                allergyString = items.join(', ');
            }
        }
    } catch (error) {
        console.warn('Could not load user profile for analysis:', error);
    }

    return allergyString;
};
