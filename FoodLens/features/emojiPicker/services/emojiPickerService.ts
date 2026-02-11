import { UserProfile } from '@/models/User';
import { UserService } from '@/services/userService';
import { TEST_UID } from '../constants/emojiPicker.constants';

export const emojiPickerService = {
    loadProfile: () => UserService.getUserProfile(TEST_UID),

    saveSelectedEmoji: (profile: UserProfile, emoji: string) =>
        UserService.updateUserProfile(profile.uid, {
            settings: {
                ...profile.settings,
                selectedEmoji: emoji,
            },
        }),
};

