import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { EMOJI_OPTIONS } from '../constants/emojiPicker.constants';
import { EmojiPickerTheme } from '../types/emojiPicker.types';
import { emojiPickerStyles as styles } from '../styles/emojiPickerStyles';
import { useI18n } from '@/features/i18n';

type EmojiGridProps = {
    selectedEmoji: string;
    onSelectEmoji: (emoji: string) => void;
    theme: EmojiPickerTheme;
};

export default function EmojiGrid({ selectedEmoji, onSelectEmoji, theme }: EmojiGridProps) {
    const { t } = useI18n();
    return (
        <ScrollView contentContainerStyle={styles.gridContainer}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                {t('emojiPicker.section.title', 'Choose an Emoji')}
            </Text>
            <View style={styles.grid}>
                {EMOJI_OPTIONS.map((emoji) => (
                    <TouchableOpacity
                        key={emoji}
                        style={[
                            styles.emojiItem,
                            { backgroundColor: theme.surface },
                            selectedEmoji === emoji && { borderColor: theme.primary, borderWidth: 2 },
                        ]}
                        onPress={() => onSelectEmoji(emoji)}
                    >
                        <Text style={styles.emojiText}>{emoji}</Text>
                        {selectedEmoji === emoji && (
                            <View style={[styles.checkBadge, { backgroundColor: theme.primary }]}>
                                <Check size={12} color="#fff" />
                            </View>
                        )}
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );
}
