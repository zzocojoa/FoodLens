import { UserProfile } from '@/models/User';
import { AnalysisRecord } from '@/services/analysis/types';

import {
    TripStatsCountryChapter,
    TripStatsHeroScope,
    TripStatsHeroSummary,
    TripStatsJourneyEntry,
    TripStatsPassportTotals,
    TripStatsScreenViewModel,
    TripStatsTone,
} from '../types/tripStats.types';

type SafetyCountTotals = {
    safeCount: number;
    cautionCount: number;
    dangerCount: number;
    totalCount: number;
};

type TripSafetyCountTotals = SafetyCountTotals & {
    currentTripCount: number;
    currentTripSafeCount: number;
    currentTripCautionCount: number;
    currentTripDangerCount: number;
};

type CountryChapterAccumulator = {
    countryCode: string;
    countryLabel: string;
    latestLocationLabel: string;
    safeCount: number;
    cautionCount: number;
    dangerCount: number;
    cityLabels: Set<string>;
    currentTripCount: number;
    firstVisitedAt: Date;
    lastVisitedAt: Date;
    recentEntries: TripStatsJourneyEntry[];
};

const JOURNEY_ENTRY_LIMIT = 6;
const CHAPTER_RECENT_ENTRY_LIMIT = 3;

const resolveTripStartDate = (user: UserProfile | null): Date | null => {
    const tripStart = user?.currentTripStart?.trim() ?? '';
    if (tripStart.length === 0) {
        return null;
    }

    const tripStartDate = new Date(tripStart);
    if (Number.isNaN(tripStartDate.getTime())) {
        return null;
    }

    return tripStartDate;
};

const resolveTripStartTime = (user: UserProfile | null): number | null => {
    const tripStartDate = resolveTripStartDate(user);
    return tripStartDate ? tripStartDate.getTime() : null;
};

const resolvePreferredFoodName = (analysis: AnalysisRecord, language: string | null | undefined): string => {
    const normalizedLanguage = typeof language === 'string' ? language.trim().toLowerCase() : '';

    if (normalizedLanguage.startsWith('ko')) {
        return analysis.foodName_ko || analysis.foodName_en || analysis.foodName;
    }

    return analysis.foodName_en || analysis.foodName_ko || analysis.foodName;
};

const resolveCountryCode = (analysis: AnalysisRecord): string => {
    const isoCountryCode = analysis.location?.isoCountryCode?.trim().toUpperCase() ?? '';
    if (isoCountryCode.length > 0) {
        return isoCountryCode;
    }

    const country = analysis.location?.country?.trim().toUpperCase() ?? '';
    if (country.length > 0) {
        return country;
    }

    return 'UNKNOWN';
};

const resolveCountryLabel = (analysis: AnalysisRecord): string => {
    const country = analysis.location?.country?.trim() ?? '';
    if (country.length > 0) {
        return country;
    }

    return 'Unknown country';
};

const resolveCityLabel = (analysis: AnalysisRecord): string | null => {
    const city = analysis.location?.city?.trim() ?? '';
    if (city.length > 0) {
        return city;
    }

    const district = analysis.location?.district?.trim() ?? '';
    if (district.length > 0) {
        return district;
    }

    const subregion = analysis.location?.subregion?.trim() ?? '';
    if (subregion.length > 0) {
        return subregion;
    }

    return null;
};

const resolveLocationLabel = (analysis: AnalysisRecord): string => {
    const cityLabel = resolveCityLabel(analysis);
    const countryLabel = resolveCountryLabel(analysis);

    if (cityLabel) {
        return `${cityLabel}, ${countryLabel}`;
    }

    return countryLabel;
};

const resolveToneFromSafetyStatus = (safetyStatus: AnalysisRecord['safetyStatus']): TripStatsTone => {
    if (safetyStatus === 'SAFE') {
        return 'safe';
    }

    if (safetyStatus === 'CAUTION') {
        return 'caution';
    }

    if (safetyStatus === 'DANGER') {
        return 'danger';
    }

    return 'neutral';
};

