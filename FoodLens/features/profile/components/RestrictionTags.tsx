import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';

type RestrictionTagsProps = {
    theme: ProfileTheme;
    items: string[];
    onRemove: (item: string) => void;
};

export default function RestrictionTags({ theme, items, onRemove }: RestrictionTagsProps) {
    return (
        <View style={styles.tagContainer}>
            {items.map((item, index) => (
                <View
                    key={`${item}-${index}`}
                    style={[styles.tag, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                    <Text style={[styles.tagText, { color: theme.primary }]}>{item}</Text>
                    <TouchableOpacity
                        onPress={() => onRemove(item)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="close" size={16} color={theme.primary} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                </View>
            ))}
        </View>
    );
}
