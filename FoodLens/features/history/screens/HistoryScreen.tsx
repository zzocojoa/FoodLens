import React, { useCallback } from 'react';
import { View, LayoutAnimation, Platform, UIManager, Text } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import HistoryMap from '@/components/HistoryMap';
import HistoryList from '@/components/HistoryList';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useHistoryFilter } from '@/hooks/useHistoryFilter';
import { getHistoryUserId } from '../constants/history.constants';
import { useHistoryScreen } from '../hooks/useHistoryScreen';
import { historyStyles as styles } from '../styles/historyStyles';
import { toggleCountryExpanded } from '../utils/historySelection';
import HistoryHeader from '../components/HistoryHeader';
import { useI18n } from '@/features/i18n';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HistoryScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const {
        archiveData,
        loading,
        initialRegion,
        refreshing,
        onRefresh,
        expandedCountries,
        setExpandedCountries,
        deleteItem,
        deleteMultipleItems,
    } = useHistoryData(getHistoryUserId());

    const { archiveFilter, setArchiveFilter, matchesFilter, isAllowedItemType } = useHistoryFilter();

    const ui = useHistoryScreen({ deleteMultipleItems });
    const hasAndroidGoogleMapsApiKey =
        (process.env['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY'] ?? '').trim().length > 0;
    const canRenderNativeMap = Platform.OS !== 'android' || hasAndroidGoogleMapsApiKey;

    const handleToggleCountry = useCallback((countryName: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedCountries((prev) => toggleCountryExpanded(prev, countryName));
    }, [setExpandedCountries]);

    const handleMarkerPress = useCallback((id: string) => {
        ui.handleSwitchMode('list');
        setExpandedCountries(new Set([id]));
    }, [ui, setExpandedCountries]);

    const handleRegionChange = useCallback((region: any) => {
        ui.savedMapRegionRef.current = region;
    }, [ui.savedMapRegionRef]);

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <HistoryHeader
                    title={t('history.header.title', 'Food Passport')}
                    theme={theme}
                    archiveMode={ui.archiveMode}
                    isEditMode={ui.isEditMode}
                    isMapModeAvailable={ui.isMapModeAvailable}
                    onBack={() => router.back()}
                    onSwitchMode={ui.handleSwitchMode}
                    onToggleEdit={ui.toggleEditMode}
                />

                {ui.archiveMode === 'map' ? (
                    canRenderNativeMap ? (
                        <HistoryMap
                            data={archiveData}
                            initialRegion={ui.savedMapRegionRef.current || initialRegion}
                            onMarkerPress={handleMarkerPress}
                            onRegionChange={handleRegionChange}
                        />
                    ) : (
                        <View style={[styles.mapUnavailableContainer, { backgroundColor: theme.background }]}>
                            <Text style={[styles.mapUnavailableTitle, { color: theme.textPrimary }]}>
                                {t('history.map.unavailableTitle', 'Map unavailable')}
                            </Text>
                            <Text style={[styles.mapUnavailableDescription, { color: theme.textSecondary }]}>
                                {t(
                                    'history.map.unavailableMessage',
                                    'Map mode is unavailable on this Android build. Configure EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild.'
                                )}
                            </Text>
                        </View>
                    )
                ) : (
                    <HistoryList
                        data={archiveData}
                        loading={loading}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        filter={archiveFilter}
                        setFilter={setArchiveFilter}
                        matchesFilter={matchesFilter}
                        isAllowedItemType={isAllowedItemType}
                        expandedCountries={expandedCountries}
                        onToggleCountry={handleToggleCountry}
                        isEditMode={ui.isEditMode}
                        selectedItems={ui.selectedItems}
                        onReplaceSelection={ui.replaceSelection}
                        onToggleItem={ui.toggleSelectItem}
                        onDelete={(id) => deleteItem(id)}
                        onBulkDelete={ui.handleBulkDelete}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}