const resolveToneFromCounts = (
    safeCount: number,
    cautionCount: number,
    dangerCount: number,
): TripStatsTone => {
    if (dangerCount > 0) {
        return 'danger';
    }

    if (cautionCount > 0) {
        return 'caution';
    }

    if (safeCount > 0) {
        return 'safe';
    }

    return 'neutral';
};

const isCurrentTripAnalysis = (analysis: AnalysisRecord, tripStartTime: number | null): boolean => {
    if (tripStartTime === null) {
        return false;
    }

    return analysis.timestamp.getTime() >= tripStartTime;
};

const compareByMostRecent = (left: AnalysisRecord, right: AnalysisRecord): number => {
    return right.timestamp.getTime() - left.timestamp.getTime();
};

const countSafetyTotals = (analyses: ReadonlyArray<AnalysisRecord>): SafetyCountTotals => {
    let safeCount = 0;
    let cautionCount = 0;
    let dangerCount = 0;

    for (const analysis of analyses) {
        if (analysis.safetyStatus === 'SAFE') {
            safeCount += 1;
            continue;
        }

        if (analysis.safetyStatus === 'CAUTION') {
            cautionCount += 1;
            continue;
        }

        dangerCount += 1;
    }

    return {
        safeCount,
        cautionCount,
        dangerCount,
        totalCount: analyses.length,
    };
};

const countTripSafetyTotals = (
    analyses: ReadonlyArray<AnalysisRecord>,
    tripStartTime: number | null,
): TripSafetyCountTotals => {
    const allTimeTotals = countSafetyTotals(analyses);
    const currentTripAnalyses = tripStartTime === null
        ? []
        : analyses.filter((analysis) => isCurrentTripAnalysis(analysis, tripStartTime));
    const currentTripTotals = countSafetyTotals(currentTripAnalyses);

    return {
        ...allTimeTotals,
        currentTripCount: currentTripTotals.totalCount,
        currentTripSafeCount: currentTripTotals.safeCount,
        currentTripCautionCount: currentTripTotals.cautionCount,
        currentTripDangerCount: currentTripTotals.dangerCount,
    };
};

const buildJourneyEntry = (
    analysis: AnalysisRecord,
    language: string | null | undefined,
    tripStartTime: number | null,
): TripStatsJourneyEntry => {
    const countryCode = resolveCountryCode(analysis);
    const countryLabel = resolveCountryLabel(analysis);
    const cityLabel = resolveCityLabel(analysis);

    return {
        id: analysis.id,
        record: analysis,
        foodName: resolvePreferredFoodName(analysis, language),
        safetyStatus: analysis.safetyStatus,
        tone: resolveToneFromSafetyStatus(analysis.safetyStatus),
        timestamp: analysis.timestamp,
        locationLabel: resolveLocationLabel(analysis),
        countryCode,
        countryLabel,
        cityLabel,
        imageUri: analysis.imageUri ?? null,
        isCurrentTrip: isCurrentTripAnalysis(analysis, tripStartTime),
    };
};

