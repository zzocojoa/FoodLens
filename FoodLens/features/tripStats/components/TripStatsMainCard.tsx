import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, ShieldCheck } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { TripStatsTheme } from '../types/tripStats.types';
import { THEME_STYLES, tripStatsStyles as styles } from '../styles/tripStatsStyles';
import { useI18n } from '@/features/i18n';

type TripStatsMainCardProps = {
    loading: boolean;
    safeCount: number;
    totalCount: number;
    tripStartDate: Date | null;
    colorScheme: 'light' | 'dark';
    theme: TripStatsTheme;
    onPressGlobalRecord: () => void;
};

export default function TripStatsMainCard({
    loading,
    safeCount,
    totalCount,
    tripStartDate,
    colorScheme,
    theme,
    onPressGlobalRecord,
}: TripStatsMainCardProps) {
    const { t } = useI18n();

    return (
        <BlurView
            intensity={80}
            tint={colorScheme === 'dark' ? 'dark' : 'light'}
            style={[
                styles.mainCard,
                {
                    backgroundColor: theme.glass,
                    borderColor: theme.glassBorder,
                    shadowColor: theme.shadow,
                },
                THEME_STYLES.glass,
            ]}
        >
            <View
                style={[
                    styles.shieldIconContainer,
                    {
                        backgroundColor: colorScheme === 'dark' ? 'rgba(22, 101, 52, 0.3)' : '#DCFCE7',
                    },
                ]}
            >
                <ShieldCheck size={40} color={colorScheme === 'dark' ? '#4ADE80' : '#166534'} />
            </View>
            <ActivityIndicator animating={loading} style={{ position: 'absolute', top: 20 }} color={theme.textSecondary} />
            <Text style={[styles.bigCount, { color: theme.textPrimary }]}>{safeCount}</Text>
            <Text style={[styles.statDescription, { color: theme.textSecondary }]}>
                {t('tripStats.main.confirmedSafeDuring', 'Confirmed safe during')}
                {`\n`}
                {tripStartDate
                    ? t('tripStats.main.currentTrip', 'current trip')
                    : t('tripStats.main.allTimeRecord', 'all-time record')}
            </Text>

            <TouchableOpacity style={[styles.globalLink, { borderTopColor: theme.border }]} onPress={onPressGlobalRecord}>
                <View
                    pointerEvents="none"
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <Text style={[styles.globalLinkText, { color: theme.textSecondary }]}>
                        {t('tripStats.main.globalRecord', 'Global Record')}
                    </Text>
                    <View style={styles.globalLinkRight}>
                        <Text style={[styles.globalCountText, { color: theme.textPrimary }]}>
                            {t('tripStats.main.totalItemsTemplate', 'Total {count} Items').replace(
                                '{count}',
                                String(totalCount)
                            )}
                        </Text>
                        <ArrowRight size={16} color={theme.textSecondary} />
                    </View>
                </View>
            </TouchableOpacity>
        </BlurView>
    );
}
