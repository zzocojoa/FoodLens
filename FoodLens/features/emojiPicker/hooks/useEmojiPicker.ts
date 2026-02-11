import { useEffect, useState } from 'react';
import { HapticsService } from '@/services/haptics';
import { DEFAULT_EMOJI } from '../constants/emojiPicker.constants';
import { emojiPickerService } from '../services/emojiPickerService';
import { UseEmojiPickerResult } from '../types/emojiPicker.types';

export const useEmojiPicker = (): UseEmojiPickerResult => {
    const [selectedEmoji, setSelectedEmoji] = useState<string>(DEFAULT_EMOJI);
    const [userProfile, setUserProfile] = useState<Awaited<ReturnType<typeof emojiPickerService.loadProfile>> | null>(
        null
    );
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const profile = await emojiPickerService.loadProfile();
                if (profile) {
                    setUserProfile(profile);
                    setSelectedEmoji(profile.settings?.selectedEmoji || DEFAULT_EMOJI);
                }
            } catch (e) {
                console.error('Failed to load profile:', e);
            }
        };

        loadProfile();
    }, []);

    const selectEmoji = async (emoji: string) => {
        if (!userProfile || isSaving) return;

        setIsSaving(true);
        HapticsService.medium();
        setSelectedEmoji(emoji);

        try {
            await emojiPickerService.saveSelectedEmoji(userProfile, emoji);
        } catch (e) {
            console.error('Failed to save emoji:', e);
        } finally {
            setIsSaving(false);
        }
    };

    return {
        selectedEmoji,
        userProfile,
        isSaving,
        selectEmoji,
    };
};