const buildCountryChapters = (
    analyses: ReadonlyArray<AnalysisRecord>,
    language: string | null | undefined,
    tripStartTime: number | null,
): TripStatsCountryChapter[] => {
    const chapterByCountry = new Map<string, CountryChapterAccumulator>();
    const sortedAnalyses = [...analyses].sort(compareByMostRecent);

    for (const analysis of sortedAnalyses) {
        const countryCode = resolveCountryCode(analysis);
        const countryLabel = resolveCountryLabel(analysis);
        const entry = buildJourneyEntry(analysis, language, tripStartTime);
        const current = chapterByCountry.get(countryCode);

        if (!current) {
            const cityLabels = new Set<string>();
            if (entry.cityLabel) {
                cityLabels.add(entry.cityLabel);
            }

            chapterByCountry.set(countryCode, {
                countryCode,
                countryLabel,
                latestLocationLabel: entry.locationLabel,
                safeCount: analysis.safetyStatus === 'SAFE' ? 1 : 0,
                cautionCount: analysis.safetyStatus === 'CAUTION' ? 1 : 0,
                dangerCount: analysis.safetyStatus === 'DANGER' ? 1 : 0,
                cityLabels,
                currentTripCount: entry.isCurrentTrip ? 1 : 0,
                firstVisitedAt: analysis.timestamp,
                lastVisitedAt: analysis.timestamp,
                recentEntries: [entry],
            });
            continue;
        }

        if (analysis.safetyStatus === 'SAFE') {
            current.safeCount += 1;
        } else if (analysis.safetyStatus === 'CAUTION') {
            current.cautionCount += 1;
        } else {
            current.dangerCount += 1;
        }

        if (entry.cityLabel) {
            current.cityLabels.add(entry.cityLabel);
        }

        if (entry.isCurrentTrip) {
            current.currentTripCount += 1;
        }

        if (analysis.timestamp.getTime() < current.firstVisitedAt.getTime()) {
            current.firstVisitedAt = analysis.timestamp;
        }

        if (analysis.timestamp.getTime() > current.lastVisitedAt.getTime()) {
            current.lastVisitedAt = analysis.timestamp;
            current.latestLocationLabel = entry.locationLabel;
        }

        if (current.recentEntries.length < CHAPTER_RECENT_ENTRY_LIMIT) {
            current.recentEntries.push(entry);
        }
    }

    return [...chapterByCountry.values()]
        .sort((left, right) => right.lastVisitedAt.getTime() - left.lastVisitedAt.getTime())
        .map((chapter) => {
            const analysisCount = chapter.safeCount + chapter.cautionCount + chapter.dangerCount;

            return {
                id: chapter.countryCode,
                countryCode: chapter.countryCode,
                countryLabel: chapter.countryLabel,
                latestLocationLabel: chapter.latestLocationLabel,
                analysisCount,
                safeCount: chapter.safeCount,
                cautionCount: chapter.cautionCount,
                dangerCount: chapter.dangerCount,
                cityCount: chapter.cityLabels.size,
                currentTripCount: chapter.currentTripCount,
                tone: resolveToneFromCounts(chapter.safeCount, chapter.cautionCount, chapter.dangerCount),
                firstVisitedAt: chapter.firstVisitedAt,
                lastVisitedAt: chapter.lastVisitedAt,
                recentEntries: chapter.recentEntries,
            };
        });
};

const buildRecentJourneyEntries = (
    analyses: ReadonlyArray<AnalysisRecord>,
    language: string | null | undefined,
    tripStartTime: number | null,
): TripStatsJourneyEntry[] => {
    return [...analyses]
        .sort(compareByMostRecent)
        .slice(0, JOURNEY_ENTRY_LIMIT)
        .map((analysis) => buildJourneyEntry(analysis, language, tripStartTime));
};

const countUniqueVisitedCities = (countryChapters: ReadonlyArray<TripStatsCountryChapter>): number => {
    return countryChapters.reduce((count, chapter) => count + chapter.cityCount, 0);
};

const buildPassportTotals = (
    safetyTotals: TripSafetyCountTotals,
    countryChapters: ReadonlyArray<TripStatsCountryChapter>,
): TripStatsPassportTotals => {
    return {
        totalAnalyses: safetyTotals.totalCount,
        safeCount: safetyTotals.safeCount,
        cautionCount: safetyTotals.cautionCount,
        dangerCount: safetyTotals.dangerCount,
        currentTripCount: safetyTotals.currentTripCount,
        currentTripSafeCount: safetyTotals.currentTripSafeCount,
        currentTripCautionCount: safetyTotals.currentTripCautionCount,
        currentTripDangerCount: safetyTotals.currentTripDangerCount,
        countriesVisitedCount: countryChapters.length,
        citiesVisitedCount: countUniqueVisitedCities(countryChapters),
    };
};

const resolveHeroScope = (tripStartTime: number | null): TripStatsHeroScope => {
    if (tripStartTime !== null) {
        return 'currentTrip';
    }

    return 'allTime';
};

