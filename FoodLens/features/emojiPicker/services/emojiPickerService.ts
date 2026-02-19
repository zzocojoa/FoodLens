import { UserProfile } from '@/models/User';
import { UserService } from '@/services/userService';
import { getEmojiPickerUserId } from '../constants/emojiPicker.constants';

export const emojiPickerService = {
    loadProfile: () => UserService.getUserProfile(getEmojiPickerUserId()),

    saveSelectedEmoji: (profile: UserProfile, emoji: string) =>
        UserService.updateUserProfile(profile.uid, {
            settings: {
                ...profile.settings,
                selectedEmoji: emoji,
            },
        }),
};
