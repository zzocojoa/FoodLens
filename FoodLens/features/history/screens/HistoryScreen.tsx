import React from 'react';
import { View, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import HistoryMap from '@/components/HistoryMap';
import HistoryList from '@/components/HistoryList';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useHistoryFilter } from '@/hooks/useHistoryFilter';
import { HISTORY_TITLE, TEST_UID } from '../constants/history.constants';
import { useHistoryScreen } from '../hooks/useHistoryScreen';
import { historyStyles as styles } from '../styles/historyStyles';
import { toggleCountryExpanded } from '../utils/historySelection';
import HistoryHeader from '../components/HistoryHeader';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HistoryScreen() {
    const router = useRouter();
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
    } = useHistoryData(TEST_UID);

    const { archiveFilter, setArchiveFilter, matchesFilter, isAllowedItemType } = useHistoryFilter();

    const ui = useHistoryScreen({ deleteMultipleItems });

    const handleToggleCountry = (countryName: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedCountries((prev) => toggleCountryExpanded(prev, countryName));
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                <HistoryHeader
                    title={HISTORY_TITLE}
                    theme={theme}
                    archiveMode={ui.archiveMode}
                    isEditMode={ui.isEditMode}
                    onBack={() => router.back()}
                    onSwitchMode={ui.handleSwitchMode}
                    onToggleEdit={ui.toggleEditMode}
                />

                {ui.archiveMode === 'map' ? (
                    <HistoryMap
                        data={archiveData}
                        initialRegion={ui.savedMapRegionRef.current || initialRegion}
                        onMarkerPress={(id) => {
                            ui.handleSwitchMode('list');
                            setExpandedCountries(new Set([id]));
                        }}
                        onRegionChange={(region) => {
                            ui.savedMapRegionRef.current = region;
                        }}
                    />
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
                        onToggleItem={ui.toggleSelectItem}
                        onDelete={(id) => deleteItem(id)}
                        onBulkDelete={ui.handleBulkDelete}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

