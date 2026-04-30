import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Region } from 'react-native-maps';
import {
    HISTORY_QUERY_REFRESH_INTERVAL_MS,
    useHistoryQuery,
} from './queries/useHistoryQuery';
import { useDeleteAnalysisMutation } from './mutations/useAnalysisMutations';
import { useI18n } from '@/features/i18n';
import { AnalysisService, type HistoryCloudSyncStatus } from '@/services/analysisService';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import {
    aggregateHistoryByCountry,
    buildHistoryArchiveViewModel,
    buildInitialRegion,
} from './historyDataUtils';

type UseHistoryDataOptions = {
    isPollingEnabled: boolean;
};

type Translate = ReturnType<typeof useI18n>['t'];

const isRefreshStale = (lastLoadedAtMs: number, refreshWindowMs: number): boolean => {
    if (lastLoadedAtMs <= 0) {
        return true;
    }

    return Date.now() - lastLoadedAtMs >= refreshWindowMs;
};

const showHistoryRefreshAlert = (t: Translate, status: HistoryCloudSyncStatus): void => {
    if (status === 'synced' || status === 'stale_user') {
        return;
    }

    if (status === 'auth_required') {
        showTranslatedAlert(t, {
            titleKey: 'history.alert.refreshAuthRequiredTitle',
            titleFallback: 'Login required',
            messageKey: 'history.alert.refreshAuthRequiredMessage',
            messageFallback: 'Please sign in again to refresh your history from the server.',
        });
        return;
    }

    showTranslatedAlert(t, {
        titleKey: 'history.alert.refreshUnavailableTitle',
        titleFallback: 'History not updated',
        messageKey: 'history.alert.refreshUnavailableMessage',
        messageFallback: 'Could not reach the server. Showing saved records on this device.',
    });
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
    const [manualRefreshing, setManualRefreshing] = useState(false);
    const hasAutoExpandedInitialCountryRef = useRef(false);
    const isMountedRef = useRef(true);
    const manualRefreshPromiseRef = useRef<Promise<void> | null>(null);
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
        return () => {
            isMountedRef.current = false;
        };
    }, []);

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

    const onRefresh = useCallback((): Promise<void> => {
        if (manualRefreshPromiseRef.current) {
            return manualRefreshPromiseRef.current;
        }

        setManualRefreshing(true);
        let refreshPromise: Promise<void>;
        refreshPromise = AnalysisService.syncHistoryFromCloudWithStatus(userId, { force: true })
            .then((result) => {
                showHistoryRefreshAlert(t, result.status);
            })
            .finally(() => {
                if (manualRefreshPromiseRef.current === refreshPromise) {
                    manualRefreshPromiseRef.current = null;
                }
                if (isMountedRef.current) {
                    setManualRefreshing(false);
                }
            });
        manualRefreshPromiseRef.current = refreshPromise;
        return refreshPromise;
    }, [t, userId]);

    return {
        archiveData,
        atlasSummary: archiveViewModel.atlasSummary,
        countryChapters: archiveViewModel.countryChapters,
        journalSummary: archiveViewModel.journalSummary,
        loading,
        initialRegion,
        refreshing: refreshing || manualRefreshing,
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
