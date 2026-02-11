import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { EmojiPickerTheme } from '../types/emojiPicker.types';
import { emojiPickerStyles as styles } from '../styles/emojiPickerStyles';

type EmojiPickerHeaderProps = {
    title: string;
    onBack: () => void;
    theme: EmojiPickerTheme;
};

export default function EmojiPickerHeader({ title, onBack, theme }: EmojiPickerHeaderProps) {
    return (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={onBack}
                style={[styles.backButton, { backgroundColor: theme.glass, borderColor: theme.border }]}
                hitSlop={15}
            >
                <View pointerEvents="none">
                    <ChevronLeft size={24} color={theme.textPrimary} strokeWidth={2.5} />
                </View>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>{title}</Text>
            <View style={{ width: 40, height: 40 }} />
        </View>
    );
}

