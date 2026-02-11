import { UserProfile } from '@/models/User';
import { Colors } from '@/constants/theme';

export type EmojiPickerTheme = typeof Colors.light;

export type EmojiPickerState = {
    selectedEmoji: string;
    userProfile: UserProfile | null;
    isSaving: boolean;
};

export type UseEmojiPickerResult = EmojiPickerState & {
    selectEmoji: (emoji: string) => Promise<void>;
};