const buildHeroSummary = (
    user: UserProfile | null,
    passportTotals: TripStatsPassportTotals,
    countryChapters: ReadonlyArray<TripStatsCountryChapter>,
    recentJourneyEntries: ReadonlyArray<TripStatsJourneyEntry>,
): TripStatsHeroSummary => {
    const scope = resolveHeroScope(resolveTripStartTime(user));
    const isCurrentTripScope = scope === 'currentTrip';
    const currentTripChapterCount = countryChapters.filter((chapter) => chapter.currentTripCount > 0).length;
    const analysisCount = isCurrentTripScope ? passportTotals.currentTripCount : passportTotals.totalAnalyses;
    const safeCount = isCurrentTripScope ? passportTotals.currentTripSafeCount : passportTotals.safeCount;
    const cautionCount = isCurrentTripScope
        ? passportTotals.currentTripCautionCount
        : passportTotals.cautionCount;
    const dangerCount = isCurrentTripScope
        ? passportTotals.currentTripDangerCount
        : passportTotals.dangerCount;

    return {
        scope,
        tripStartDate: resolveTripStartDate(user),
        locationLabel: user?.currentTripLocation?.trim() || null,
        tone: resolveToneFromCounts(safeCount, cautionCount, dangerCount),
        analysisCount,
        safeCount,
        cautionCount,
        dangerCount,
        totalCount: analysisCount,
        chapterCount: isCurrentTripScope ? currentTripChapterCount : countryChapters.length,
        recentJourneyCount: recentJourneyEntries.length,
    };
};

export const countSafeAnalysesFromStart = (
    analyses: ReadonlyArray<{ timestamp: string | Date; safetyStatus: string }>,
    startTime: number,
): number => {
    return analyses.filter((item) => new Date(item.timestamp).getTime() >= startTime && item.safetyStatus === 'SAFE').length;
};

export const countSafeAnalysesTotal = (
    analyses: ReadonlyArray<{ safetyStatus: string }>,
): number => {
    return analyses.filter((item) => item.safetyStatus === 'SAFE').length;
};

export const buildLocationLabel = (
    place: { city?: string | null; region?: string | null; country?: string | null } | null | undefined,
    fallback: string,
): string => {
    if (!place) {
        return fallback;
    }

    const first = place.city || place.region || '';
    const second = place.country || '';
    let value = `${first}, ${second}`;

    if (value.startsWith(', ')) {
        value = value.substring(2);
    }

    if (value.endsWith(', ')) {
        value = value.substring(0, value.length - 2);
    }

    return value || fallback;
};

export const buildTripStatsJourneyEntries = (
    analyses: ReadonlyArray<AnalysisRecord>,
    userLanguage: string | null | undefined,
    tripStartTime: number | null,
): TripStatsJourneyEntry[] => {
    return buildRecentJourneyEntries(analyses, userLanguage, tripStartTime);
};

export const buildTripStatsCountryChapters = (
    analyses: ReadonlyArray<AnalysisRecord>,
    userLanguage: string | null | undefined,
    tripStartTime: number | null,
): TripStatsCountryChapter[] => {
    return buildCountryChapters(analyses, userLanguage, tripStartTime);
};

export const buildTripStatsPassportTotals = (
    analyses: ReadonlyArray<AnalysisRecord>,
    tripStartTime: number | null,
): TripStatsPassportTotals => {
    const safetyTotals = countTripSafetyTotals(analyses, tripStartTime);
    const countryChapters = buildCountryChapters(analyses, null, tripStartTime);

    return buildPassportTotals(safetyTotals, countryChapters);
};

export const buildTripStatsScreenViewModel = (
    user: UserProfile | null,
    analyses: ReadonlyArray<AnalysisRecord>,
): TripStatsScreenViewModel => {
    const tripStartTime = resolveTripStartTime(user);
    const language = user?.settings.language ?? null;
    const countryChapters = buildCountryChapters(analyses, language, tripStartTime);
    const recentJourneyEntries = buildRecentJourneyEntries(analyses, language, tripStartTime);
    const safetyTotals = countTripSafetyTotals(analyses, tripStartTime);
    const passportTotals = buildPassportTotals(safetyTotals, countryChapters);

    return {
        hasActiveTrip: tripStartTime !== null,
        hero: buildHeroSummary(user, passportTotals, countryChapters, recentJourneyEntries),
        passportTotals,
        countryChapters,
        recentJourneyEntries,
    };
};
