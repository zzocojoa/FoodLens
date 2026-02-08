import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Globe, List } from 'lucide-react-native';
import { useHistoryData } from '../hooks/useHistoryData';
import { useHistoryFilter } from '../hooks/useHistoryFilter';
import HistoryMap from '../components/HistoryMap';
import HistoryList from '../components/HistoryList';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

export default function HistoryScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    const TEST_UID = "test-user-v1"; // Context usage in real app

    const { 
        archiveData, loading, initialRegion, refreshing, onRefresh, 
        expandedCountries, setExpandedCountries, deleteItem, deleteMultipleItems 
    } = useHistoryData(TEST_UID);
    
    const { 
        archiveFilter, setArchiveFilter, matchesFilter, isAllowedItemType 
    } = useHistoryFilter();

    const [archiveMode, setArchiveMode] = useState<'map' | 'list'>('map');
    
    // NEW: Persist user's last map viewport between view toggles
    const savedMapRegionRef = useRef<any>(null);
    
    // Edit Mode State
    const [isEditMode, setIsEditMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

    const handleToggleCountry = (countryName: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedCountries(prev => {
            const next = new Set(prev);
            if (next.has(countryName)) next.delete(countryName);
            else next.add(countryName);
            return next;
        });
    };

    const handleSwitchMode = (mode: 'map' | 'list') => {
        if (mode === 'map') setIsEditMode(false);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        setArchiveMode(mode);
    };

    const toggleEditMode = () => {
        setIsEditMode(prev => !prev);
        setSelectedItems(new Set());
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
                        await deleteMultipleItems(selectedItems);
                        setIsEditMode(false);
                    }
                }
            ]
        );
    };

    return (
        <View style={[styles.container, {backgroundColor: theme.background}]}>
            <Stack.Screen options={{ headerShown: false }} />
            <SafeAreaView style={{flex: 1}} edges={['top']}> 
                <View style={styles.header}>
                    <TouchableOpacity 
                        onPress={() => router.back()} 
                        style={[styles.backButton, {backgroundColor: theme.glass, borderColor: theme.border}]}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <View pointerEvents="none">
                            <ChevronLeft size={24} color={theme.textPrimary} />
                        </View>
                    </TouchableOpacity>
                    
                    <View style={styles.headerTitleContainer}>
                        <Text style={[styles.headerTitle, {color: theme.textPrimary}]}>Food Passport</Text>
                    </View>
                    
                    <View style={[styles.toggleContainer, {backgroundColor: theme.surface}]}>
                        {archiveMode === 'list' && (
                            <>
                                <TouchableOpacity 
                                    onPress={toggleEditMode}
                                    style={[styles.toggleButton, isEditMode && {backgroundColor: theme.textPrimary, shadowColor: theme.shadow}]}
                                >
                                    <View pointerEvents="none">
                                        <Text style={{fontSize: 12, fontWeight: '700', color: isEditMode ? theme.background : theme.textSecondary, paddingHorizontal: 4}}>
                                            {isEditMode ? 'Done' : 'Edit'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <View style={[styles.verticalDivider, {backgroundColor: theme.border}]} />
                            </>
                        )}
                        <TouchableOpacity 
                            onPress={() => handleSwitchMode('map')}
                            style={[styles.toggleButton, archiveMode === 'map' && {backgroundColor: theme.textPrimary, shadowColor: theme.shadow}]}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                            <View pointerEvents="none">
                                <Globe size={18} color={archiveMode === 'map' ? theme.background : theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => handleSwitchMode('list')}
                            style={[styles.toggleButton, archiveMode === 'list' && {backgroundColor: theme.textPrimary, shadowColor: theme.shadow}]}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                        >
                            <View pointerEvents="none">
                                <List size={18} color={archiveMode === 'list' ? theme.background : theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                {archiveMode === 'map' ? (
                    <HistoryMap 
                        data={archiveData}
                        initialRegion={savedMapRegionRef.current || initialRegion}
                        onMarkerPress={(id) => {
                            handleSwitchMode('list');
                            setExpandedCountries(new Set([id]));
                        }}
                        onRegionChange={(region) => {
                            savedMapRegionRef.current = region;
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
                        isEditMode={isEditMode}
                        selectedItems={selectedItems}
                        onToggleItem={toggleSelectItem}
                        onDelete={(id) => deleteItem(id)}
                        onBulkDelete={handleBulkDelete}
                    />
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, /* backgroundColor set dynamically */ },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, zIndex: 100 },
    backButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    headerTitleContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
    headerTitle: { fontSize: 17, fontWeight: '700' },
    toggleContainer: { flexDirection: 'row', alignItems: 'center', padding: 4, borderRadius: 20 },
    toggleButton: { padding: 6, borderRadius: 16 },
    verticalDivider: { width: 1, height: 16, marginHorizontal: 4 },
});
