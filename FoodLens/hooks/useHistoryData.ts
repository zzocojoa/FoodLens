import { useState, useEffect, useCallback } from 'react';
import type { Region } from 'react-native-maps';
import { AnalysisService } from '../services/analysisService';
import { CountryData } from '../models/History';
import {
    aggregateHistoryByCountry,
    buildInitialRegion,
    removeItemsFromArchive,
} from './historyDataUtils';

const LOAD_ERROR_LOG = '[HistoryData] Failed to load history';
const DELETE_ERROR_LOG = '[HistoryData] Failed to delete item';
const BULK_DELETE_ERROR_LOG = '[HistoryData] Failed to delete items';

export const useHistoryData = (userId: string) => {
    const [archiveData, setArchiveData] = useState<CountryData[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialRegion, setInitialRegion] = useState<Region | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());

    const loadHistory = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const records = await AnalysisService.getAllAnalyses(userId);
            
            // Sort by timestamp descending
            records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            const foundRegion = buildInitialRegion(records);
            if (foundRegion) {
                setInitialRegion(foundRegion);
            }

            const aggregatedData = aggregateHistoryByCountry(records);
            setArchiveData(aggregatedData);
            
            // Auto expand first
            if (aggregatedData.length > 0 && expandedCountries.size === 0) {
                 setExpandedCountries(new Set([`${aggregatedData[0].country}-0`]));
            }
            
        } catch (error) {
            console.error(LOAD_ERROR_LOG, error);
        } finally {
            setLoading(false);
        }
    }, [expandedCountries.size, userId]);

    const removeItemsLocally = useCallback((deletedIds: Set<string>) => {
        setArchiveData(prevData => {
            return removeItemsFromArchive(prevData, deletedIds);
        });
    }, []);

    const deleteItem = useCallback(async (itemId: string) => {
        // Optimistic Update
        removeItemsLocally(new Set([itemId]));
        
        try {
            await AnalysisService.deleteAnalysis(userId, itemId);
        } catch (error) {
            console.error(DELETE_ERROR_LOG, error);
            loadHistory(true); // Revert
        }
    }, [loadHistory, removeItemsLocally, userId]);

    const deleteMultipleItems = useCallback(async (itemIds: Set<string>) => {
        if (itemIds.size === 0) return;
        
        // Optimistic Update
        removeItemsLocally(itemIds);

        try {
            // Use batch deletion to prevent race conditions in concurrent storage writes
            await AnalysisService.deleteAnalyses(userId, Array.from(itemIds));
        } catch (error) {
            console.error(BULK_DELETE_ERROR_LOG, error);
            loadHistory(true);
        }
    }, [loadHistory, removeItemsLocally, userId]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadHistory(true);
        setRefreshing(false);
    }, [loadHistory]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    return {
        archiveData,
        setArchiveData,
        loading,
        initialRegion,
        refreshing,
        onRefresh,
        loadHistory,
        expandedCountries,
        setExpandedCountries,
        deleteItem,
        deleteMultipleItems
    };
};
