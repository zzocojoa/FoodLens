import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Navigation, ShieldCheck } from 'lucide-react-native';

import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
    TripStatsHeroSummary,
    TripStatsTone,
} from '../types/tripStats.types';
import {
    tripStatsDashboardColors as colors,
    tripStatsDashboardRadii as radii,
    tripStatsDashboardSpacing as spacing,
    tripStatsDashboardTypography as typography,
} from './tripStatsDashboardTokens';
import { tripStatsDashboardStyles } from './tripStatsDashboardStyles';
import { formatCalendarDate } from '@/features/i18n';
import { useI18n } from '@/features/i18n';

export type TripStatsAtlasHeroProps = {
    hero: TripStatsHeroSummary;
    isLocating: boolean;
    loading: boolean;
    onPressHistory: () => void;
    onPressStartTrip: () => void;
};

type ToneSpec = {
    badgeBackgroundColor: string;
    badgeTextColor: string;
    iconColor: string;
};

const resolveToneSpec = (tone: TripStatsTone): ToneSpec => {
    if (tone === 'safe') {
        return {
            badgeBackgroundColor: colors.accentGreenSoft,
            badgeTextColor: colors.accentGreen,
            iconColor: colors.accentGreen,
        };
    }

    if (tone === 'danger') {
        return {
            badgeBackgroundColor: colors.accentRedSoft,
            badgeTextColor: colors.accentRed,
            iconColor: colors.accentRed,
        };
    }

    if (tone === 'caution') {
        return {
            badgeBackgroundColor: colors.accentAmberSoft,
            badgeTextColor: colors.accentAmber,
            iconColor: colors.accentAmber,
        };
    }

    return {
        badgeBackgroundColor: colors.surfaceMuted,
        badgeTextColor: colors.inkSoft,
        iconColor: colors.accentBlue,
    };
};

const resolveStatusLabel = (
    loading: boolean,
    isLocating: boolean,
    hero: TripStatsHeroSummary,
    t: (key: string, fallback?: string) => string,
): string => {
    if (loading) {
        return t('tripStats.hero.statusLoading', 'Charting');
    }

    if (isLocating) {
        return t('tripStats.hero.verifyingLocation', 'Verifying location...');
    }

    if (hero.scope === 'currentTrip') {
        return t('tripStats.hero.currentTripLabel', 'Current trip');
    }

    return t('tripStats.hero.allTimeLabel', 'All-time record');
};

const resolveDescription = (
    hero: TripStatsHeroSummary,
    locale: string,
    t: (key: string, fallback?: string) => string,
): string => {
    if (hero.scope === 'currentTrip') {
        if (hero.analysisCount === 0) {
            return t(
                'tripStats.hero.currentTripEmptyTemplate',
                'The journal is ready in {location}. Start scanning to build this route.',
            ).replace('{location}', hero.locationLabel || t('tripStats.hero.locationNotSet', 'Location not set'));
        }

        const dateLabel = hero.tripStartDate
            ? formatCalendarDate(hero.tripStartDate, locale, { month: 'short', day: 'numeric' })
            : t('tripStats.rail.noTripDate', 'No trip yet');

        return t(
            'tripStats.hero.currentTripSummaryTemplate',
            '{count} scans logged in {location} since {date}.',
        )
            .replace('{count}', String(hero.analysisCount))
            .replace('{location}', hero.locationLabel || t('tripStats.hero.locationNotSet', 'Location not set'))
            .replace('{date}', dateLabel);
    }

    return t(
        'tripStats.hero.allTimeSummaryTemplate',
        '{count} total scans across {chapters} country chapters.',
    )
        .replace('{count}', String(hero.analysisCount))
        .replace('{chapters}', String(hero.chapterCount));
};

const resolveStampLabel = (
    hero: TripStatsHeroSummary,
    locale: string,
    t: (key: string, fallback?: string) => string,
): string => {
    if (!hero.tripStartDate && !hero.locationLabel) {
        return t('tripStats.hero.stampFallback', 'Atlas ready');
    }

    if (!hero.tripStartDate) {
        return hero.locationLabel || t('tripStats.hero.locationNotSet', 'Location not set');
    }

    const dateLabel = formatCalendarDate(hero.tripStartDate, locale, {
        month: 'short',
        day: 'numeric',
    });

    if (!hero.locationLabel) {
        return dateLabel;
    }

    return `${hero.locationLabel} · ${dateLabel}`;
};

