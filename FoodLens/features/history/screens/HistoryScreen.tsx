import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, RefreshControl, ScrollView, Text, UIManager, View } from 'react-native';
import type { Region } from 'react-native-maps';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useHistoryFilter } from '@/hooks/useHistoryFilter';
import { getHistoryUserId } from '../constants/history.constants';
import { useHistoryScreen } from '../hooks/useHistoryScreen';
import { toggleCountryExpanded } from '../utils/historySelection';
import TopLevelScreenShell from '@/components/navigation/TopLevelScreenShell';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import { navigateToResultFromHistory } from '@/components/historyList/services/historyNavigationService';
import {
    buildHistoryFilterPatch,
    buildHistoryMapRegionPatch,
    buildHistoryModePatch,
    readHistoryStateSnapshot,
    updateUserClientState,
} from '@/services/user/clientStateService';
import HomeBackgroundAtmosphere from '../../home/components/HomeBackgroundAtmosphere';
import HistoryAtlasPanel from '../components/HistoryAtlasPanel';
import HistoryCountryChapters from '../components/HistoryCountryChapters';
import HistoryFilterRail from '../components/HistoryFilterRail';
import HistoryJournalRail from '../components/HistoryJournalRail';
import HistorySelectionUtilityBar from '../components/HistorySelectionUtilityBar';
import HistorySurfaceCard from '../components/HistorySurfaceCard';
import {
    historyDashboardColors,
    historyDashboardSpacing,
} from '../components/historyDashboardTokens';
import { historyDashboardStyles } from '../components/historyDashboardStyles';
import { useI18n } from '@/features/i18n';

