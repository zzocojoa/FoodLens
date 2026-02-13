import React, { useMemo, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, StyleSheet } from 'react-native';
import { List } from 'lucide-react-native';
import CountryCard from './CountryCard';
import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
import HistoryFilterChips from './historyList/components/HistoryFilterChips';
import HistoryFloatingDeleteBar from './historyList/components/HistoryFloatingDeleteBar';
import { HistoryListProps } from './historyList/types';

const BASE_BOTTOM_PADDING = 40;
const EDIT_MODE_BOTTOM_PADDING = 140;
const HORIZONTAL_PADDING = 24;
const COUNTRY_GAP = 16;
const EMPTY_STATE_TOP_MARGIN = 40;
const EMPTY_STATE_OPACITY = 0.5;

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
    const hasSelection = isEditMode && selectedItems.size > 0;

    const contentContainerStyle = useMemo(
        () => ({
            paddingHorizontal: HORIZONTAL_PADDING,
            paddingBottom: hasSelection ? EDIT_MODE_BOTTOM_PADDING : BASE_BOTTOM_PADDING,
        }),
        [hasSelection]
    );

    return (
        <View style={styles.container}>
            <ScrollView 
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ref={scrollViewRef}
                contentContainerStyle={contentContainerStyle}
                showsVerticalScrollIndicator={false}
            >
                <HistoryFilterChips filter={filter} setFilter={setFilter} />

                {/* Countries List */}
                <View style={styles.countryList}>
                     {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator color={theme.textPrimary} />
                            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Passport...</Text>
                        </View>
                     ) : data.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <List size={48} color={theme.textSecondary} />
                            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No records found</Text>
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

            {isEditMode && selectedItems.size > 0 && (
                <HistoryFloatingDeleteBar
                    selectedCount={selectedItems.size}
                    onBulkDelete={onBulkDelete}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    countryList: { gap: COUNTRY_GAP },
    loadingContainer: { alignItems: 'center', marginTop: EMPTY_STATE_TOP_MARGIN },
    loadingText: { marginTop: 16 },
    emptyContainer: { alignItems: 'center', marginTop: EMPTY_STATE_TOP_MARGIN, opacity: EMPTY_STATE_OPACITY },
    emptyText: { marginTop: 16, fontSize: 16, fontWeight: '600' },
});
