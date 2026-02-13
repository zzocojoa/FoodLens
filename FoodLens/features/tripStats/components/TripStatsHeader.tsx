import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { TripStatsTheme } from '../types/tripStats.types';
import { tripStatsStyles as styles } from '../styles/tripStatsStyles';
import { useI18n } from '@/features/i18n';

type TripStatsHeaderProps = {
    theme: TripStatsTheme;
    onBack: () => void;
};

export default function TripStatsHeader({ theme, onBack }: TripStatsHeaderProps) {
    const { t } = useI18n();

    return (
        <View style={styles.header}>
            <TouchableOpacity
                onPress={onBack}
                style={[styles.backButton, { backgroundColor: theme.glass, borderColor: theme.border }]}
            >
                <View pointerEvents="none">
                    <ChevronLeft size={24} color={theme.textPrimary} />
                </View>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>
                {t('tripStats.header.title', 'Trip Statistics')}
            </Text>
            <View style={{ width: 40 }} />
        </View>
    );
}
