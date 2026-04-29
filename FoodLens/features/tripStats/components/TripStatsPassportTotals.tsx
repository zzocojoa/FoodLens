import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Globe, MapPin, Navigation, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react-native';

import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import { TripStatsPassportTotals as TripStatsPassportTotalsViewModel } from '../types/tripStats.types';
import {
    tripStatsDashboardColors as colors,
    getTripStatsDashboardSignalColors,
    tripStatsDashboardRadii as radii,
    tripStatsDashboardSpacing as spacing,
    tripStatsDashboardTypography as typography,
    type TripStatsDashboardColors,
    type TripStatsDashboardColorScheme,
} from './tripStatsDashboardTokens';
import { tripStatsDashboardStyles } from './tripStatsDashboardStyles';
import { useI18n } from '@/features/i18n';

export type TripStatsPassportTotalsProps = {
    colorScheme: TripStatsDashboardColorScheme;
    colors: TripStatsDashboardColors;
    totals: TripStatsPassportTotalsViewModel;
};

type MetricTile = {
    icon: React.ReactNode;
    label: string;
    value: string;
};

type SafetySegment = {
    key: 'safe' | 'caution' | 'danger';
    label: string;
    value: number;
    color: string;
    backgroundColor: string;
    icon: React.ReactNode;
};

const resolveSegmentWidth = (value: number, total: number): `${number}%` => {
    if (total <= 0 || value <= 0) {
        return '0%';
    }

    return `${Math.round((value / total) * 100)}%`;
};

