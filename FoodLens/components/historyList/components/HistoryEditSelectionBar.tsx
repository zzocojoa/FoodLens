import React from 'react';
import { Text, View } from 'react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { historyListViewStyles as styles } from '@/components/historyList/styles';
import { useI18n } from '@/features/i18n';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type HistoryEditSelectionBarProps = {
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
};

export default function HistoryEditSelectionBar({
  totalCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
}: HistoryEditSelectionBarProps) {
  const { t } = useI18n();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return (
    <View style={[styles.editSelectionBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.editSelectionCount, { color: theme.textSecondary }]}>
        {t('history.action.selectedCountTemplate', '{selected}/{total} selected')
          .replace('{selected}', String(selectedCount))
          .replace('{total}', String(totalCount))}
      </Text>
      <View style={styles.editSelectionActions}>
        <HapticTouchableOpacity
          hapticType="selection"
          style={[styles.editSelectionButton, { borderColor: theme.border }]}
          onPress={onSelectAll}
        >
          <Text style={[styles.editSelectionButtonText, { color: theme.textPrimary }]}>
            {t('history.action.selectAll', 'Select all')}
          </Text>
        </HapticTouchableOpacity>
        <HapticTouchableOpacity
          hapticType="selection"
          style={[styles.editSelectionButton, { borderColor: theme.border }]}
          onPress={onClearSelection}
        >
          <Text style={[styles.editSelectionButtonText, { color: theme.textPrimary }]}>
            {t('history.action.clearSelection', 'Clear')}
          </Text>
        </HapticTouchableOpacity>
      </View>
    </View>
  );
}
