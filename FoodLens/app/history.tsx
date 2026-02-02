import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager, Alert } from 'react-native';
import { useRouter } from 'expo-router';
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

export default function HistoryScreen() {
    const router = useRouter();
    const TEST_UID = "test-user-v1"; // Context usage in real app

    const { 
        archiveData, loading, initialRegion, refreshing, onRefresh, 
        expandedCountries, setExpandedCountries, deleteItem, deleteMultipleItems 
    } = useHistoryData(TEST_UID);
    
    const { 
        archiveFilter, setArchiveFilter, matchesFilter, isAllowedItemType 
    } = useHistoryFilter();

    const [archiveMode, setArchiveMode] = useState<'map' | 'list'>('map');
    
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
        <View style={styles.container}>
            <SafeAreaView style={{flex: 1}} edges={['top']}> 
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ChevronLeft size={24} color="#1E293B" />
                    </TouchableOpacity>
                    
                    <Text style={styles.headerTitle}>Food Passport</Text>
                    
                    <View style={styles.toggleContainer}>
                        {archiveMode === 'list' && (
                            <>
                                <TouchableOpacity 
                                    onPress={toggleEditMode}
                                    style={[styles.toggleButton, isEditMode && styles.toggleButtonActive]}
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
                            style={[styles.toggleButton, archiveMode === 'map' && styles.toggleButtonActive]}
                        >
                            <Globe size={18} color={archiveMode === 'map' ? '#2563EB' : '#64748B'} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                            onPress={() => handleSwitchMode('list')}
                            style={[styles.toggleButton, archiveMode === 'list' && styles.toggleButtonActive]}
                        >
                            <List size={18} color={archiveMode === 'list' ? '#2563EB' : '#64748B'} />
                        </TouchableOpacity>
                    </View>
                </View>

                {archiveMode === 'map' ? (
                    <HistoryMap 
                        data={archiveData}
                        initialRegion={initialRegion}
                        onMarkerPress={(id) => {
                            handleSwitchMode('list');
                            setExpandedCountries(new Set([id]));
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
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, zIndex: 100 },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
    toggleContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(226, 232, 240, 0.6)', padding: 4, borderRadius: 20 },
    toggleButton: { padding: 6, borderRadius: 16 },
    toggleButtonActive: { backgroundColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
    verticalDivider: { width: 1, height: 16, backgroundColor: '#CBD5E1', marginHorizontal: 4 },
});
