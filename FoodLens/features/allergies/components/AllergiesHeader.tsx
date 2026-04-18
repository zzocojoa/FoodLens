import React from 'react';
import { View, Text } from 'react-native';
import { AllergiesTheme } from '../types/allergies.types';
import { allergiesStyles as styles } from '../styles/allergiesStyles';

type AllergiesHeaderProps = {
    title: string;
    theme: AllergiesTheme;
};

export default function AllergiesHeader({ title, theme }: AllergiesHeaderProps) {
    return (
        <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>{title}</Text>
        </View>
    );
}
