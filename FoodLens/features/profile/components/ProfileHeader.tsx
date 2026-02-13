import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';
import { useI18n } from '@/features/i18n';

type ProfileHeaderProps = {
    theme: ProfileTheme;
    onBack: () => void;
};

export default function ProfileHeader({ theme, onBack }: ProfileHeaderProps) {
    const { t } = useI18n();

    return (
        <View style={styles.navBar}>
            <TouchableOpacity onPress={onBack} style={styles.navButton}>
                <Ionicons name="chevron-back" size={28} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: theme.textPrimary }]}>
                {t('profile.header.title', 'Health Profile')}
            </Text>
            <View style={{ width: 28 }} />
        </View>
    );
}
