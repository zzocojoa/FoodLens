import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, LayoutAnimation, Platform, RefreshControl, Text, UIManager, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Region } from 'react-native-maps';
import { useRouter, Stack } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useHistoryFilter, type FilterType } from '@/hooks/useHistoryFilter';
import { getHistoryUserId } from '../constants/history.constants';
import { useHistoryScreen } from '../hooks/useHistoryScreen';
import { configureHistoryLayoutAnimation } from '../utils/historyLayoutAnimation';
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
import HistoryHomeBackgroundAtmosphere from '../../home/components/HomeBackgroundAtmosphere';
import HistoryAtlasPanel from '../components/HistoryAtlasPanel';
import HistoryCountryChapters from '../components/HistoryCountryChapters';
import HistoryFilterRail from '../components/HistoryFilterRail';
import HistoryJournalRail from '../components/HistoryJournalRail';
import HistorySelectionUtilityBar from '../components/HistorySelectionUtilityBar';
import HistorySummaryStrip from '../components/HistorySummaryStrip';
import HistorySurfaceCard from '../components/HistorySurfaceCard';
import {
    getHistoryDashboardColors,
    type HistoryDashboardColorScheme,
    historyDashboardSpacing,
} from '../components/historyDashboardTokens';
import { historyDashboardStyles } from '../components/historyDashboardStyles';
import { useI18n } from '@/features/i18n';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { completeTopLevelTabSwitchTrace } from '@/components/navigation/tabSwitchTrace';
import { markHomeNavigationTrace } from '@/features/home/services/homeNavigationTrace';
import type { UserProfileUpdateReason } from '@/services/user/userProfileStore';
import type { ArchiveMode } from '../types/history.types';
import type { HistoryCountryChapter } from '../types/historyViewModel.types';

const HISTORY_CLIENT_STATE_REFRESH_DEBOUNCE_MS = 250;
const HISTORY_MAP_REGION_SAVE_DEBOUNCE_MS = 250;

const shouldRefreshSyncedHistoryState = (reason: UserProfileUpdateReason): boolean => {
    return reason !== 'client_state_write';
};

