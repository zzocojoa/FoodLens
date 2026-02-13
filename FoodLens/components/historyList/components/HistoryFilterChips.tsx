import React from 'react';
import { LayoutAnimation, Text, View } from 'react-native';
import { Colors } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import { FilterType } from '../../../hooks/useHistoryFilter';
import { HapticTouchableOpacity } from '../../HapticFeedback';
import { HISTORY_FILTERS, toFilterLabel } from '@/components/historyList/constants';
import { historyListStyles as styles } from '@/components/historyList/styles';

type HistoryFilterChipsProps = {
  filter: FilterType;
  setFilter: (filter: FilterType) => void;
};

export default function HistoryFilterChips({ filter, setFilter }: HistoryFilterChipsProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View
      style={[
        styles.filterContainer,
        {
          backgroundColor: colorScheme === 'dark' ? theme.glass : 'rgba(226, 232, 240, 0.4)',
          borderColor: theme.border,
        },
      ]}
    >
      {HISTORY_FILTERS.map((filterValue) => (
        <HapticTouchableOpacity
          key={filterValue}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setFilter(filterValue);
          }}
          style={[
            styles.filterChip,
            filter === filterValue && [
              styles.filterChipActive,
              { backgroundColor: theme.surface, shadowColor: theme.shadow },
            ],
          ]}
          hapticType="selection"
        >
          <View pointerEvents="none">
            <Text
              style={[
                styles.filterText,
                { color: theme.textSecondary },
                filter === filterValue && [styles.filterTextActive, { color: theme.primary }],
              ]}
            >
              {toFilterLabel(filterValue)}
            </Text>
          </View>
        </HapticTouchableOpacity>
      ))}
    </View>
  );
}
