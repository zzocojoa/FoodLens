import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
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
                    <TouchableOpacity
                        key={item.id}
                        style={[
                            styles.card,
                            { backgroundColor: homeDashboardColors.surfaceStrong },
                            isSelected && {
                                backgroundColor: homeDashboardColors.accentGreenSoft,
                                borderColor: homeDashboardColors.accentGreen,
                            },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => onToggle(item.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={t(`profile.allergen.${item.id}`, item.label)}
                    >
                        <View
                            style={[
                                styles.iconCircle,
                                isSelected && { backgroundColor: homeDashboardColors.pearlGlow },
                            ]}
                        >
                            <Image source={item.image} style={{ width: 40, height: 40 }} resizeMode="contain" />
                        </View>
                        <Text
                            style={[
                                styles.cardLabel,
                                { color: homeDashboardColors.ink },
                                isSelected && { color: homeDashboardColors.accentGreen },
                            ]}
                        >
                            {t(`profile.allergen.${item.id}`, item.label)}
                        </Text>
                        {isSelected && (
                            <View style={styles.checkBadge}>
                                <Check size={12} color={homeDashboardColors.accentGreen} />
                            </View>
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
