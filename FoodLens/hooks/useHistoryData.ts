import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Region } from 'react-native-maps';
import {
    HISTORY_QUERY_REFRESH_INTERVAL_MS,
    useHistoryQuery,
} from './queries/useHistoryQuery';
import { useDeleteAnalysisMutation } from './mutations/useAnalysisMutations';
import { useI18n } from '@/features/i18n';
import {
    aggregateHistoryByCountry,
    buildHistoryArchiveViewModel,
    buildInitialRegion,
} from './historyDataUtils';

type UseHistoryDataOptions = {
    isPollingEnabled: boolean;
};

const isRefreshStale = (lastLoadedAtMs: number, refreshWindowMs: number): boolean => {
    if (lastLoadedAtMs <= 0) {
        return true;
    }

    return Date.now() - lastLoadedAtMs >= refreshWindowMs;
};

export const useHistoryData = (userId: string, options: UseHistoryDataOptions) => {
    const { isPollingEnabled } = options;
    const { locale, t } = useI18n();
    const { 
        data: records = [], 
        dataUpdatedAt,
        isLoading: loading, 
        refetch, 
        isRefetching: refreshing 
    } = useHistoryQuery(userId, { isPollingEnabled });

    const deleteMutation = useDeleteAnalysisMutation(userId);

    const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
    const hasAutoExpandedInitialCountryRef = useRef(false);
    const previousPollingEnabledRef = useRef(isPollingEnabled);

    const archiveData = useMemo(() => {
        return aggregateHistoryByCountry(records, locale, t);
    }, [records, locale, t]);
    const archiveViewModel = useMemo(() => {
        return buildHistoryArchiveViewModel(records, archiveData, locale, t);
    }, [archiveData, locale, records, t]);

    useEffect(() => {
        // Expand the first country only once on initial load.
        // Users should still be able to collapse all folders afterward.
        if (hasAutoExpandedInitialCountryRef.current) return;
        if (archiveViewModel.countryChapters.length === 0) return;
        if (expandedCountries.size > 0) return;

        setExpandedCountries(new Set([archiveViewModel.countryChapters[0].id]));
        hasAutoExpandedInitialCountryRef.current = true;
    }, [archiveViewModel.countryChapters, expandedCountries.size]);

    useEffect(() => {
        const wasPollingEnabled = previousPollingEnabledRef.current;
        previousPollingEnabledRef.current = isPollingEnabled;

        if (
            !wasPollingEnabled &&
            isPollingEnabled &&
            isRefreshStale(dataUpdatedAt, HISTORY_QUERY_REFRESH_INTERVAL_MS)
        ) {
            void refetch();
        }
    }, [dataUpdatedAt, isPollingEnabled, refetch]);

    const initialRegion = useMemo(() => buildInitialRegion(records), [records]);

    const deleteItem = useCallback(async (itemId: string) => {
        await deleteMutation.mutateAsync([itemId]);
    }, [deleteMutation]);

    const deleteMultipleItems = useCallback(async (itemIds: Set<string>) => {
        if (itemIds.size === 0) return;
        await deleteMutation.mutateAsync(Array.from(itemIds));
    }, [deleteMutation]);

    const onRefresh = useCallback(async () => {
        await refetch();
    }, [refetch]);

    return {
        archiveData,
        atlasSummary: archiveViewModel.atlasSummary,
        countryChapters: archiveViewModel.countryChapters,
        journalSummary: archiveViewModel.journalSummary,
        loading,
        initialRegion,
        refreshing,
        recentEntries: archiveViewModel.recentEntries,
        records,
        onRefresh,
        loadHistory: refetch,
        expandedCountries,
        setExpandedCountries,
        deleteItem,
        deleteMultipleItems
    };
};