const HISTORY_CLIENT_STATE_REFRESH_DEBOUNCE_MS = 250;
const HISTORY_MAP_REGION_SAVE_DEBOUNCE_MS = 250;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HistoryScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const historyUserId = getHistoryUserId();
    const [syncedHistoryState, setSyncedHistoryState] = useState(() =>
        readHistoryStateSnapshot(historyUserId)
    );
    const clientStateRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mapRegionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingMapRegionRef = useRef<Region | null>(null);

    const {
        archiveData,
        countryChapters,
        initialRegion,
        loading,
        refreshing,
        onRefresh,
        expandedCountries,
        setExpandedCountries,
        deleteItem,
        deleteMultipleItems,
    } = useHistoryData(historyUserId);

    const { archiveFilter, setArchiveFilter, matchesFilter } = useHistoryFilter({
        initialFilter: syncedHistoryState.filter,
        onFilterChange: (nextFilter) => {
            void updateUserClientState(historyUserId, buildHistoryFilterPatch(nextFilter)).catch(() => undefined);
        },
    });

    const ui = useHistoryScreen({
        deleteMultipleItems,
        initialArchiveMode: syncedHistoryState.archiveMode,
        initialMapRegion: syncedHistoryState.mapRegion,
        onArchiveModeChange: (nextMode) => {
            void updateUserClientState(historyUserId, buildHistoryModePatch(nextMode)).catch(() => undefined);
        },
    });
    const { savedMapRegionRef, setSavedMapRegion } = ui;

    useEffect(() => {
        const unsubscribe = subscribeUserProfileUpdated(historyUserId, () => {
            if (clientStateRefreshTimerRef.current) {
                clearTimeout(clientStateRefreshTimerRef.current);
            }

            clientStateRefreshTimerRef.current = setTimeout(() => {
                setSyncedHistoryState(readHistoryStateSnapshot(historyUserId));
            }, HISTORY_CLIENT_STATE_REFRESH_DEBOUNCE_MS);
        });

        return () => {
            unsubscribe();
            if (clientStateRefreshTimerRef.current) {
                clearTimeout(clientStateRefreshTimerRef.current);
                clientStateRefreshTimerRef.current = null;
            }
        };
    }, [historyUserId]);
    const hasAndroidGoogleMapsApiKey =
        (process.env['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'] ?? '').trim().length > 0;
    const canRenderNativeMap = Platform.OS !== 'android' || hasAndroidGoogleMapsApiKey;
    const visibleSelectableItemIds = useMemo(() => {
        const visibleIds = countryChapters.flatMap((chapter) =>
            expandedCountries.has(chapter.id)
                ? chapter.countryData.regions.flatMap((region) =>
                      region.items
                          .filter((item) => matchesFilter(item.type))
                          .map((item) => item.id)
                  )
                : []
        );

        return Array.from(new Set(visibleIds));
    }, [countryChapters, expandedCountries, matchesFilter]);

    const handleToggleCountry = useCallback((countryName: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedCountries((prev) => toggleCountryExpanded(prev, countryName));
    }, [setExpandedCountries]);

    const handleMarkerPress = useCallback((id: string) => {
        ui.handleSwitchMode('list');
        setExpandedCountries(new Set([id]));
    }, [ui, setExpandedCountries]);

    const handleRegionChange = useCallback((region: Region) => {
        savedMapRegionRef.current = region;
        setSavedMapRegion(region);
        pendingMapRegionRef.current = region;

        if (mapRegionSaveTimerRef.current) {
            clearTimeout(mapRegionSaveTimerRef.current);
        }

        mapRegionSaveTimerRef.current = setTimeout(() => {
            mapRegionSaveTimerRef.current = null;
            pendingMapRegionRef.current = null;
            void updateUserClientState(historyUserId, buildHistoryMapRegionPatch(region)).catch(() => undefined);
        }, HISTORY_MAP_REGION_SAVE_DEBOUNCE_MS);
    }, [historyUserId, savedMapRegionRef, setSavedMapRegion]);

    useEffect(() => {
        return () => {
            if (mapRegionSaveTimerRef.current) {
                clearTimeout(mapRegionSaveTimerRef.current);
                mapRegionSaveTimerRef.current = null;
            }

            const pendingRegion = pendingMapRegionRef.current;
            if (pendingRegion) {
                void updateUserClientState(historyUserId, buildHistoryMapRegionPatch(pendingRegion)).catch(() => undefined);
            }
        };
    }, [historyUserId]);

    const handleOpenRecentEntry = useCallback((entry: { record: Parameters<typeof navigateToResultFromHistory>[1] }) => {
        navigateToResultFromHistory(router, entry.record);
    }, [router]);

    const handleSelectAllVisible = useCallback(() => {
        ui.replaceSelection(new Set(visibleSelectableItemIds));
    }, [ui, visibleSelectableItemIds]);

    const handleClearSelection = useCallback(() => {
        ui.replaceSelection(new Set());
    }, [ui]);

    const scrollContentBottomPadding = ui.isEditMode
        ? Math.max(insets.bottom + 24, 36)
        : Math.max(insets.bottom + 92, 112);
    const atlasBottomInset = Math.max(insets.bottom + 92, 112);

    return (
        <TopLevelScreenShell
            activeItem="history"
            backgroundColor={historyDashboardColors.paper}
            hideNav={ui.isEditMode}
        >
            <View style={historyDashboardStyles.screenBackground}>
                <Stack.Screen options={{ headerShown: false }} />
                <HomeBackgroundAtmosphere />
                <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                    {ui.archiveMode === 'map' ? (
                        <View style={historyDashboardStyles.atlasScreenContent}>
                            <View style={historyDashboardStyles.atlasRailInset}>
                                <HistoryJournalRail
                                    archiveMode={ui.archiveMode}
                                    isEditMode={ui.isEditMode}
                                    isMapModeAvailable={ui.isMapModeAvailable}
                                    onBack={() => router.back()}
                                    onSwitchMode={ui.handleSwitchMode}
                                    onToggleEdit={ui.toggleEditMode}
                                />
                            </View>
                            <View
                                style={[
                                    historyDashboardStyles.atlasStage,
                                    { paddingBottom: atlasBottomInset },
                                ]}
                            >
                                <HistoryAtlasPanel
                                    canRenderNativeMap={canRenderNativeMap}
                                    data={archiveData}
                                    initialRegion={ui.savedMapRegion ?? ui.savedMapRegionRef.current ?? initialRegion}
                                    onMarkerPress={handleMarkerPress}
                                    onRegionChange={handleRegionChange}
                                />
                            </View>
                        </View>
                    ) : (
                        <ScrollView
                            contentContainerStyle={[
                                historyDashboardStyles.scrollContent,
                                { paddingBottom: scrollContentBottomPadding },
                            ]}
                            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                            showsVerticalScrollIndicator={false}
                        >
                            <HistoryJournalRail
                                archiveMode={ui.archiveMode}
                                isEditMode={ui.isEditMode}
                                isMapModeAvailable={ui.isMapModeAvailable}
                                onBack={() => router.back()}
                                onSwitchMode={ui.handleSwitchMode}
                                onToggleEdit={ui.toggleEditMode}
                            />

                            <View style={{ gap: historyDashboardSpacing.sm }}>
                                <HistoryFilterRail
                                    filter={archiveFilter}
                                    onChange={setArchiveFilter}
                                />
                                {ui.isEditMode ? (
                                    <HistorySelectionUtilityBar
                                        onClearSelection={handleClearSelection}
                                        onDeleteSelection={ui.handleBulkDelete}
                                        onSelectAll={handleSelectAllVisible}
                                        selectedCount={ui.selectedItems.size}
                                        totalCount={visibleSelectableItemIds.length}
                                    />
                                ) : null}
                                {loading && countryChapters.length === 0 ? (
                                    <HistorySurfaceCard accentWashColor={historyDashboardColors.pearlMist}>
                                        <View
                                            style={{
                                                alignItems: 'center',
                                                gap: historyDashboardSpacing.sm,
                                                paddingVertical: historyDashboardSpacing.lg,
                                            }}
                                        >
                                            <ActivityIndicator color={historyDashboardColors.accentBlue} />
                                            <Text
                                                style={{
                                                    color: historyDashboardColors.inkSoft,
                                                    fontSize: 15,
                                                    fontWeight: '700',
                                                    lineHeight: 20,
                                                }}
                                            >
                                                {t('history.loading.passport', 'Loading Passport...')}
                                            </Text>
                                        </View>
                                    </HistorySurfaceCard>
                                ) : (
                                    <HistoryCountryChapters
                                        chapters={countryChapters}
                                        expandedCountries={expandedCountries}
                                        isEditMode={ui.isEditMode}
                                        matchesFilter={matchesFilter}
                                        onDelete={deleteItem}
                                        onEntryPress={handleOpenRecentEntry}
                                        onToggleCountry={handleToggleCountry}
                                        onToggleItem={ui.toggleSelectItem}
                                        selectedItems={ui.selectedItems}
                                    />
                                )}
                            </View>
                        </ScrollView>
                    )}
                </SafeAreaView>
            </View>
        </TopLevelScreenShell>
    );
}
