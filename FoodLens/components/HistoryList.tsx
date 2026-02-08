import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, LayoutAnimation, ActivityIndicator } from 'react-native';
import { HapticTouchableOpacity } from './HapticFeedback';
import { List, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FilterType } from '../hooks/useHistoryFilter';
import { CountryData } from '../models/History';
import CountryCard from './CountryCard';
import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

interface HistoryListProps {
    data: CountryData[];
    loading: boolean;
    refreshing: boolean;
    onRefresh: () => void;
    filter: FilterType;
    setFilter: (f: FilterType) => void;
    matchesFilter: (type: string | undefined) => boolean;
    isAllowedItemType: (type: string | undefined) => boolean;
    expandedCountries: Set<string>;
    onToggleCountry: (id: string) => void;
    isEditMode: boolean;
    selectedItems: Set<string>;
    onToggleItem: (id: string) => void;
    onDelete: (id: string) => void;
    onBulkDelete: () => void;
}

export default function HistoryList({
    data,
    loading,
    refreshing,
    onRefresh,
    filter,
    setFilter,
    matchesFilter,
    isAllowedItemType,
    expandedCountries,
    onToggleCountry,
    isEditMode,
    selectedItems,
    onToggleItem,
    onDelete,
    onBulkDelete
}: HistoryListProps) {
    const scrollViewRef = useRef<ScrollView>(null);
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    return (
        <View style={{flex: 1}}>
            <ScrollView 
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ref={scrollViewRef}
                contentContainerStyle={{paddingHorizontal: 24, paddingBottom: 40}}
                showsVerticalScrollIndicator={false}
            >
                {/* Filter Chips */}
                <View style={[
                    styles.filterContainer,
                    {backgroundColor: colorScheme === 'dark' ? theme.glass : 'rgba(226, 232, 240, 0.4)', borderColor: theme.border}
                ]}>
                    {(['all', 'ok', 'avoid', 'ask'] as const).map(f => (
                        <HapticTouchableOpacity 
                            key={f}
                            onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setFilter(f);
                            }}
                            style={[
                                styles.filterChip,
                                filter === f && [styles.filterChipActive, {backgroundColor: theme.surface, shadowColor: theme.shadow}]
                            ]}
                            hapticType="selection"
                        >
                            <View pointerEvents="none">
                                <Text style={[
                                    styles.filterText,
                                    {color: theme.textSecondary},
                                    filter === f && [styles.filterTextActive, {color: theme.primary}]
                                ]}>{f === 'ask' ? 'ASK' : f.toUpperCase()}</Text>
                            </View>
                        </HapticTouchableOpacity>
                    ))}
                </View>

                {/* Countries List */}
                <View style={{gap: 16}}>
                     {loading ? (
                        <View style={{alignItems: 'center', marginTop: 40}}>
                            <ActivityIndicator color={theme.textPrimary} />
                            <Text style={{marginTop: 16, color: theme.textSecondary}}>Loading Passport...</Text>
                        </View>
                     ) : data.length === 0 ? (
                        <View style={{alignItems: 'center', marginTop: 40, opacity: 0.5}}>
                            <List size={48} color={theme.textSecondary} />
                            <Text style={{marginTop: 16, fontSize: 16, fontWeight: '600', color: theme.textSecondary}}>No records found</Text>
                        </View>
                    ) : data.map((country, countryIdx) => {
                        const isExpanded = expandedCountries.has(`${country.country}-${countryIdx}`);
                        return (
                            <CountryCard
                                key={`${country.country}-${countryIdx}`}
                                country={country}
                                countryIdx={countryIdx}
                                isExpanded={isExpanded}
                                onToggle={() => onToggleCountry(`${country.country}-${countryIdx}`)}
                                filter={filter}
                                matchesFilter={matchesFilter}
                                isAllowedItemType={isAllowedItemType}
                                isEditMode={isEditMode}
                                selectedItems={selectedItems}
                                onToggleItem={onToggleItem}
                                onDelete={onDelete}
                            />
                        );
                    })}
                </View>
            </ScrollView>

            {/* Floating Delete Bar */}
            {isEditMode && selectedItems.size > 0 && (
                <LinearGradient
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', '#FFFFFF']}
                    style={styles.floatingBarContainer}
                    pointerEvents="box-none"
                >
                    <HapticTouchableOpacity 
                        onPress={onBulkDelete}
                        style={styles.floatingDeleteButton}
                        activeOpacity={0.9}
                        hapticType="warning"
                    >
                        <View style={styles.floatingDeleteContent}>
                            <Trash2 size={24} color="white" />
                            <Text style={styles.floatingDeleteText}>Delete ({selectedItems.size})</Text>
                        </View>
                    </HapticTouchableOpacity>
                </LinearGradient>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    filterContainer: { flexDirection: 'row', padding: 6, borderRadius: 22, borderWidth: 1, marginBottom: 24, gap: 8 },
    filterChip: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 17 },
    filterChipActive: { shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
    filterText: { fontSize: 11, fontWeight: '800' },
    filterTextActive: { },
    floatingBarContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40, zIndex: 200 },
    floatingDeleteButton: { backgroundColor: '#EF4444', borderRadius: 30, paddingHorizontal: 24, paddingVertical: 14, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
    floatingDeleteContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    floatingDeleteText: { color: 'white', fontWeight: '700', fontSize: 16 }
});
