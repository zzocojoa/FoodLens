import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { COMMON_ALLERGENS } from '../constants/profile.constants';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';
import {
    homeDashboardColors,
    type HomeDashboardColors,
} from '@/features/home/components/homeDashboardTokens';

type AllergenGridProps = {
    dashboardColors?: HomeDashboardColors;
    theme?: ProfileTheme;
    selectedAllergies: string[];
    onToggle: (id: string) => void;
    t: (key: string, fallback?: string) => string;
};

export default function AllergenGrid({
    dashboardColors,
    theme,
    selectedAllergies,
    onToggle,
    t,
}: AllergenGridProps) {
    const colors = dashboardColors ?? homeDashboardColors;

    return (
        <View style={styles.grid}>
            {COMMON_ALLERGENS.map((item) => {
                const isSelected = selectedAllergies.includes(item.id);
                const cardBackgroundColor = isSelected
                    ? colors.accentGreenSoft
                    : theme?.surface ?? homeDashboardColors.surfaceStrong;
                const cardBorderColor = isSelected
                    ? colors.accentGreen
                    : theme?.border ?? homeDashboardColors.line;
                const iconBackgroundColor = theme?.background ?? homeDashboardColors.pearlIvory;
                const labelColor = isSelected
                    ? colors.accentGreen
                    : theme?.textPrimary ?? homeDashboardColors.ink;

                return (
                    <Pressable
                        key={item.id}
                        style={[
                            styles.card,
                            isSelected ? styles.cardSelected : styles.cardUnselected,
                            {
                                backgroundColor: cardBackgroundColor,
                                borderColor: cardBorderColor,
                            },
                        ]}
                        onPress={() => onToggle(item.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={t(`profile.allergen.${item.id}`, item.label)}
                    >
                        <View
                            style={[
                                styles.iconCircle,
                                isSelected && styles.iconCircleSelected,
                                { backgroundColor: iconBackgroundColor },
                            ]}
                        >
                            <Image source={item.image} style={styles.cardIconImage} resizeMode="contain" />
                        </View>
                        <Text
                            style={[
                                styles.cardLabel,
                                isSelected ? styles.cardLabelSelected : styles.cardLabelUnselected,
                                { color: labelColor },
                            ]}
                        >
                            {t(`profile.allergen.${item.id}`, item.label)}
                        </Text>
                        <View style={styles.cardCheckSlot}>
                            {isSelected ? (
                                <View style={[styles.checkBadge, { backgroundColor: iconBackgroundColor }]}>
                                    <Check size={12} color={colors.accentGreen} />
                                </View>
                            ) : null}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}
