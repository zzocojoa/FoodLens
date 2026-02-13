import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COMMON_ALLERGENS } from '../constants/profile.constants';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';

type AllergenGridProps = {
    theme: ProfileTheme;
    selectedAllergies: string[];
    onToggle: (id: string) => void;
    t: (key: string, fallback?: string) => string;
};

export default function AllergenGrid({ theme, selectedAllergies, onToggle, t }: AllergenGridProps) {
    return (
        <View style={styles.grid}>
            {COMMON_ALLERGENS.map((item) => {
                const isSelected = selectedAllergies.includes(item.id);
                return (
                    <TouchableOpacity
                        key={item.id}
                        style={[
                            styles.card,
                            { backgroundColor: theme.surface },
                            isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => onToggle(item.id)}
                    >
                        <View
                            style={[
                                styles.iconCircle,
                                isSelected && { backgroundColor: 'rgba(255,255,255,0.2)' },
                            ]}
                        >
                            <Image source={item.image} style={{ width: 40, height: 40 }} resizeMode="contain" />
                        </View>
                        <Text
                            style={[
                                styles.cardLabel,
                                { color: theme.textPrimary },
                                isSelected && { color: 'white' },
                            ]}
                        >
                            {t(`profile.allergen.${item.id}`, item.label)}
                        </Text>
                        {isSelected && (
                            <View style={styles.checkBadge}>
                                <Ionicons name="checkmark" size={12} color={theme.primary} />
                            </View>
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
