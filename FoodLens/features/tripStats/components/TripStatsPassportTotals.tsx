import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Globe, MapPin, Navigation, ShieldCheck } from 'lucide-react-native';

import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import { TripStatsPassportTotals as TripStatsPassportTotalsViewModel } from '../types/tripStats.types';
import {
    tripStatsDashboardColors as colors,
    tripStatsDashboardRadii as radii,
    tripStatsDashboardSpacing as spacing,
} from './tripStatsDashboardTokens';
import { tripStatsDashboardStyles } from './tripStatsDashboardStyles';
import { useI18n } from '@/features/i18n';

export type TripStatsPassportTotalsProps = {
    totals: TripStatsPassportTotalsViewModel;
};

type MetricTile = {
    icon: React.ReactNode;
    label: string;
    value: string;
};

export default function TripStatsPassportTotals({
    totals,
}: TripStatsPassportTotalsProps): React.JSX.Element {
    const { t } = useI18n();

    const metrics: MetricTile[] = [
        {
            icon: <Globe color={colors.accentBlue} size={16} />,
            label: t('tripStats.totals.countriesLabel', 'Countries'),
            value: String(totals.countriesVisitedCount),
        },
        {
            icon: <MapPin color={colors.accentAmber} size={16} />,
            label: t('tripStats.totals.citiesLabel', 'Cities'),
            value: String(totals.citiesVisitedCount),
        },
        {
            icon: <ShieldCheck color={colors.accentGreen} size={16} />,
            label: t('tripStats.totals.safeLabel', 'Safe'),
            value: String(totals.safeCount),
        },
        {
            icon: <Navigation color={colors.accentBlue} size={16} />,
            label: t('tripStats.totals.currentTripLabel', 'Trip'),
            value: String(totals.currentTripCount),
        },
    ];

    return (
        <View style={[tripStatsDashboardStyles.totalsCard, styles.container]}>
            <PearlSurfaceOverlay
                accentWashColor={colors.pearlMist}
                baseBottomColor="#FFF8F0"
                baseTopColor={colors.pearlIvory}
                coolWashColor={colors.pearlSage}
                warmWashColor={colors.pearlPeach}
            />

            <View style={styles.content}>
                <Text style={tripStatsDashboardStyles.totalsTitle}>
                    {t('tripStats.totals.title', 'Totals')}
                </Text>

                <View style={tripStatsDashboardStyles.totalsGrid}>
                    {metrics.map((metric) => (
                        <MetricCard
                            key={metric.label}
                            icon={metric.icon}
                            label={metric.label}
                            value={metric.value}
                        />
                    ))}
                </View>
            </View>
        </View>
    );
}

type MetricCardProps = {
    icon: React.ReactNode;
    label: string;
    value: string;
};

const MetricCard = ({ icon, label, value }: MetricCardProps): React.JSX.Element => {
    return (
        <View style={tripStatsDashboardStyles.totalsTile}>
            <View style={styles.metricIcon}>{icon}</View>
            <Text style={tripStatsDashboardStyles.totalsValue}>{value}</Text>
            <Text style={tripStatsDashboardStyles.totalsLabel}>{label}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        position: 'relative',
    },
    content: {
        gap: spacing.md,
        zIndex: 1,
    },
    metricIcon: {
        alignItems: 'center',
        backgroundColor: colors.surfaceMuted,
        borderRadius: radii.pill,
        borderCurve: 'continuous',
        height: 30,
        justifyContent: 'center',
        width: 30,
    },
});
