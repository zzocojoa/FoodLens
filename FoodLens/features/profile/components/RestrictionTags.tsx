import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';
import { resolveRestrictionDisplayName } from '../utils/profileSuggestions';

type RestrictionTagsProps = {
    theme: ProfileTheme;
    items: string[];
    t: (key: string, fallback: string) => string;
    onRemove: (item: string) => void;
};

export default function RestrictionTags({ theme, items, t, onRemove }: RestrictionTagsProps) {
    return (
        <View style={styles.tagContainer}>
            {items.map((item, index) => (
                <View
                    key={`${item}-${index}`}
                    style={[styles.tag, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                    <Text style={[styles.tagText, { color: theme.primary }]}>
                        {resolveRestrictionDisplayName(item, t)}
                    </Text>
                    <TouchableOpacity
                        onPress={() => onRemove(item)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <X size={16} color={theme.primary} style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                </View>
            ))}
        </View>
    );
}
