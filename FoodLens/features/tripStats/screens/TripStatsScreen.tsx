import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';

import HomeBackgroundAtmosphere from '../../home/components/HomeBackgroundAtmosphere';
import TripStatsJournalRail from '../components/TripStatsJournalRail';
import TripStatsPassportTotals from '../components/TripStatsPassportTotals';
import {
    tripStatsDashboardColors as colors,
    tripStatsDashboardSpacing as spacing,
    tripStatsDashboardTypography as typography,
} from '../components/tripStatsDashboardTokens';
import { tripStatsDashboardStyles } from '../components/tripStatsDashboardStyles';
import { useTripStatsScreen } from '../hooks/useTripStatsScreen';
import { useI18n } from '@/features/i18n';

export default function TripStatsScreen(): React.JSX.Element {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const handleIgnoredJourneyEntry = React.useCallback((_entryId: string): void => {}, []);
    const {
        currentLocation,
        handleOpenHistory,
        handleStartNewTrip,
        isLocating,
        loading,
        startFeedbackLocation,
        tripStartDate,
        viewModel,
    } = useTripStatsScreen({
        onOpenHistory: () => {
            router.push('/history');
        },
        onOpenJourneyEntry: handleIgnoredJourneyEntry,
    });

    const passportTotals = viewModel?.passportTotals ?? {
        totalAnalyses: 0,
        safeCount: 0,
        cautionCount: 0,
        dangerCount: 0,
        currentTripCount: 0,
        currentTripSafeCount: 0,
        currentTripCautionCount: 0,
        currentTripDangerCount: 0,
        countriesVisitedCount: 0,
        citiesVisitedCount: 0,
    };
    const contentPaddingBottom = Math.max(insets.bottom + 40, 48);
    const headerSubtitle = t(
        'tripStats.header.subtitle',
        'Safety snapshot'
    );
    const isActionDisabled = loading || isLocating;
    const primaryActionLabel = isLocating
        ? t('tripStats.hero.verifyingLocation', 'Verifying location...')
        : t('tripStats.action.primary', 'Start trip');
    const startFeedbackMessage = startFeedbackLocation
        ? t('tripStats.toast.nowExploringTemplate', 'Now exploring {location}').replace(
              '{location}',
              startFeedbackLocation,
          )
        : null;

    return (
        <View style={tripStatsDashboardStyles.screenBackground}>
            <Stack.Screen options={{ headerShown: false }} />
            <HomeBackgroundAtmosphere />
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                <StatusBar style="dark" />
                <ScrollView
                    contentContainerStyle={[
                        tripStatsDashboardStyles.scrollContent,
                        { paddingBottom: contentPaddingBottom },
                    ]}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.navRow}>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => router.back()}
                            style={({ pressed }) => [
                                styles.navButton,
                                pressed ? styles.navButtonPressed : null,
                            ]}
                        >
                            <ArrowLeft color={colors.ink} size={18} />
                        </Pressable>

                        <View style={styles.navCopy}>
                            <Text style={styles.navTitle}>
                                {t('tripStats.header.title', 'Trip Statistics')}
                            </Text>
                            <Text style={styles.navSubtitle}>
                                {headerSubtitle}
                            </Text>
                        </View>
                    </View>

                    <TripStatsJournalRail
                        currentLocation={currentLocation}
                        isLocating={isLocating}
                        loading={loading}
                        tripStartDate={tripStartDate}
                    />

                    <TripStatsPassportTotals totals={passportTotals} />

                    {startFeedbackMessage ? (
                        <View style={styles.startFeedbackCard}>
                            <View style={styles.startFeedbackIconWrap}>
                                <ShieldCheck color={colors.white} size={16} />
                            </View>
                            <View style={styles.startFeedbackCopy}>
                                <Text style={styles.startFeedbackTitle}>
                                    {t('tripStats.toast.startedTitle', 'Trip started!')}
                                </Text>
                                <Text style={styles.startFeedbackMessage}>{startFeedbackMessage}</Text>
                            </View>
                        </View>
                    ) : null}

                    <View style={styles.actionRow}>
                        <Pressable
                            accessibilityRole="button"
                            disabled={isActionDisabled}
                            onPress={handleStartNewTrip}
                            style={({ pressed }) => [
                                styles.primaryAction,
                                pressed && !isActionDisabled ? styles.actionPressed : null,
                                isActionDisabled ? styles.actionDisabled : null,
                            ]}
                        >
                            <Text style={styles.primaryActionText}>{primaryActionLabel}</Text>
                        </Pressable>

                        <Pressable
                            accessibilityRole="button"
                            onPress={handleOpenHistory}
                            style={({ pressed }) => [
                                styles.secondaryAction,
                                pressed ? styles.actionPressed : null,
                            ]}
                        >
                            <Text style={styles.secondaryActionText}>
                                {t('tripStats.action.secondary', 'View history')}
                            </Text>
                        </Pressable>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    navRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        justifyContent: 'space-between',
    },
    navButton: {
        alignItems: 'center',
        backgroundColor: colors.surfaceStrong,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: 18,
        borderWidth: 1,
        height: 40,
        justifyContent: 'center',
        width: 40,
    },
    navButtonPressed: {
        opacity: 0.84,
        transform: [{ scale: 0.97 }],
    },
    navCopy: {
        flex: 1,
        gap: 2,
        minWidth: 0,
    },
    navTitle: {
        color: colors.ink,
        fontSize: typography.bodyStrong,
        fontWeight: '800',
        lineHeight: 18,
    },
    navSubtitle: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        lineHeight: 16,
        textTransform: 'uppercase',
        letterSpacing: 0.7,
    },
    startFeedbackCard: {
        alignItems: 'center',
        backgroundColor: colors.accentGreenSoft,
        borderColor: colors.lineStrong,
        borderCurve: 'continuous',
        borderRadius: 18,
        borderWidth: 1,
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    startFeedbackIconWrap: {
        alignItems: 'center',
        backgroundColor: colors.accentGreen,
        borderRadius: 999,
        height: 28,
        justifyContent: 'center',
        width: 28,
    },
    startFeedbackCopy: {
        flex: 1,
        gap: 2,
    },
    startFeedbackTitle: {
        color: colors.accentGreen,
        fontSize: typography.caption,
        fontWeight: '800',
        letterSpacing: 0.5,
        lineHeight: 16,
        textTransform: 'uppercase',
    },
    startFeedbackMessage: {
        color: colors.ink,
        fontSize: typography.bodyStrong,
        fontWeight: '700',
        lineHeight: 18,
    },
    actionRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    primaryAction: {
        alignItems: 'center',
        backgroundColor: colors.accentBlue,
        borderColor: colors.accentBlue,
        borderCurve: 'continuous',
        borderRadius: 18,
        borderWidth: 1,
        flex: 1,
        justifyContent: 'center',
        minHeight: 48,
        paddingHorizontal: spacing.md,
    },
    secondaryAction: {
        alignItems: 'center',
        backgroundColor: colors.surfaceStrong,
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: 18,
        borderWidth: 1,
        flex: 1,
        justifyContent: 'center',
        minHeight: 48,
        paddingHorizontal: spacing.md,
    },
    primaryActionText: {
        color: colors.white,
        fontSize: typography.bodyStrong,
        fontWeight: '700',
        lineHeight: 18,
    },
    secondaryActionText: {
        color: colors.ink,
        fontSize: typography.bodyStrong,
        fontWeight: '700',
        lineHeight: 18,
    },
    actionPressed: {
        opacity: 0.84,
        transform: [{ scale: 0.98 }],
    },
    actionDisabled: {
        opacity: 0.56,
    },
});
