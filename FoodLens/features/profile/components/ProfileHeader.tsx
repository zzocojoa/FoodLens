import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';

type ProfileHeaderProps = {
    theme: ProfileTheme;
    onBack: () => void;
};

export default function ProfileHeader({ theme, onBack }: ProfileHeaderProps) {
    return (
        <View style={styles.navBar}>
            <TouchableOpacity onPress={onBack} style={styles.navButton}>
                <Ionicons name="chevron-back" size={28} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.navTitle, { color: theme.textPrimary }]}>Health Profile</Text>
            <View style={{ width: 28 }} />
        </View>
    );
}
