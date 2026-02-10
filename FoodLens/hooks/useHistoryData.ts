import { useState, useEffect } from 'react';
import { AnalysisService } from '../services/analysisService';
import { getEmoji } from '../services/utils';
import { resolveImageUri } from '../services/imageStorage';
import { CountryData } from '../models/History';

export const useHistoryData = (userId: string) => {
    const [archiveData, setArchiveData] = useState<CountryData[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialRegion, setInitialRegion] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());

    const loadHistory = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const records = await AnalysisService.getAllAnalyses(userId);
            
            // Sort by timestamp descending
            records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            
            // 1. Find Initial Region 
            let foundRegion = null;
            for (const r of records) {
                if (r.location && r.location.latitude && r.location.longitude && (r.location.latitude !== 0 || r.location.longitude !== 0)) {
                    foundRegion = {
                        latitude: r.location.latitude,
                        longitude: r.location.longitude,
                        latitudeDelta: 50,
                        longitudeDelta: 50
                    };
                    break;
                }
            }
            if (foundRegion) {
                setInitialRegion(foundRegion);
            }

            // 2. Aggregation Logic
            const countryMap = new Map<string, CountryData>();
            
            records.forEach(record => {
                const hasLocation = !!record.location && !!record.location.country;
                const countryName = hasLocation ? record.location!.country! : "Uncategorized";
                const cityName = hasLocation ? (record.location!.city || record.location!.formattedAddress || "Unknown City") : "No Location Info";
                
                const statusUpper = record.safetyStatus?.toUpperCase() || '';
                const safetyType = statusUpper === 'SAFE' ? 'ok' : 
                                  (statusUpper === 'DANGER' || statusUpper === 'WARNING') ? 'avoid' : 'ask';
                
                const getFlag = (code?: string) => {
                    if (!code) return "📁";
                    return code.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
                };
                
                const itemData = {
                    id: record.id,
                    name: record.foodName,
                    type: safetyType as 'ok' | 'avoid' | 'ask',
                    date: record.timestamp.toLocaleDateString(),
                    emoji: getEmoji(record.foodName),
                    imageUri: resolveImageUri(record.imageUri) || undefined, // Resolve filename to full path
                    originalRecord: record
                };

                if (!countryMap.has(countryName)) {
                    const initialCoords = hasLocation && record.location ? [record.location.longitude || 0, record.location.latitude || 0] : [0, 0];
                    
                    countryMap.set(countryName, {
                        country: countryName,
                        flag: hasLocation ? getFlag(record.location?.isoCountryCode) : "📁",
                        total: 0,
                        coordinates: initialCoords,
                        regions: []
                    });
                }
                
                const countryEntry = countryMap.get(countryName)!;
                countryEntry.total += 1;
                
                if (hasLocation && record.location && countryEntry.coordinates[0] === 0 && countryEntry.coordinates[1] === 0) {
                     countryEntry.coordinates = [record.location.longitude || 0, record.location.latitude || 0];
                }

                let region = countryEntry.regions.find(r => r.name === cityName);
                if (!region) {
                    region = { name: cityName, items: [] };
                    countryEntry.regions.push(region);
                }
                region.items.push(itemData);
            });
            
            const aggregatedData = Array.from(countryMap.values());
            setArchiveData(aggregatedData);
            
            // Auto expand first
            if (aggregatedData.length > 0 && expandedCountries.size === 0) {
                 setExpandedCountries(new Set([`${aggregatedData[0].country}-0`]));
            }
            
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setLoading(false);
        }
    };

    const removeItemsLocally = (deletedIds: Set<string>) => {
        setArchiveData(prevData => {
            return prevData.map(country => {
                const newRegions = country.regions.map(region => ({
                    ...region,
                    items: region.items.filter(item => !deletedIds.has(item.id))
                })).filter(region => region.items.length > 0);
                
                const newTotal = newRegions.reduce((sum, r) => sum + r.items.length, 0);

                return {
                    ...country,
                    regions: newRegions,
                    total: newTotal
                };
            }).filter(country => country.total > 0);
        });
    };

    const deleteItem = async (itemId: string) => {
        // Optimistic Update
        removeItemsLocally(new Set([itemId]));
        
        try {
            await AnalysisService.deleteAnalysis(userId, itemId);
        } catch (e) {
            console.error("Failed to delete item", e);
            loadHistory(true); // Revert
        }
    };

    const deleteMultipleItems = async (itemIds: Set<string>) => {
        if (itemIds.size === 0) return;
        
        // Optimistic Update
        removeItemsLocally(itemIds);

        try {
            // Use batch deletion to prevent race conditions in concurrent storage writes
            await AnalysisService.deleteAnalyses(userId, Array.from(itemIds));
        } catch(e) { 
            console.error("Failed to delete items", e);
            loadHistory(true);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadHistory(true);
        setRefreshing(false);
    };

    useEffect(() => {
        loadHistory();
    }, [userId]);

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
