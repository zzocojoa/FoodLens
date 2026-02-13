import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Region } from 'react-native-maps';
import { useHistoryQuery } from './queries/useHistoryQuery';
import { useDeleteAnalysisMutation } from './mutations/useAnalysisMutations';
import {
    aggregateHistoryByCountry,
    buildInitialRegion,
    removeItemsFromArchive,
} from './historyDataUtils';

export const useHistoryData = (userId: string) => {
    const { 
        data: records = [], 
        isLoading: loading, 
        refetch, 
        isRefetching: refreshing 
    } = useHistoryQuery(userId);

    const deleteMutation = useDeleteAnalysisMutation(userId);

    const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
    const hasAutoExpandedInitialCountryRef = useRef(false);

    const archiveData = useMemo(() => {
        return aggregateHistoryByCountry(records);
    }, [records]);

    useEffect(() => {
        // Expand the first country only once on initial load.
        // Users should still be able to collapse all folders afterward.
        if (hasAutoExpandedInitialCountryRef.current) return;
        if (archiveData.length === 0) return;
        if (expandedCountries.size > 0) return;

        setExpandedCountries(new Set([`${archiveData[0].country}-0`]));
        hasAutoExpandedInitialCountryRef.current = true;
    }, [archiveData, expandedCountries.size]);

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
        loading,
        initialRegion,
        refreshing,
        onRefresh,
        loadHistory: refetch,
        expandedCountries,
        setExpandedCountries,
        deleteItem,
        deleteMultipleItems
    };
};
