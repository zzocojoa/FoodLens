import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';

import HomeBackgroundAtmosphere from '../../home/components/HomeBackgroundAtmosphere';
import TripStatsAtlasHero from '../components/TripStatsAtlasHero';
import TripStatsCountryChapters, {
    type TripStatsCountryChapter,
} from '../components/TripStatsCountryChapters';
import TripStatsJournalRail from '../components/TripStatsJournalRail';
import TripStatsJourneyFeed, {
    type TripStatsJourneyFeedEntry,
} from '../components/TripStatsJourneyFeed';
import TripStatsPassportTotals from '../components/TripStatsPassportTotals';
import TripStatsToast from '../components/TripStatsToast';
import {
    tripStatsDashboardColors as colors,
    tripStatsDashboardSpacing as spacing,
    tripStatsDashboardTypography as typography,
} from '../components/tripStatsDashboardTokens';
import { tripStatsDashboardStyles } from '../components/tripStatsDashboardStyles';
import { useTripStatsScreen } from '../hooks/useTripStatsScreen';
import { type TripStatsScreenViewModel, type TripStatsTone } from '../types/tripStats.types';
import { formatCalendarDate } from '@/features/i18n';
import { useI18n } from '@/features/i18n';
import { navigateToStoredResult } from '@/services/navigation/resultEntryNavigation';

type TranslateFn = (key: string, fallback?: string) => string;

const buildFallbackViewModel = (): TripStatsScreenViewModel => ({
    hasActiveTrip: false,
    hero: {
        scope: 'allTime',
        tripStartDate: null,
        locationLabel: null,
        tone: 'neutral',
        analysisCount: 0,
        safeCount: 0,
        cautionCount: 0,
        dangerCount: 0,
        totalCount: 0,
        chapterCount: 0,
        recentJourneyCount: 0,
    },
    passportTotals: {
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
    },
    countryChapters: [],
    recentJourneyEntries: [],
});

const resolveChapterSignalLabel = (
    tone: TripStatsTone,
    safeCount: number,
    cautionCount: number,
    dangerCount: number,
    t: TranslateFn,
): string => {
    if (tone === 'danger') {
        return t('tripStats.chapters.dangerTemplate', 'Danger {count}').replace(
            '{count}',
            String(dangerCount),
        );
    }

    if (tone === 'caution') {
        return t('tripStats.chapters.cautionTemplate', 'Caution {count}').replace(
            '{count}',
            String(cautionCount),
        );
    }

    if (tone === 'safe') {
        return t('tripStats.chapters.safeTemplate', 'Safe {count}').replace(
            '{count}',
            String(safeCount),
        );
    }

    return t('tripStats.chapters.neutral', 'No scans');
};

const buildChapterSummary = (
    chapter: TripStatsScreenViewModel['countryChapters'][number],
    t: TranslateFn,
): string =>
    t(
        'tripStats.chapters.summaryTemplate',
        '{cities} cities, {count} scans, latest note from {location}.',
    )
        .replace('{cities}', String(chapter.cityCount))
        .replace('{count}', String(chapter.analysisCount))
        .replace('{location}', chapter.latestLocationLabel);

const buildChapterCards = (
    viewModel: TripStatsScreenViewModel,
    locale: string,
    t: TranslateFn,
): ReadonlyArray<TripStatsCountryChapter> =>
    viewModel.countryChapters.map((chapter) => ({
        id: chapter.id,
        chapterLabel: t('tripStats.chapters.chapterStampTemplate', 'Updated {date}').replace(
            '{date}',
            formatCalendarDate(chapter.lastVisitedAt, locale, { month: 'short', day: 'numeric' }),
        ),
        countryCode: chapter.countryCode,
        countryName: chapter.countryLabel,
        summary: buildChapterSummary(chapter, t),
        safeCount: chapter.safeCount,
        totalCount: chapter.analysisCount,
        signalLabel: resolveChapterSignalLabel(
            chapter.tone,
            chapter.safeCount,
            chapter.cautionCount,
            chapter.dangerCount,
            t,
        ),
        signalTone: chapter.tone,
    }));

const resolveFeedStatusLabel = (tone: TripStatsTone, t: TranslateFn): string => {
    if (tone === 'danger') {
        return t('tripStats.feed.dangerLabel', 'danger');
    }

    if (tone === 'caution') {
        return t('tripStats.feed.cautionLabel', 'caution');
    }

    if (tone === 'safe') {
        return t('tripStats.feed.safeLabel', 'safe');
    }

    return t('tripStats.chapters.neutral', 'No scans');
};

