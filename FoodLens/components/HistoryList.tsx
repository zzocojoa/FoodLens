import React, { useCallback } from 'react';
import { View, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import HistoryFilterChips from '@/components/historyList/components/HistoryFilterChips';
import HistoryFloatingDeleteBar from '@/components/historyList/components/HistoryFloatingDeleteBar';
import { HistoryListProps } from '@/components/historyList/types';
import HistoryListEmptyState from '@/components/historyList/components/HistoryListEmptyState';
import HistoryListItemRenderer from '@/components/historyList/components/HistoryListItemRenderer';
import { useHistoryListController } from '@/components/historyList/hooks/useHistoryListController';
import { FlattenedHistoryItem } from '@/hooks/historyDataUtils';
import { historyListViewStyles as styles } from '@/components/historyList/styles';

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
    const controller = useHistoryListController({
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
        onBulkDelete,
    });

    const renderItem = useCallback(
        ({ item }: { item: FlattenedHistoryItem }) => (
            <HistoryListItemRenderer
                item={item}
                colorScheme={controller.colorScheme}
                theme={controller.theme}
                expandedCountries={expandedCountries}
                onToggleCountry={onToggleCountry}
                isEditMode={isEditMode}
                selectedItems={selectedItems}
                onToggleItem={onToggleItem}
                onFoodItemPress={controller.handleFoodItemPress}
            />
        ),
        [
            controller.colorScheme,
            controller.theme,
            controller.handleFoodItemPress,
            expandedCountries,
            onToggleCountry,
            isEditMode,
            selectedItems,
            onToggleItem,
        ]
    );

    const AnyFlashList = FlashList as any;

    return (
        <View style={styles.container}>
            <AnyFlashList
                data={controller.flattenedData}
                renderItem={renderItem}
                keyExtractor={controller.keyExtractor}
                estimatedItemSize={100}
                ListHeaderComponent={<HistoryFilterChips filter={filter} setFilter={setFilter} />}
                ListHeaderComponentStyle={styles.headerComponent}
                contentContainerStyle={controller.contentContainerStyle}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={<HistoryListEmptyState loading={loading} theme={controller.theme} />}
                showsVerticalScrollIndicator={false}
                getItemType={controller.getItemType}
            />

            {controller.hasSelection && (
                <HistoryFloatingDeleteBar
                    selectedCount={selectedItems.size}
                    onBulkDelete={() => onBulkDelete(selectedItems)}
                />
            )}
        </View>
    );
}
