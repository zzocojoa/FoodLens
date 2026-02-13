import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { flattenHistoryData, FlattenedHistoryItem } from '@/hooks/historyDataUtils';
import { HistoryListProps } from '@/components/historyList/types';
import { getListPaddingBottom, HORIZONTAL_PADDING } from '@/components/historyList/utils/layout';
import { navigateToResultFromHistory } from '@/components/historyList/services/historyNavigationService';

export const useHistoryListController = (props: HistoryListProps) => {
  const {
    data,
    expandedCountries,
    filter,
    matchesFilter,
    isAllowedItemType,
    isEditMode,
    selectedItems,
    onToggleItem,
  } = props;

  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const hasSelection = isEditMode && selectedItems.size > 0;

  const flattenedData = useMemo(
    () =>
      flattenHistoryData(
        data,
        expandedCountries,
        filter,
        matchesFilter,
        isAllowedItemType
      ),
    [data, expandedCountries, filter, matchesFilter, isAllowedItemType]
  );

  const handleFoodItemPress = useCallback(
    (item: any) => {
      if (isEditMode) {
        onToggleItem(item.id);
        return;
      }
      navigateToResultFromHistory(router, item.originalRecord);
    },
    [isEditMode, onToggleItem, router]
  );

  const keyExtractor = useCallback((item: FlattenedHistoryItem) => item.id, []);
  const getItemType = useCallback((item: FlattenedHistoryItem) => item.type, []);

  const contentContainerStyle = useMemo(
    () => ({
      paddingHorizontal: HORIZONTAL_PADDING,
      paddingBottom: getListPaddingBottom(isEditMode, selectedItems.size),
    }),
    [isEditMode, selectedItems.size]
  );

  return {
    colorScheme,
    theme,
    flattenedData,
    hasSelection,
    handleFoodItemPress,
    keyExtractor,
    getItemType,
    contentContainerStyle,
  };
};
