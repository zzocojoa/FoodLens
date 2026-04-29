import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Clock3, MapPin, Navigation } from 'lucide-react-native';

import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
    tripStatsDashboardColors as colors,
    tripStatsDashboardRadii as radii,
    tripStatsDashboardSpacing as spacing,
    tripStatsDashboardTypography as typography,
    type TripStatsDashboardColors,
    type TripStatsDashboardColorScheme,
} from './tripStatsDashboardTokens';
import { tripStatsDashboardStyles } from './tripStatsDashboardStyles';
import { formatCalendarDate } from '@/features/i18n';
import { useI18n } from '@/features/i18n';

export type TripStatsJournalRailProps = {
    colorScheme: TripStatsDashboardColorScheme;
    colors: TripStatsDashboardColors;
    currentLocation: string | null;
    isLocating: boolean;
    loading: boolean;
    tripStartDate: Date | null;
};

const resolveStatusLabel = (
    loading: boolean,
    isLocating: boolean,
    tripStartDate: Date | null,
    t: (key: string, fallback?: string) => string,
): string => {
    if (loading) {
        return t('tripStats.rail.statusLoading', 'Syncing');
    }

    if (isLocating) {
        return t('tripStats.rail.statusPending', 'Locating');
    }

    if (tripStartDate) {
        return t('tripStats.rail.statusReady', 'Ready');
    }

    return t('tripStats.rail.statusIdle', 'Idle');
};

export default function TripStatsJournalRail({
    colorScheme,
    colors: dashboardColors,
    currentLocation,
    isLocating,
    loading,
    tripStartDate,
}: TripStatsJournalRailProps): React.JSX.Element {
    const { locale, t } = useI18n();
    const locationLabel = currentLocation?.trim() || t('tripStats.hero.locationNotSet', 'Location not set');
    const tripDateLabel = tripStartDate
        ? formatCalendarDate(tripStartDate, locale, { month: 'short', day: 'numeric' })
        : t('tripStats.rail.noTripDate', 'No start yet');
    const scopeLabel = tripStartDate
        ? t('tripStats.hero.currentTripLabel', 'This trip')
        : t('tripStats.hero.allTimeLabel', 'Overall');

    return (
        <View
            style={[
                tripStatsDashboardStyles.railCard,
                styles.container,
                { backgroundColor: dashboardColors.surface, borderColor: dashboardColors.line },
            ]}
        >
            {colorScheme === 'light' ? (
                <PearlSurfaceOverlay
                    accentWashColor={dashboardColors.pearlMist}
                    baseBottomColor="#FFF7EF"
                    baseTopColor={dashboardColors.pearlIvory}
                    coolWashColor={dashboardColors.pearlSage}
                    warmWashColor={dashboardColors.pearlPeach}
                />
            ) : null}

                <View style={styles.content}>
                    <View style={tripStatsDashboardStyles.railHeader}>
                        <View style={tripStatsDashboardStyles.railCopy}>
                            <Text style={[tripStatsDashboardStyles.railTitle, { color: dashboardColors.ink }]}>
                                {t('tripStats.rail.title', 'Trip overview')}
                            </Text>
                            <Text
                                style={[
                                    tripStatsDashboardStyles.railSubtitle,
                                    { color: dashboardColors.inkSoft },
                                ]}
                            >
                                {t(
                                    'tripStats.rail.subtitle',
                                    'Location, date, and status at a glance.',
                                )}
                            </Text>
                        </View>

                    <View
                        style={[
                            tripStatsDashboardStyles.pill,
                            {
                                backgroundColor: dashboardColors.surfaceMuted,
                                borderColor: dashboardColors.line,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                tripStatsDashboardStyles.pillText,
                                { color: dashboardColors.inkSoft },
                            ]}
                        >
                            {resolveStatusLabel(loading, isLocating, tripStartDate, t)}
                        </Text>
                    </View>
                </View>

                <View style={styles.metaRow}>
                    <MetaChip
                        colors={dashboardColors}
                        icon={<MapPin color={dashboardColors.accentBlue} size={14} />}
                        label={locationLabel}
                    />
                    <MetaChip
                        colors={dashboardColors}
                        icon={<Clock3 color={dashboardColors.accentAmber} size={14} />}
                        label={tripDateLabel}
                    />
                    <MetaChip
                        colors={dashboardColors}
                        icon={<Navigation color={dashboardColors.accentGreen} size={14} />}
                        label={scopeLabel}
                    />
                </View>
            </View>
        </View>
    );
}

type MetaChipProps = {
    colors: TripStatsDashboardColors;
    icon: React.ReactNode;
    label: string;
};

const MetaChip = ({ colors: dashboardColors, icon, label }: MetaChipProps): React.JSX.Element => {
    return (
        <View
            style={[
                styles.metaChip,
                { backgroundColor: dashboardColors.surfaceMuted, borderColor: dashboardColors.line },
            ]}
        >
            {icon}
            <Text numberOfLines={1} style={[styles.metaChipText, { color: dashboardColors.inkSoft }]}>
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
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
    },
    metaChip: {
        alignItems: 'center',
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.pill,
        borderWidth: 1,
        flexDirection: 'row',
        gap: spacing.xs,
        minHeight: 30,
        paddingHorizontal: spacing.sm,
    },
    metaChipText: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        fontWeight: '700',
        letterSpacing: 0.4,
        lineHeight: 14,
        textTransform: 'uppercase',
    },
});
