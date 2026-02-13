import React from 'react';
import { View, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { EmojiPickerTheme } from '../types/emojiPicker.types';
import { emojiPickerStyles as styles } from '../styles/emojiPickerStyles';
import { useI18n } from '@/features/i18n';

type EmojiPreviewCardProps = {
    selectedEmoji: string;
    colorScheme: 'light' | 'dark';
    theme: EmojiPickerTheme;
};

export default function EmojiPreviewCard({ selectedEmoji, colorScheme, theme }: EmojiPreviewCardProps) {
    const { t } = useI18n();
    return (
        <View style={styles.previewContainer}>
            <BlurView
                intensity={80}
                tint={colorScheme === 'dark' ? 'dark' : 'light'}
                style={[styles.previewCard, { backgroundColor: theme.glass }]}
            >
                <Text style={styles.previewEmoji}>{selectedEmoji}</Text>
                <Text style={[styles.previewLabel, { color: theme.textSecondary }]}>
                    {t('emojiPicker.preview', 'Preview')}
                </Text>
            </BlurView>
        </View>
    );
}