const collectVisibleSelectableItemIds = (
    countryChapters: HistoryCountryChapter[],
    expandedCountries: Set<string>,
    matchesFilter: (type: string | undefined) => boolean,
): string[] => {
    const visibleIds = new Set<string>();

    countryChapters.forEach((chapter) => {
        if (!expandedCountries.has(chapter.id)) {
            return;
        }

        chapter.countryData.regions.forEach((region) => {
            region.items.forEach((item) => {
                if (matchesFilter(item.type)) {
                    visibleIds.add(item.id);
                }
            });
        });
    });

    return Array.from(visibleIds);
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HistoryScreen() {
    const router = useRouter();
    const isFocused = useIsFocused();
    const colorScheme = (useColorScheme() ?? 'light') as HistoryDashboardColorScheme;
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const historyUserId = getHistoryUserId();
    const [syncedHistoryState, setSyncedHistoryState] = useState(() =>
        readHistoryStateSnapshot(historyUserId)
    );
    const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false);
    const clientStateRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mapRegionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingMapRegionRef = useRef<Region | null>(null);
    const hasMarkedFirstContentRef = useRef(false);
    const handleReturnHome = useCallback((): void => {
        router.navigate('/(tabs)');
    }, [router]);

    useFocusEffect(
        useCallback(() => {
            const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
                handleReturnHome();
                return true;
            });

            return () => {
                subscription.remove();
            };
        }, [handleReturnHome]),
    );

    useEffect(() => {
        markHomeNavigationTrace('history', 'screen_mount');
    }, []);

    useEffect(() => {
        let isMounted = true;
        const subscription = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            setIsReduceMotionEnabled
        );

        void AccessibilityInfo.isReduceMotionEnabled()
            .then((isEnabled) => {
                if (isMounted && isEnabled) {
                    setIsReduceMotionEnabled(isEnabled);
                }
            })
            .catch((error: unknown) => {
                console.warn('history.reduce_motion_read_failed', { error: String(error) });
            });

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, []);

    const {
        archiveData,
        countryChapters,
        journalSummary,
        initialRegion,
        loading,
        refreshing,
        onRefresh,
        expandedCountries,
        setExpandedCountries,
        deleteItem,
        deleteMultipleItems,
    } = useHistoryData(historyUserId, { isPollingEnabled: isFocused });

    const handleArchiveFilterChange = useCallback((nextFilter: FilterType): void => {
        void updateUserClientState(historyUserId, buildHistoryFilterPatch(nextFilter)).catch(() => undefined);
    }, [historyUserId]);

    const { archiveFilter, setArchiveFilter, matchesFilter } = useHistoryFilter({
        initialFilter: syncedHistoryState.filter,
        onFilterChange: handleArchiveFilterChange,
    });

    const handleArchiveModeChange = useCallback((nextMode: ArchiveMode): void => {
        void updateUserClientState(historyUserId, buildHistoryModePatch(nextMode)).catch(() => undefined);
    }, [historyUserId]);

    const ui = useHistoryScreen({
        deleteMultipleItems,
        initialArchiveMode: syncedHistoryState.archiveMode,
        initialMapRegion: syncedHistoryState.mapRegion,
        isReduceMotionEnabled,
        onArchiveModeChange: handleArchiveModeChange,
    });
    const { savedMapRegionRef, setSavedMapRegion } = ui;

    useEffect(() => {
        const unsubscribe = subscribeUserProfileUpdated(historyUserId, (reason) => {
            if (!shouldRefreshSyncedHistoryState(reason)) {
                return;
            }

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
        (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim().length > 0;
    const canRenderNativeMap = Platform.OS !== 'android' || hasAndroidGoogleMapsApiKey;
    const visibleSelectableItemIds = useMemo(() => {
        if (!ui.isEditMode) {
            return [];
        }

        return collectVisibleSelectableItemIds(countryChapters, expandedCountries, matchesFilter);
    }, [countryChapters, expandedCountries, matchesFilter, ui.isEditMode]);

    const handleToggleCountry = useCallback((countryName: string) => {
        configureHistoryLayoutAnimation(isReduceMotionEnabled, LayoutAnimation.Presets.easeInEaseOut);
        setExpandedCountries((prev) => toggleCountryExpanded(prev, countryName));
    }, [isReduceMotionEnabled, setExpandedCountries]);

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

    const listContentBottomPadding = ui.isEditMode
        ? Math.max(insets.bottom + 24, 36)
        : Math.max(insets.bottom + 92, 112);
    const atlasBottomInset = Math.max(insets.bottom + 92, 112);
    const historyListContentContainerStyle = useMemo<StyleProp<ViewStyle>>(() => [
        historyDashboardStyles.scrollContent,
        { paddingBottom: listContentBottomPadding },
    ], [listContentBottomPadding]);
    const historyRefreshControl = useMemo(() => (
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
    ), [onRefresh, refreshing]);
    const isHistoryReady = !loading || countryChapters.length > 0;
    const dashboardColors = useMemo(
        () => getHistoryDashboardColors(colorScheme),
        [colorScheme],
    );

    useEffect(() => {
        if (!isFocused || !isHistoryReady) {
            return;
        }

        if (!hasMarkedFirstContentRef.current) {
            hasMarkedFirstContentRef.current = true;
            markHomeNavigationTrace('history', 'first_content');
        }

        completeTopLevelTabSwitchTrace({
            target: 'history',
            details: {
                archiveMode: ui.archiveMode,
                chapterCount: countryChapters.length,
                loading,
                refreshing,
            },
        });
    }, [countryChapters.length, isFocused, isHistoryReady, loading, refreshing, ui.archiveMode]);

    const historyListHeader = useMemo(() => (
        <View style={{ gap: historyDashboardSpacing.sm }}>
            <HistoryJournalRail
                archiveMode={ui.archiveMode}
                colors={dashboardColors}
                isEditMode={ui.isEditMode}
                isMapModeAvailable={ui.isMapModeAvailable}
                onBack={handleReturnHome}
                onSwitchMode={ui.handleSwitchMode}
                onToggleEdit={ui.toggleEditMode}
            />

            <HistorySummaryStrip colors={dashboardColors} summary={journalSummary} />
            <HistoryFilterRail
                colors={dashboardColors}
                filter={archiveFilter}
                isReduceMotionEnabled={isReduceMotionEnabled}
                onChange={setArchiveFilter}
            />
            {ui.isEditMode ? (
                <HistorySelectionUtilityBar
                    colors={dashboardColors}
                    onClearSelection={handleClearSelection}
                    onDeleteSelection={ui.handleBulkDelete}
                    onSelectAll={handleSelectAllVisible}
                    selectedCount={ui.selectedItems.size}
                    totalCount={visibleSelectableItemIds.length}
                />
            ) : null}
            {loading && countryChapters.length === 0 ? (
                <HistorySurfaceCard accentWashColor={dashboardColors.pearlMist} colors={dashboardColors}>
                    <View
                        style={{
                            alignItems: 'center',
                            gap: historyDashboardSpacing.sm,
                            paddingVertical: historyDashboardSpacing.lg,
                        }}
                    >
                        <ActivityIndicator color={dashboardColors.accentBlue} />
                        <Text
                            style={{
                                color: dashboardColors.inkSoft,
                                fontSize: 15,
                                fontWeight: '700',
                                lineHeight: 20,
                            }}
                        >
                            {t('history.loading.passport', 'Loading Passport...')}
                        </Text>
                    </View>
                </HistorySurfaceCard>
            ) : null}
        </View>
    ), [
        archiveFilter,
        countryChapters.length,
        dashboardColors,
        handleClearSelection,
        handleReturnHome,
        handleSelectAllVisible,
        isReduceMotionEnabled,
        journalSummary,
        loading,
        setArchiveFilter,
        t,
        ui.archiveMode,
        ui.handleBulkDelete,
        ui.handleSwitchMode,
        ui.isEditMode,
        ui.isMapModeAvailable,
        ui.selectedItems.size,
        ui.toggleEditMode,
        visibleSelectableItemIds.length,
    ]);

    return (
        <TopLevelScreenShell
            activeItem="history"
            backgroundColor={dashboardColors.paper}
            hideNav={ui.isEditMode}
        >
            <View
                collapsable={false}
                testID="history-screen"
                style={[historyDashboardStyles.screenBackground, { backgroundColor: dashboardColors.paper }]}
            >
                <Stack.Screen options={{ headerShown: false }} />
                {colorScheme === 'light' ? <HistoryHomeBackgroundAtmosphere /> : null}
                <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                    {ui.archiveMode === 'map' ? (
                        <View style={historyDashboardStyles.atlasScreenContent}>
                            <View style={historyDashboardStyles.atlasRailInset}>
                                <HistoryJournalRail
                                    archiveMode={ui.archiveMode}
                                    colors={dashboardColors}
                                    isEditMode={ui.isEditMode}
                                    isMapModeAvailable={ui.isMapModeAvailable}
                                    onBack={handleReturnHome}
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
                                    colors={dashboardColors}
                                    data={archiveData}
                                    initialRegion={ui.savedMapRegion ?? ui.savedMapRegionRef.current ?? initialRegion}
                                    onMarkerPress={handleMarkerPress}
                                    onRegionChange={handleRegionChange}
                                />
                            </View>
                        </View>
                    ) : (
                        <HistoryCountryChapters
                            chapters={countryChapters}
                            colors={dashboardColors}
                            contentContainerStyle={historyListContentContainerStyle}
                            expandedCountries={expandedCountries}
                            isEditMode={ui.isEditMode}
                            isLoadingInitial={loading && countryChapters.length === 0}
                            listHeaderComponent={historyListHeader}
                            matchesFilter={matchesFilter}
                            onDelete={deleteItem}
                            onEntryPress={handleOpenRecentEntry}
                            onToggleCountry={handleToggleCountry}
                            onToggleItem={ui.toggleSelectItem}
                            refreshControl={historyRefreshControl}
                            selectedItems={ui.selectedItems}
                        />
                    )}
                </SafeAreaView>
            </View>
        </TopLevelScreenShell>
    );
}
