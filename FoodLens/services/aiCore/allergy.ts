import { UserService } from '@/services/userService';
import { getRestrictionDefaultLabel } from '@/features/profile/utils/profileSuggestions';
import { getAiUserId } from './constants';

const projectAllergyItemForAi = (value: string): string => {
    return getRestrictionDefaultLabel(value);
};

export const getAllergyString = async (): Promise<string> => {
    const user = await UserService.getUserProfile(getAiUserId());
    const items = user.safetyProfile.allergies.map((item) => projectAllergyItemForAi(item));
    if (items.length > 0) {
        return items.join(', ');
    }

    return 'None';
};