export default function TripStatsAtlasHero({
    hero,
    isLocating,
    loading,
    onPressHistory,
    onPressStartTrip,
}: TripStatsAtlasHeroProps): React.JSX.Element {
    const { locale, t } = useI18n();
    const toneSpec = resolveToneSpec(hero.tone);

    return (
        <View style={[tripStatsDashboardStyles.heroCard, styles.container]}>
            <PearlSurfaceOverlay
                accentWashColor={colors.pearlMist}
                baseBottomColor="#FFF7EF"
                baseTopColor={colors.pearlIvory}
                coolWashColor={colors.pearlSage}
                warmWashColor={colors.pearlPeach}
            />

            <View style={styles.content}>
                <View style={tripStatsDashboardStyles.heroHeader}>
                    <View style={tripStatsDashboardStyles.heroCopy}>
                        <Text style={tripStatsDashboardStyles.heroEyebrow}>
                            {t('tripStats.hero.kicker', 'Atlas journal')}
                        </Text>
                        <Text style={tripStatsDashboardStyles.heroTitle}>
                            {t('tripStats.hero.title', 'Travel Journal')}
                        </Text>
                        <Text style={tripStatsDashboardStyles.heroSubtitle}>
                            {resolveDescription(hero, locale, t)}
                        </Text>
                    </View>

                    <View
                        style={[
                            tripStatsDashboardStyles.heroBadge,
                            {
                                backgroundColor: toneSpec.badgeBackgroundColor,
                                borderColor: toneSpec.badgeBackgroundColor,
                            },
                        ]}
                    >
                        <ShieldCheck color={toneSpec.iconColor} size={14} />
                        <Text
                            style={[
                                tripStatsDashboardStyles.heroBadgeText,
                                { color: toneSpec.badgeTextColor },
                            ]}
                        >
                            {resolveStatusLabel(loading, isLocating, hero, t)}
                        </Text>
                    </View>
                </View>

                <View style={tripStatsDashboardStyles.heroBadgeRow}>
                    <MetricStamp
                        label={t('tripStats.hero.stampLabel', 'Route stamp')}
                        value={resolveStampLabel(hero, locale, t)}
                    />
                    <MetricStamp
                        label={t('tripStats.hero.safeLabel', 'Safe logs')}
                        value={String(hero.safeCount)}
                    />
                    <MetricStamp
                        label={t('tripStats.hero.totalLabel', 'Total scans')}
                        value={String(hero.analysisCount)}
                    />
                </View>

                <View style={styles.actionRow}>
                    <Pressable
                        accessibilityRole="button"
                        disabled={loading || isLocating}
                        onPress={onPressStartTrip}
                        style={({ pressed }) => [
                            styles.primaryAction,
                            pressed && !loading && !isLocating ? styles.actionPressed : null,
                            loading || isLocating ? styles.actionDisabled : null,
                        ]}
                    >
                        <Navigation color={colors.white} size={18} />
                        <Text style={styles.primaryActionText}>
                            {isLocating
                                ? t('tripStats.hero.verifyingLocation', 'Verifying location...')
                                : t('tripStats.action.primary', 'Start trip')}
                        </Text>
                    </Pressable>

                    <Pressable
                        accessibilityRole="button"
                        onPress={onPressHistory}
                        style={({ pressed }) => [
                            styles.secondaryAction,
                            pressed ? styles.actionPressed : null,
                        ]}
                    >
                        <Text style={styles.secondaryActionText}>
                            {t('tripStats.action.secondary', 'View history')}
                        </Text>
                        <ArrowRight color={colors.ink} size={16} />
                    </Pressable>
                </View>

                <Text style={styles.footerText}>
                    {t(
                        'tripStats.hero.footerNote',
                        'A calm atlas of route notes, safe counts, and trip memory.',
                    )}
                </Text>
            </View>
        </View>
    );
}

type MetricStampProps = {
    label: string;
    value: string;
};

const MetricStamp = ({ label, value }: MetricStampProps): React.JSX.Element => {
    return (
        <View style={styles.stamp}>
            <Text style={styles.stampLabel}>{label}</Text>
            <Text numberOfLines={2} style={styles.stampValue}>
                {value}
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
    stamp: {
        backgroundColor: colors.surfaceStrong,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.md,
        borderWidth: 1,
        flexBasis: '31%',
        flexGrow: 1,
        gap: spacing.xxs,
        minWidth: 84,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.sm,
    },
    stampLabel: {
        color: colors.inkSoft,
        fontSize: typography.micro,
        fontWeight: '700',
        letterSpacing: 0.7,
        lineHeight: 14,
        textTransform: 'uppercase',
    },
    stampValue: {
        color: colors.ink,
        fontSize: typography.bodyStrong,
        fontWeight: '800',
        lineHeight: 18,
    },
    actionRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    primaryAction: {
        alignItems: 'center',
        backgroundColor: colors.accentBlue,
        borderRadius: radii.lg,
        borderCurve: 'continuous',
        flex: 1,
        flexDirection: 'row',
        gap: spacing.xs,
        justifyContent: 'center',
        minHeight: 52,
        paddingHorizontal: spacing.md,
    },
    secondaryAction: {
        alignItems: 'center',
        backgroundColor: colors.surfaceStrong,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.lg,
        borderWidth: 1,
        flexDirection: 'row',
        gap: spacing.xs,
        justifyContent: 'center',
        minHeight: 52,
        minWidth: 136,
        paddingHorizontal: spacing.md,
    },
    actionPressed: {
        opacity: 0.86,
        transform: [{ scale: 0.987 }],
    },
    actionDisabled: {
        opacity: 0.64,
    },
    primaryActionText: {
        color: colors.white,
        fontSize: typography.bodyStrong,
        fontWeight: '800',
        lineHeight: 18,
    },
    secondaryActionText: {
        color: colors.ink,
        fontSize: typography.bodyStrong,
        fontWeight: '800',
        lineHeight: 18,
    },
    footerText: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        lineHeight: 18,
    },
});
