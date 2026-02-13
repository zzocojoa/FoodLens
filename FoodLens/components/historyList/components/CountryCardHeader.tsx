import React from 'react';
import { Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { Colors } from '@/constants/theme';
import { StyleSheet } from 'react-native';

type CountryCardHeaderProps = {
    flag: string;
    countryName: string;
    total: number;
    isExpanded: boolean;
    onToggle: () => void;
    colorScheme: keyof typeof Colors;
};

const styles = StyleSheet.create({
    countryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 24 },
    countryName: { fontSize: 17, fontWeight: '900' },
    countryCount: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
});

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
