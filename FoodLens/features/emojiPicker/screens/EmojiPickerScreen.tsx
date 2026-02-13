import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import EmojiGrid from '../components/EmojiGrid';
import EmojiPickerHeader from '../components/EmojiPickerHeader';
import EmojiPreviewCard from '../components/EmojiPreviewCard';
import { useEmojiPicker } from '../hooks/useEmojiPicker';
import { emojiPickerStyles as styles } from '../styles/emojiPickerStyles';
import { useI18n } from '@/features/i18n';

export default function EmojiPickerScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const { selectedEmoji, selectEmoji } = useEmojiPicker();
    const { t } = useI18n();

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <EmojiPickerHeader
                title={t('emojiPicker.title', 'Emoji Selection')}
                onBack={() => router.back()}
                theme={theme}
            />
            <EmojiPreviewCard selectedEmoji={selectedEmoji} colorScheme={colorScheme} theme={theme} />
            <EmojiGrid selectedEmoji={selectedEmoji} onSelectEmoji={selectEmoji} theme={theme} />
        </SafeAreaView>
    );
}