const resolveFeedSignalChip = (tone: TripStatsTone, t: TranslateFn): string => {
    if (tone === 'danger') {
        return t('tripStats.feed.dangerChip', 'Danger');
    }

    if (tone === 'caution') {
        return t('tripStats.feed.cautionChip', 'Caution');
    }

    if (tone === 'safe') {
        return t('tripStats.feed.safeChip', 'Safe');
    }

    return t('tripStats.chapters.neutral', 'No scans');
};

const buildFeedSummary = (
    foodName: string,
    tone: TripStatsTone,
    t: TranslateFn,
): string =>
    t('tripStats.feed.summaryTemplate', '{food} logged with a {status} verdict.')
        .replace('{food}', foodName)
        .replace('{status}', resolveFeedStatusLabel(tone, t));

const buildJourneyFeedEntries = (
    viewModel: TripStatsScreenViewModel,
    locale: string,
    t: TranslateFn,
): ReadonlyArray<TripStatsJourneyFeedEntry> =>
    viewModel.recentJourneyEntries.map((entry) => ({
        id: entry.id,
        countryName: entry.countryLabel,
        locationLabel: entry.locationLabel,
        dateLabel: formatCalendarDate(entry.timestamp, locale, { month: 'short', day: 'numeric' }),
        summary: buildFeedSummary(entry.foodName, entry.tone, t),
        signalLabel: resolveFeedSignalChip(entry.tone, t),
        signalTone: entry.tone,
    }));

export default function TripStatsScreen(): React.JSX.Element {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { locale, t } = useI18n();
    const journeyRecordByIdRef = React.useRef(
        new Map<string, TripStatsScreenViewModel['recentJourneyEntries'][number]['record']>(),
    );
    const handleOpenJourneyEntry = React.useCallback(
        (entryId: string): void => {
            const record = journeyRecordByIdRef.current.get(entryId);
            if (!record) {
                return;
            }

            navigateToStoredResult(router, record, { isBarcode: record.isBarcode });
        },
        [router],
    );
    const {
        currentLocation,
        clearStartFeedback,
        handleOpenHistory,
        handleOpenJourneyEntry: openJourneyEntry,
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
        onOpenJourneyEntry: handleOpenJourneyEntry,
    });

    const resolvedViewModel = viewModel ?? buildFallbackViewModel();
    journeyRecordByIdRef.current = new Map(
        resolvedViewModel.recentJourneyEntries.map((entry) => [entry.id, entry.record]),
    );
    const passportTotals = resolvedViewModel.passportTotals;
    const chapterCards = React.useMemo(
        () => buildChapterCards(resolvedViewModel, locale, t),
        [locale, resolvedViewModel, t],
    );
    const journeyFeedEntries = React.useMemo(
        () => buildJourneyFeedEntries(resolvedViewModel, locale, t),
        [locale, resolvedViewModel, t],
    );
    const contentPaddingBottom = Math.max(insets.bottom + 40, 48);
    const headerSubtitle = t(
        'tripStats.header.subtitle',
        'Safety snapshot'
    );

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

                    <TripStatsAtlasHero
                        hero={resolvedViewModel.hero}
                        isLocating={isLocating}
                        loading={loading}
                        onPressHistory={handleOpenHistory}
                        onPressStartTrip={handleStartNewTrip}
                    />

                    <TripStatsPassportTotals totals={passportTotals} />

                    <TripStatsCountryChapters
                        chapters={chapterCards}
                        emptyDescription={t(
                            'tripStats.chapters.emptyHint',
                            'Start a trip to build your journal.',
                        )}
                        emptyTitle={t('tripStats.chapters.emptyTitle', 'No chapters yet')}
                        meta={t('tripStats.chapters.subtitle', 'Trip notes, stops, and milestones.')}
                        onPressChapter={handleOpenHistory}
                        title={t('tripStats.chapters.title', 'Chapters')}
                    />

                    <TripStatsJourneyFeed
                        emptyDescription={t(
                            'tripStats.feed.emptyHint',
                            'Your trip feed will appear here.',
                        )}
                        emptyTitle={t('tripStats.feed.emptyTitle', 'No feed items yet')}
                        items={journeyFeedEntries}
                        meta={t(
                            'tripStats.feed.subtitle',
                            'Recent atlas updates and scan activity.',
                        )}
                        onPressItem={openJourneyEntry}
                        title={t('tripStats.feed.title', 'Feed')}
                    />
                </ScrollView>
                <TripStatsToast
                    currentLocation={startFeedbackLocation}
                    insetsTop={insets.top}
                    onHidden={clearStartFeedback}
                />
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
});
