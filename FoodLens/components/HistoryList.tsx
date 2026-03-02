import React, { useCallback } from 'react';
import { View, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import HistoryFilterChips from '@/components/historyList/components/HistoryFilterChips';
import HistoryFloatingDeleteBar from '@/components/historyList/components/HistoryFloatingDeleteBar';
import HistoryEditSelectionBar from '@/components/historyList/components/HistoryEditSelectionBar';
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
    onReplaceSelection,
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
        onReplaceSelection,
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
                onDelete={onDelete}
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
            onDelete,
        ]
    );

    const AnyFlashList = FlashList as any;

    const handleSelectAllVisible = useCallback(() => {
        onReplaceSelection(new Set(controller.selectableItemIds));
    }, [controller.selectableItemIds, onReplaceSelection]);

    const handleClearSelection = useCallback(() => {
        onReplaceSelection(new Set());
    }, [onReplaceSelection]);

    return (
        <View style={styles.container}>
            <AnyFlashList
                data={controller.flattenedData}
                renderItem={renderItem}
                keyExtractor={controller.keyExtractor}
                estimatedItemSize={100}
                ListHeaderComponent={
                    <View>
                        <HistoryFilterChips filter={filter} setFilter={setFilter} />
                        {isEditMode && (
                            <HistoryEditSelectionBar
                                totalCount={controller.selectableItemIds.length}
                                selectedCount={selectedItems.size}
                                onSelectAll={handleSelectAllVisible}
                                onClearSelection={handleClearSelection}
                            />
                        )}
                    </View>
                }
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
