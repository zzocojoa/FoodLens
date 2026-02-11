import React from 'react';
import { Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { Colors } from '@/constants/theme';
import { countryCardStyles as styles } from '../styles';

type CountryCardHeaderProps = {
    flag: string;
    countryName: string;
    total: number;
    isExpanded: boolean;
    onToggle: () => void;
    colorScheme: keyof typeof Colors;
};

export default function CountryCardHeader({
    flag,
    countryName,
    total,
    isExpanded,
    onToggle,
    colorScheme,
}: CountryCardHeaderProps) {
    const theme = Colors[colorScheme];

    return (
        <HapticTouchableOpacity
            onPress={onToggle}
            activeOpacity={0.7}
            style={[styles.countryHeader, { backgroundColor: theme.glass }]}
            hapticType="selection"
        >
            <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                    <Text style={{ fontSize: 32 }}>{flag}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.countryName, { color: theme.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                            {countryName}
                        </Text>
                        <Text style={[styles.countryCount, { color: theme.textSecondary }]}>{total} SCANS</Text>
                    </View>
                </View>
                <ChevronDown
                    size={20}
                    color={theme.textSecondary}
                    style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                />
            </View>
        </HapticTouchableOpacity>
    );
}
