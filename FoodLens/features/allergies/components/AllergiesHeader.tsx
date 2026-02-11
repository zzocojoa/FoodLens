import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AllergiesTheme } from '../types/allergies.types';
import { allergiesStyles as styles } from '../styles/allergiesStyles';

type AllergiesHeaderProps = {
    title: string;
    onBackPress: () => void;
    theme: AllergiesTheme;
};

export default function AllergiesHeader({ title, onBackPress, theme }: AllergiesHeaderProps) {
    return (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={onBackPress}
                style={[styles.backButton, { backgroundColor: theme.glass, borderColor: theme.border }]}
            >
                <Ionicons name="arrow-back" size={24} color={theme.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>{title}</Text>
            <View style={{ width: 40 }} />
        </View>
    );
}

