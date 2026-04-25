import { UserService } from '@/services/userService';
import { getRestrictionDefaultLabel } from '@/features/profile/utils/profileSuggestions';
import { getAiUserId } from './constants';

const projectAllergyItemForAi = (value: string): string => {
    return getRestrictionDefaultLabel(value);
};

export const getAllergyString = async (): Promise<string> => {
    let allergyString = 'None';

    try {
        const user = await UserService.getUserProfile(getAiUserId());
        if (user) {
            const items = [...user.safetyProfile.allergies, ...user.safetyProfile.dietaryRestrictions]
                .map((item) => projectAllergyItemForAi(item));
            if (items.length > 0) {
                allergyString = items.join(', ');
            }
        }
    } catch (error) {
        console.warn('Could not load user profile for analysis:', error);
    }

    return allergyString;
};