export default function TripStatsPassportTotals({
    colorScheme,
    colors: dashboardColors,
    totals,
}: TripStatsPassportTotalsProps): React.JSX.Element {
    const { t } = useI18n();
    const themedSignalColors = React.useMemo(
        () => getTripStatsDashboardSignalColors(dashboardColors),
        [dashboardColors],
    );
    const currentTripTotal = totals.currentTripCount;
    const currentTripSafeCount = totals.currentTripSafeCount;
    const currentTripCautionCount = totals.currentTripCautionCount;
    const currentTripDangerCount = totals.currentTripDangerCount;
    const hasCurrentTripSignals = currentTripTotal > 0;
    const safetySegments: SafetySegment[] = [
        {
            key: 'safe',
            label: t('tripStats.totals.safeLabel', 'Safe'),
            value: currentTripSafeCount,
            color: themedSignalColors.SAFE.text,
            backgroundColor: themedSignalColors.SAFE.background,
            icon: <ShieldCheck color={themedSignalColors.SAFE.text} size={16} />,
        },
        {
            key: 'caution',
            label: t('tripStats.totals.cautionLabel', 'Caution'),
            value: currentTripCautionCount,
            color: themedSignalColors.CAUTION.text,
            backgroundColor: themedSignalColors.CAUTION.background,
            icon: <ShieldAlert color={themedSignalColors.CAUTION.text} size={16} />,
        },
        {
            key: 'danger',
            label: t('tripStats.totals.dangerLabel', 'Avoid'),
            value: currentTripDangerCount,
            color: themedSignalColors.DANGER.text,
            backgroundColor: themedSignalColors.DANGER.background,
            icon: <ShieldX color={themedSignalColors.DANGER.text} size={16} />,
        },
    ];

    const metrics: MetricTile[] = [
        {
            icon: <Globe color={dashboardColors.accentBlue} size={16} />,
            label: t('tripStats.totals.countriesLabel', 'Countries'),
            value: String(totals.countriesVisitedCount),
        },
        {
            icon: <MapPin color={dashboardColors.accentAmber} size={16} />,
            label: t('tripStats.totals.citiesLabel', 'Cities'),
            value: String(totals.citiesVisitedCount),
        },
        {
            icon: <ShieldCheck color={dashboardColors.accentGreen} size={16} />,
            label: t('tripStats.totals.safeLabel', 'Safe'),
            value: String(totals.safeCount),
        },
        {
            icon: <Navigation color={dashboardColors.accentBlue} size={16} />,
            label: t('tripStats.totals.currentTripLabel', 'Trip'),
            value: String(totals.currentTripCount),
        },
    ];

    return (
        <View
            style={[
                tripStatsDashboardStyles.totalsCard,
                styles.container,
                { backgroundColor: dashboardColors.surface, borderColor: dashboardColors.line },
            ]}
        >
            {colorScheme === 'light' ? (
                <PearlSurfaceOverlay
                    accentWashColor={dashboardColors.pearlMist}
                    baseBottomColor="#FFF8F0"
                    baseTopColor={dashboardColors.pearlIvory}
                    coolWashColor={dashboardColors.pearlSage}
                    warmWashColor={dashboardColors.pearlPeach}
                />
            ) : null}

            <View style={styles.content}>
                <View
                    style={[
                        styles.heroPanel,
                        {
                            backgroundColor: dashboardColors.pearlIvory,
                            borderColor: dashboardColors.line,
                        },
                    ]}
                >
                    <View style={styles.heroCopy}>
                        <Text style={[styles.heroEyebrow, { color: dashboardColors.inkSoft }]}>
                            {t('tripStats.totals.currentTripEyebrow', 'Current trip')}
                        </Text>
                        <Text style={[styles.heroValue, { color: dashboardColors.ink }]}>
                            {String(currentTripTotal)}
                        </Text>
                        <Text style={[styles.heroCaption, { color: dashboardColors.inkSoft }]}>
                            {hasCurrentTripSignals
                                ? t('tripStats.totals.currentTripCaption', 'Safety checks logged on this trip')
                                : t('tripStats.totals.currentTripEmpty', 'Start a trip to build a focused safety snapshot')}
                        </Text>
                    </View>

                    <View style={styles.distributionColumn}>
                        <View
                            style={[
                                styles.distributionTrack,
                                {
                                    backgroundColor: dashboardColors.surfaceMuted,
                                    borderColor: dashboardColors.line,
                                },
                            ]}
                        >
                            {safetySegments.map((segment) => (
                                <View
                                    key={segment.key}
                                    style={[
                                        styles.distributionFill,
                                        {
                                            backgroundColor: segment.color,
                                            width: resolveSegmentWidth(segment.value, currentTripTotal),
                                        },
                                    ]}
                                />
                            ))}
                        </View>

                        <View style={styles.segmentGrid}>
                            {safetySegments.map((segment) => (
                                <View
                                    key={segment.key}
                                    style={[
                                        styles.segmentItem,
                                        {
                                            backgroundColor: dashboardColors.surfaceStrong,
                                            borderColor: dashboardColors.line,
                                        },
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.segmentIcon,
                                            { backgroundColor: segment.backgroundColor },
                                        ]}
                                    >
                                        {segment.icon}
                                    </View>
                                    <Text style={[styles.segmentValue, { color: segment.color }]}>
                                        {String(segment.value)}
                                    </Text>
                                    <Text style={[styles.segmentLabel, { color: dashboardColors.inkSoft }]}>
                                        {segment.label}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                <Text style={[tripStatsDashboardStyles.totalsTitle, { color: dashboardColors.ink }]}>
                    {t('tripStats.totals.title', 'Passport totals')}
                </Text>

                <View style={tripStatsDashboardStyles.totalsGrid}>
                    {metrics.map((metric) => (
                        <MetricCard
                            key={metric.label}
                            icon={metric.icon}
                            label={metric.label}
                            colors={dashboardColors}
                            value={metric.value}
                        />
                    ))}
                </View>
            </View>
        </View>
    );
}

type MetricCardProps = {
    colors: TripStatsDashboardColors;
    icon: React.ReactNode;
    label: string;
    value: string;
};

const MetricCard = ({ colors: dashboardColors, icon, label, value }: MetricCardProps): React.JSX.Element => {
    return (
        <View
            style={[
                tripStatsDashboardStyles.totalsTile,
                { backgroundColor: dashboardColors.pearlIvory, borderColor: dashboardColors.line },
            ]}
        >
            <View style={[styles.metricIcon, { backgroundColor: dashboardColors.surfaceMuted }]}>
                {icon}
            </View>
            <Text style={[tripStatsDashboardStyles.totalsValue, { color: dashboardColors.ink }]}>
                {value}
            </Text>
            <Text style={[tripStatsDashboardStyles.totalsLabel, { color: dashboardColors.inkSoft }]}>
                {label}
            </Text>
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
    heroPanel: {
        backgroundColor: colors.pearlIvory,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.lg,
        borderWidth: 1,
        gap: spacing.md,
        padding: spacing.md,
    },
    heroCopy: {
        gap: spacing.xs,
    },
    heroEyebrow: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        fontWeight: '800',
        letterSpacing: 0.7,
        lineHeight: 16,
        textTransform: 'uppercase',
    },
    heroValue: {
        color: colors.ink,
        fontSize: 44,
        fontWeight: '900',
        lineHeight: 48,
    },
    heroCaption: {
        color: colors.inkSoft,
        fontSize: typography.body,
        fontWeight: '600',
        lineHeight: 20,
    },
    distributionColumn: {
        gap: spacing.sm,
    },
    distributionTrack: {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.pill,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 2,
        height: 14,
        overflow: 'hidden',
        padding: 2,
    },
    distributionFill: {
        borderRadius: radii.pill,
        minWidth: 0,
    },
    segmentGrid: {
        flexDirection: 'row',
        gap: spacing.xs,
    },
    segmentItem: {
        backgroundColor: colors.surfaceStrong,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.md,
        borderWidth: 1,
        flex: 1,
        gap: spacing.xxs,
        minWidth: 0,
        padding: spacing.sm,
    },
    segmentIcon: {
        alignItems: 'center',
        borderCurve: 'continuous',
        borderRadius: radii.pill,
        height: 30,
        justifyContent: 'center',
        width: 30,
    },
    segmentValue: {
        fontSize: 22,
        fontWeight: '900',
        lineHeight: 26,
    },
    segmentLabel: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        fontWeight: '800',
        lineHeight: 14,
        textTransform: 'uppercase',
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
