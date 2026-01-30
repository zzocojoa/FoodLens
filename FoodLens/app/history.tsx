import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, LayoutAnimation, Platform, UIManager, Alert, ActivityIndicator, Animated, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Globe, List, ChevronDown, ShieldCheck, AlertCircle, MapPin, Trash2, Circle, CheckCircle } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';

import { AnalysisService, AnalysisRecord } from '../services/analysisService';

import { dataStore } from '../services/dataStore';
import { auth } from '../services/firebaseConfig';
import { THEME } from '../constants/theme';
import { getEmoji } from '../services/utils';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface RegionData {
    name: string;
    items: {
        id: string; // Changed to string for ID
        name: string;
        type: 'safe' | 'danger' | 'caution';
        date: string;
        emoji: string;
        originalRecord: AnalysisRecord;
    }[];
}

interface CountryData {
    country: string;
    flag: string;
    total: number;
    coordinates: number[];
    regions: RegionData[];
}



export default function HistoryScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    
    // Map Ref
    const mapRef = useRef<MapView>(null);

    const [archiveMode, setArchiveMode] = useState<'map' | 'list'>('map');
    const [archiveFilter, setArchiveFilter] = useState<'all' | 'safe' | 'danger'>('all');
    const [archiveData, setArchiveData] = useState<CountryData[]>([]); // Dynamic Data
    const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    
    // Map State for Robustness
    const [isMapReady, setIsMapReady] = useState(false);
    const [isMapError, setIsMapError] = useState(false);
    const [mapReloadKey, setMapReloadKey] = useState(0);

    // Batch Delete State
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const swipeableRefs = useRef<Map<string, any>>(new Map());
    const [refreshing, setRefreshing] = useState(false);

    const TEST_UID = "test-user-v1"; // Should utilize Context/auth in real app

    useEffect(() => {
        loadHistory();
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadHistory(true); // Silent mode fetch
        setRefreshing(false);
    };

    const loadHistory = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const records = await AnalysisService.getAllAnalyses(TEST_UID);
            
            // Aggregation Logic
            const countryMap = new Map<string, CountryData>();
            
            records.forEach(record => {
                const countryName = record.location?.country || "Unknown Location";
                const cityName = record.location?.city || "Unknown City";
                const safetyType = record.safetyStatus.toLowerCase() as 'safe' | 'danger' | 'caution';
                
                // Helper to get flag/emoji
                const getFlag = (code?: string) => {
                    if (!code) return "🏳️";
                    return code.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
                };
                
                // Prepare Item
                const itemData = {
                    id: record.id,
                    name: record.foodName,
                    type: safetyType,
                    date: record.timestamp.toLocaleDateString(), // simplified
                    emoji: getEmoji(record.foodName),
                    originalRecord: record
                };

                if (!countryMap.has(countryName)) {
                    countryMap.set(countryName, {
                        country: countryName,
                        flag: getFlag(record.location?.isoCountryCode),
                        total: 0,
                        coordinates: [record.location?.longitude || 0, record.location?.latitude || 0], // Use first seen coords as pin
                        regions: []
                    });
                }
                
                const countryEntry = countryMap.get(countryName)!;
                countryEntry.total += 1;
                
                // Find or create region
                let region = countryEntry.regions.find(r => r.name === cityName);
                if (!region) {
                    region = { name: cityName, items: [] };
                    countryEntry.regions.push(region);
                }
                region.items.push(itemData);
            });
            
            const aggregatedData = Array.from(countryMap.values());
            setArchiveData(aggregatedData);
            
            // Auto expand first if exists and not already set
            if (aggregatedData.length > 0 && !expandedCountry) {
                setExpandedCountry(`${aggregatedData[0].country}-0`);
            }
            
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setLoading(false);
        }
    };

    const getFoodEmoji = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('noodle') || n.includes('ramen')) return '🍜';
        if (n.includes('sushi')) return '🍣';
        if (n.includes('burger')) return '🍔';
        if (n.includes('pizza')) return '🍕';
        if (n.includes('salad')) return '🥗';
        if (n.includes('croissant')) return '🥐';
        if (n.includes('rice')) return '🍚';
        return '🍽️';
    };

    useEffect(() => {
        // Timeout watchdog: If map doesn't load in 10s, assume network error
        let timeout: ReturnType<typeof setTimeout>;
        if (archiveMode === 'map' && !isMapReady && !isMapError) {
            timeout = setTimeout(() => {
                if (!isMapReady) setIsMapError(true);
            }, 10000); // 10 seconds timeout
        }
        return () => clearTimeout(timeout);
    }, [archiveMode, isMapReady, isMapError]);
    // Refs for scrolling and throttling
    const scrollViewRef = useRef<ScrollView>(null);
    const countryYPositions = useRef<{[key: string]: number}>({});
    const lastActionTime = useRef(0);
    const isAnimatingRef = useRef(false);

    const startAnimationGuard = () => {
        if (isAnimatingRef.current) return false;
        isAnimatingRef.current = true;
        setTimeout(() => {
            isAnimatingRef.current = false;
        }, 350);
        return true;
    };

    useEffect(() => {
        // Scroll to country when entering list mode with an expanded country
        if (archiveMode === 'list' && expandedCountry && countryYPositions.current[expandedCountry] !== undefined) {
             // Small timeout to allow layout transition to start/finish
             setTimeout(() => {
                 scrollViewRef.current?.scrollTo({
                     y: countryYPositions.current[expandedCountry],
                     animated: true
                 });
             }, 300);
        }
    }, [archiveMode, expandedCountry]);

    const handleToggleCountry = (countryName: string) => {
        const now = Date.now();
        if (now - lastActionTime.current < 200) return; // Prevent rapid tapping
        lastActionTime.current = now;
        if (!startAnimationGuard()) return;

        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedCountry(expandedCountry === countryName ? null : countryName);
    };

    const handleSwitchMode = (mode: 'map' | 'list') => {
        const now = Date.now();
        if (now - lastActionTime.current < 200) return; // Prevent rapid tapping
        lastActionTime.current = now;
        if (!startAnimationGuard()) return;

        if (mode === 'map') {
            setIsMapError(false);
            setIsMapReady(false);
            setMapReloadKey((prev) => prev + 1);
            setIsEditMode(false);
        }

        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setArchiveMode(mode);
    };
    
    // Fly to country
    const flyToCountry = (coords: number[]) => {
        mapRef.current?.animateToRegion({
            latitude: coords[1],
            longitude: coords[0],
            latitudeDelta: 10,
            longitudeDelta: 10,
        }, 1000);
    };
    
    // Helper to check if country has items matching current filter
    const isAllowedItemType = (type: string | undefined) => type === 'safe' || type === 'danger';
    const matchesFilter = (type: string | undefined) => archiveFilter === 'all' || type === archiveFilter;

    const getFilteredItemsCount = (country: CountryData) => {
        if (archiveFilter === 'all') {
            let count = 0;
            (country.regions || []).forEach(r => {
                count += (r.items || []).filter(i => isAllowedItemType(i.type)).length;
            });
            return count;
        }
        let count = 0;
        (country.regions || []).forEach(r => {
            count += (r.items || []).filter(i => matchesFilter(i.type)).length;
        });
        return count;
        return count;
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

    const handleDeleteItem = async (itemId: string) => {
        // Optimistic Update
        removeItemsLocally(new Set([itemId]));
        
        try {
            await AnalysisService.deleteAnalysis(TEST_UID, itemId);
            // loadHistory(true); // Avoid reloading stale data
        } catch (e) {
            Alert.alert("Error", "Failed to delete item");
            loadHistory(true); // Revert on error
        }
    };

    const toggleEditMode = () => {
        if (!isEditMode) {
             // Close any open swipeable rows
             swipeableRefs.current.forEach(ref => ref?.close());
        }
        setIsEditMode(prev => !prev);
        setSelectedItems(new Set()); // Clear selection on toggle
    };

    const toggleSelectItem = (id: string) => {
        const next = new Set(selectedItems);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedItems(next);
    };

    const handleBulkDelete = () => {
        if (selectedItems.size === 0) return;
        Alert.alert(
            "Delete Items",
            `Are you sure you want to delete ${selectedItems.size} items?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        // Optimistic Update
                        removeItemsLocally(selectedItems);
                        setIsEditMode(false);

                        try {
                            const promises = Array.from(selectedItems).map(id => AnalysisService.deleteAnalysis(TEST_UID, id));
                            await Promise.all(promises);
                            // loadHistory(true); // Avoid reloading stale data
                        } catch(e) { 
                            Alert.alert("Error", "Failed to delete items");
                            loadHistory(true);
                        }
                    }
                }
            ]
        );
    };

    const renderRightActions = (progress: any, dragX: any, onClick: () => void) => {
        const trans = dragX.interpolate({
            inputRange: [-100, 0],
            outputRange: [0, 50],
            extrapolate: 'clamp',
        });
        return (
            <TouchableOpacity onPress={onClick} style={styles.deleteAction}>
                <Animated.View style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]}>
                    <Trash2 size={24} color="white" />
                    <Text style={styles.deleteText}>Delete</Text>
                </Animated.View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <SafeAreaView style={{flex: 1}} edges={['top']}> 
                {/* Header */}
                <View style={[styles.header, {marginTop: 0}]}>
                    <TouchableOpacity 
                        onPress={() => router.back()}
                        style={styles.backButton}
                    >
                        <View pointerEvents="none">
                            <ChevronLeft size={24} color="#1E293B" />
                        </View>
                    </TouchableOpacity>
                    
                    <Text style={styles.headerTitle}>Food Passport</Text>
                    
                    <View style={styles.toggleContainer}>
                        {archiveMode === 'list' && (
                            <>
                                <TouchableOpacity 
                                    onPress={toggleEditMode}
                                    style={[
                                        styles.toggleButton,
                                        isEditMode && styles.toggleButtonActive
                                    ]}
                                    hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                                >
                                <Text style={{fontSize: 12, fontWeight: '700', color: isEditMode ? '#2563EB' : '#64748B', paddingHorizontal: 4}}>
                                        {isEditMode ? 'Done' : 'Edit'}
                                </Text>
                                </TouchableOpacity>
                                <View style={styles.verticalDivider} />
                            </>
                        )}
                        <TouchableOpacity 
                            onPress={() => handleSwitchMode('map')}
                            style={[
                                styles.toggleButton, 
                                archiveMode === 'map' && styles.toggleButtonActive
                            ]}
                            hitSlop={{top: 10, bottom: 10, left: 10, right: 5}}
                        >
                            <View pointerEvents="none">
                                <Globe size={18} color={archiveMode === 'map' ? '#2563EB' : '#64748B'} />
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => handleSwitchMode('list')}
                            style={[
                                styles.toggleButton, 
                                archiveMode === 'list' && styles.toggleButtonActive
                            ]}
                            hitSlop={{top: 10, bottom: 10, left: 5, right: 10}}
                        >
                            <View pointerEvents="none">
                                <List size={18} color={archiveMode === 'list' ? '#2563EB' : '#64748B'} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
                {archiveMode === 'map' ? (
                    <View style={{flex: 1}}>
                         {/* Mapbox Map */}
                         <View style={styles.mapContainer}>
                            {/* Error / Offline Fallback */}
                            {isMapError && (
                                <View style={[StyleSheet.absoluteFill, {backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', zIndex: 20}]}>
                                    <View style={{alignItems: 'center', opacity: 0.5}}>
                                        <Globe size={48} color="#94A3B8" />
                                        <Text style={{marginTop: 12, color: '#64748B', fontWeight: '600'}}>Map Unavailable</Text>
                                        <Text style={{marginTop: 4, color: '#94A3B8', fontSize: 12}}>Offline or slow network</Text>
                                        <TouchableOpacity 
                                            onPress={() => {
                                                setIsMapError(false);
                                                setIsMapReady(false);
                                                setMapReloadKey((prev) => prev + 1);
                                            }}
                                            style={{marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E2E8F0', borderRadius: 20}}
                                        >
                                            <View pointerEvents="none">
                                                <Text style={{fontSize: 12, fontWeight: '700', color: '#475569'}}>RETRY</Text>
                                            </View>
                                        </TouchableOpacity>
                                        <TouchableOpacity 
                                            onPress={() => handleSwitchMode('list')}
                                            style={{marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0'}}
                                        >
                                            <View pointerEvents="none">
                                                <Text style={{fontSize: 12, fontWeight: '700', color: '#475569'}}>VIEW LIST</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}

                            {/* Loading State */}
                            {!isMapReady && !isMapError && (
                                <View style={[StyleSheet.absoluteFill, {backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', zIndex: 10}]}>
                                    <Text style={{fontSize: 24, marginBottom: 12}}>🗺️</Text>
                                    <Text style={{color: '#64748B', fontSize: 12, fontWeight: '600'}}>Loading Map...</Text>
                                </View>
                            )}
                            
                            {/* Empty Data State */}
                             {isMapReady && archiveData.length === 0 && (
                                <View style={[StyleSheet.absoluteFill, {alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none'}]}>
                                    <BlurView intensity={40} tint="light" style={{padding: 20, borderRadius: 20, overflow: 'hidden', alignItems: 'center'}}>
                                        <Text style={{fontSize: 32}}>🌏</Text>
                                        <Text style={{marginTop: 8, color: '#475569', fontWeight: '600'}}>No trips yet</Text>
                                        <Text style={{fontSize: 12, color: '#64748B'}}>Start analyzing items to fill your passport!</Text>
                                    </BlurView>
                                </View>
                            )}

                            {isMapReady && (
                                <MapView
                                    ref={mapRef}
                                    style={styles.map}
                                    provider={PROVIDER_DEFAULT}
                                    initialRegion={{
                                        latitude: archiveData[0]?.coordinates[1] || 20,
                                        longitude: archiveData[0]?.coordinates[0] || 0,
                                        latitudeDelta: 50,
                                        longitudeDelta: 50,
                                    }}
                                    onMapReady={() => setIsMapReady(true)}
                                >
                                    {archiveData.map((country, countryIdx) => {
                                        const coords = country.coordinates;
                                        if (!coords || coords.length < 2) return null;
                                        return (
                                            <Marker 
                                                key={`${country.country}-${countryIdx}`}
                                                coordinate={{
                                                    latitude: coords[1],
                                                    longitude: coords[0]
                                                }}
                                                onPress={() => {
                                                    handleSwitchMode('list'); 
                                                    setExpandedCountry(`${country.country}-${countryIdx}`);
                                                }}
                                            >
                                                <TouchableOpacity 
                                                    activeOpacity={0.9}
                                                    style={styles.mapPinContainer}
                                                >
                                                    <View pointerEvents="none">
                                                        <BlurView intensity={80} tint="light" style={styles.mapLabel}>
                                                            <Text style={styles.mapLabelText} numberOfLines={1} ellipsizeMode="tail">
                                                                {country.country} ({country.total})
                                                            </Text>
                                                        </BlurView>
                                                        <View style={styles.mapPinCircle}>
                                                            <Text style={{fontSize: 16}}>{country.flag}</Text>
                                                        </View>
                                                    </View>
                                                </TouchableOpacity>
                                            </Marker>
                                        );
                                    })}
                                </MapView>
                            )}

                            {/* Overlay Card - Only show when map is ready and has data */}
                            {isMapReady && archiveData.length > 0 && (
                                <View style={styles.mapOverlay}>
                                    <BlurView intensity={90} tint="light" style={[styles.insightCard, THEME.glass, THEME.shadow]}>
                                        <View style={styles.insightHeader}>
                                            <View style={styles.insightIconBox}>
                                                <Globe size={16} color="#2563EB" />
                                            </View>
                                            <Text style={styles.insightTitle}>Global Insights</Text>
                                        </View>
                                        
                                        <View style={styles.insightRow}>
                                            <Text style={styles.insightLabel}>Favorite Destination</Text>
                                            <Text style={styles.insightValue}>{archiveData.sort((a,b) => b.total - a.total)[0]?.country || '-'}</Text>
                                        </View>
                                        
                                        <View style={styles.progressBarBg}>
                                            <View style={[styles.progressBarFill, { width: '84%' }]} />
                                        </View>
                                        
                                        <Text style={styles.insightHint}>
                                            Tap pins to see details
                                        </Text>
                                    </BlurView>
                                </View>
                            )}
                         </View>
                    </View>
                ) : (
                    <ScrollView 
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                        ref={scrollViewRef}
                        contentContainerStyle={{paddingHorizontal: 24, paddingBottom: 40}}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* List View Content */}
                        {/* Filter Chips */}
                        <View style={styles.filterContainer}>
                            {(['all', 'safe', 'danger'] as const).map(f => (
                                <TouchableOpacity 
                                    key={f}
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setArchiveFilter(f);
                                    }}
                                    style={[
                                        styles.filterChip,
                                        archiveFilter === f && styles.filterChipActive
                                    ]}
                                >
                                    <View pointerEvents="none">
                                        <Text style={[
                                            styles.filterText,
                                            archiveFilter === f && styles.filterTextActive
                                        ]}>{f.toUpperCase()}</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Countries List */}
                        <View style={{gap: 16}}>
                             {loading ? (
                                <View style={{alignItems: 'center', marginTop: 40}}>
                                    <ActivityIndicator color="#0F172A" />
                                    <Text style={{marginTop: 16, color: '#64748B'}}>Loading Passport...</Text>
                                </View>
                             ) : archiveData.length === 0 ? (
                                <View style={{alignItems: 'center', marginTop: 40, opacity: 0.5}}>
                                    <List size={48} color="#94A3B8" />
                                    <Text style={{marginTop: 16, fontSize: 16, fontWeight: '600', color: '#64748B'}}>No records found</Text>
                                </View>
                            ) : archiveData.map((country, countryIdx) => (
                                <BlurView 
                                    key={`${country.country}-${countryIdx}`} 
                                    intensity={70} 
                                    tint="light" 
                                    style={[styles.countryCard, THEME.glass]}
                                    onLayout={(event) => {
                                        countryYPositions.current[`${country.country}-${countryIdx}`] = event.nativeEvent.layout.y;
                                    }}
                                >
                                    <TouchableOpacity 
                                        onPress={() => handleToggleCountry(`${country.country}-${countryIdx}`)}
                                        activeOpacity={0.7}
                                        style={styles.countryHeader}
                                    >
                                        <View pointerEvents="none" style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1}}>
                                            <View style={{flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1}}>
                                                <Text style={{fontSize: 32}}>{country.flag}</Text>
                                                <View style={{flex: 1}}>
                                                    <Text style={styles.countryName} numberOfLines={1} ellipsizeMode="tail">{country.country}</Text>
                                                    <Text style={styles.countryCount}>{country.total} SCANS</Text>
                                                </View>
                                            </View>
                                            <ChevronDown 
                                                size={20} 
                                                color="#94A3B8" 
                                                style={{ 
                                                    transform: [{ rotate: expandedCountry === `${country.country}-${countryIdx}` ? '180deg' : '0deg' }] 
                                                }} 
                                            />
                                        </View>
                                    </TouchableOpacity>

                                    {expandedCountry === `${country.country}-${countryIdx}` && (
                                        <View style={styles.accordionBody}>
                                            {getFilteredItemsCount(country) === 0 && (
                                                <View style={{padding: 16, alignItems: 'center'}}>
                                                    <Text style={{color: '#94A3B8', fontSize: 12}}>No {archiveFilter} records in this trip.</Text>
                                                </View>
                                            )}
                                            {(country.regions || []).map((region, rIdx) => (
                                                <View key={rIdx} style={{marginBottom: 16}}>
                                                    {(region.items || []).some(i => isAllowedItemType(i.type) && matchesFilter(i.type)) && (
                                                        <Text style={styles.regionTitle}>{region.name}</Text>
                                                    )}
                                                    
                                                    {(region.items || [])
                                                        .filter(i => isAllowedItemType(i.type) && matchesFilter(i.type))
                                                        .map((item, itemIdx) => (
                                                    <View style={{marginBottom: 10}} key={`${country.country}-${region.name ?? rIdx}-${item.id}-${itemIdx}`}>
                                                        <Swipeable
                                                            ref={(ref) => {
                                                                if (ref) swipeableRefs.current.set(item.id, ref);
                                                                else swipeableRefs.current.delete(item.id);
                                                            }}
                                                            renderRightActions={(p, d) => renderRightActions(p, d, () => handleDeleteItem(item.id))}
                                                            enabled={!isEditMode}
                                                        >
                                                        <TouchableOpacity 
                                                            style={styles.itemRow}
                                                            onPress={() => {
                                                                if (isEditMode) {
                                                                    toggleSelectItem(item.id);
                                                                } else {
                                                                    dataStore.setData(item.originalRecord, item.originalRecord.location, item.originalRecord.imageUri || "");
                                                                    router.push({ pathname: '/result', params: { fromStore: 'true' } });
                                                                }
                                                            }}
                                                        >
                                                            <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1}}>
                                                                {isEditMode && (
                                                                    <View style={{marginRight: 4}}>
                                                                        {selectedItems.has(item.id) ? (
                                                                            <CheckCircle size={22} color="#2563EB" fill="#EFF6FF" />
                                                                        ) : (
                                                                            <Circle size={22} color="#CBD5E1" />
                                                                        )}
                                                                    </View>
                                                                )}
                                                                <View style={styles.emojiBox}>
                                                                    <Text style={{fontSize: 20}}>{item.emoji}</Text>
                                                                </View>
                                                                <View style={{flex: 1}}>
                                                                    <Text style={styles.itemName} numberOfLines={1} ellipsizeMode="tail">{item.name}</Text>
                                                                    <Text style={styles.itemDate}>{item.date}</Text>
                                                                </View>
                                                            </View>
                                                            <View style={[
                                                                styles.statusIconBox,
                                                                item.type === 'safe' ? {backgroundColor: '#DCFCE7', borderColor: '#BBF7D0'} : {backgroundColor: '#FFE4E6', borderColor: '#FECDD3'}
                                                            ]}>
                                                                {item.type === 'safe' ? (
                                                                    <ShieldCheck size={16} color="#22C55E" />
                                                                ) : (
                                                                    <AlertCircle size={16} color="#F43F5E" />
                                                                )}
                                                            </View>
                                                        </TouchableOpacity>
                                                        </Swipeable>
                                                    </View>
                                                    ))}
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </BlurView>
                            ))}
                        </View>
                    </ScrollView>
                )}
                {/* Floating Delete Bar */}
                {isEditMode && selectedItems.size > 0 && (
                    <LinearGradient
                        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', '#FFFFFF']}
                        style={styles.floatingBarContainer}
                        pointerEvents="box-none"
                    >
                        <TouchableOpacity 
                            onPress={handleBulkDelete}
                            style={styles.floatingDeleteButton}
                            activeOpacity={0.9}
                        >
                            <View style={styles.floatingDeleteContent}>
                                <Trash2 size={24} color="white" />
                                <Text style={styles.floatingDeleteText}>Delete ({selectedItems.size})</Text>
                            </View>
                        </TouchableOpacity>
                    </LinearGradient>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 16,
        zIndex: 100, // Increased zIndex for Mapbox overlay
        position: 'relative', // Ensure explicit positioning
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#0F172A',
    },
    toggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(226, 232, 240, 0.6)',
        padding: 4,
        borderRadius: 20,
    },
    toggleButton: {
        padding: 6,
        borderRadius: 16,
    },
    toggleButtonActive: {
        backgroundColor: 'white',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    toggleButtonDisabled: {
        backgroundColor: 'rgba(226, 232, 240, 0.4)',
    },
    // Map Styles
    mapContainer: {
        flex: 1,
        borderRadius: 40,
        overflow: 'hidden',
        marginHorizontal: 16,
        marginBottom: 24,
        backgroundColor: '#E2E8F0', // Placeholder color
    },
    map: {
        flex: 1,
    },
    mapPinContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapLabel: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.8)',
        overflow: 'hidden',
    },
    mapLabelText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#0F172A',
    },
    mapPinCircle: {
        width: 36,
        height: 36,
        backgroundColor: '#2563EB',
        borderRadius: 18,
        borderWidth: 4,
        borderColor: 'white',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    mapOverlay: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
    },
    insightCard: {
        padding: 24,
        borderRadius: 32,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    insightIconBox: {
        width: 32,
        height: 32,
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    insightTitle: {
        fontWeight: '700',
        color: '#1E293B',
        fontSize: 16,
    },
    insightRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    insightLabel: {
        fontSize: 14,
        color: '#64748B',
    },
    insightValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0F172A',
    },
    progressBarBg: {
        height: 10,
        backgroundColor: '#F1F5F9',
        borderRadius: 5,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#3B82F6',
        borderRadius: 5,
    },
    insightHint: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        fontWeight: '500',
    },
    // List styles
    filterContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(226, 232, 240, 0.4)',
        padding: 6,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(226, 232, 240, 0.5)',
        marginBottom: 24,
        gap: 8,
    },
    filterChip: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 17,
    },
    filterChipActive: {
        backgroundColor: 'white',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    filterText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
    },
    filterTextActive: {
        color: '#2563EB',
    },
    countryCard: {
        borderRadius: 28,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'white',
    },
    countryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    countryName: {
        fontSize: 17,
        fontWeight: '900',
        color: '#0F172A',
    },
    countryCount: {
        fontSize: 11,
        fontWeight: '700',
        color: '#64748B',
        letterSpacing: 1,
        marginTop: 2,
    },
    accordionBody: {
        padding: 8,
    },
    regionTitle: {
        fontSize: 10,
        fontWeight: '900',
        color: 'rgba(59, 130, 246, 0.7)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
        marginLeft: 12,
        marginTop: 8,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255,255,255,0.8)',
        padding: 16,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'white',
    },
    deleteAction: {
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'flex-end',
        width: 100,
        height: '100%',
        paddingRight: 20,
        borderRadius: 22,
        marginLeft: -20,
    },
    deleteBtnContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 12,
        marginTop: 4,
    },
    emojiBox: {
        width: 44,
        height: 44,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#F1F5F9',
    },
    itemName: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        lineHeight: 18,
    },
    itemDate: {
        fontSize: 10,
        fontWeight: '500',
        color: '#94A3B8',
        marginTop: 2,
    },
    statusIconBox: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    verticalDivider: {
        width: 1,
        height: 16,
        backgroundColor: '#CBD5E1',
        marginHorizontal: 4,
    },
    floatingBarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 120,
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 40,
        zIndex: 200,
    },
    floatingDeleteButton: {
        backgroundColor: '#EF4444',
        borderRadius: 30,
        paddingHorizontal: 24,
        paddingVertical: 14,
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    floatingDeleteContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    floatingDeleteText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16,
    }
});
