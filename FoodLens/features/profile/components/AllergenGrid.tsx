import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { COMMON_ALLERGENS } from '../constants/profile.constants';
import { ProfileTheme } from '../types/profile.types';
import { profileStyles as styles } from '../styles/profileStyles';
import { homeDashboardColors } from '@/features/home/components/homeDashboardTokens';

type AllergenGridProps = {
    theme?: ProfileTheme;
    selectedAllergies: string[];
    onToggle: (id: string) => void;
    t: (key: string, fallback?: string) => string;
};

export default function AllergenGrid({ selectedAllergies, onToggle, t }: AllergenGridProps) {
    return (
        <View style={styles.grid}>
            {COMMON_ALLERGENS.map((item) => {
                const isSelected = selectedAllergies.includes(item.id);
                return (
                    <Pressable
                        key={item.id}
                        style={[
                            styles.card,
                            isSelected ? styles.cardSelected : styles.cardUnselected,
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
                            ]}
                        >
                            <Image source={item.image} style={styles.cardIconImage} resizeMode="contain" />
                        </View>
                        <Text
                            numberOfLines={2}
                            style={[
                                styles.cardLabel,
                                isSelected ? styles.cardLabelSelected : styles.cardLabelUnselected,
                            ]}
                        >
                            {t(`profile.allergen.${item.id}`, item.label)}
                        </Text>
                        <View style={styles.cardCheckSlot}>
                            {isSelected ? (
                                <View style={styles.checkBadge}>
                                    <Check size={12} color={homeDashboardColors.accentGreen} />
                                </View>
                            ) : null}
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );
}
