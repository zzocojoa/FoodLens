import React, { useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { List } from 'lucide-react-native';
import CountryCard from './CountryCard';
import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';
import HistoryFilterChips from './historyList/components/HistoryFilterChips';
import HistoryFloatingDeleteBar from './historyList/components/HistoryFloatingDeleteBar';
import { HistoryListProps } from './historyList/types';

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
                contentContainerStyle={{
                    paddingHorizontal: 24, 
                    paddingBottom: isEditMode && selectedItems.size > 0 ? 140 : 40 
                }}
                showsVerticalScrollIndicator={false}
            >
                <HistoryFilterChips filter={filter} setFilter={setFilter} />

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

            {isEditMode && selectedItems.size > 0 && (
                <HistoryFloatingDeleteBar
                    selectedCount={selectedItems.size}
                    onBulkDelete={onBulkDelete}
                />
            )}
        </View>
    );
}
