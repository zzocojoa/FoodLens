import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import HistorySurfaceCard from './HistorySurfaceCard';
import {
  historyDashboardColors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardTypography as typography,
  type HistoryDashboardColors,
} from './historyDashboardTokens';
import { useI18n } from '@/features/i18n';

type HistorySelectionUtilityBarProps = {
  colors: HistoryDashboardColors;
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  onSelectAll: () => void;
  selectedCount: number;
  totalCount: number;
};

export default function HistorySelectionUtilityBar({
  colors,
  onClearSelection,
  onDeleteSelection,
  onSelectAll,
  selectedCount,
  totalCount,
}: HistorySelectionUtilityBarProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <HistorySurfaceCard accentWashColor={colors.pearlMist} colors={colors}>
      <View style={styles.row}>
        <Text style={[styles.copy, { color: colors.ink }]}>
          {t('history.utility.selectionTemplate', '{selected}/{total} 선택').replace(
            '{selected}',
            String(selectedCount)
          ).replace('{total}', String(totalCount))}
        </Text>

        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={t('history.accessibility.selectAllVisible', '보이는 기록 모두 선택')}
            accessibilityRole="button"
            onPress={onSelectAll}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.surfaceStrong, borderColor: colors.line },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.buttonLabel, { color: colors.ink }]}>{t('history.utility.selectAll', '전체')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('history.accessibility.clearSelection', '선택 해제')}
            accessibilityRole="button"
            onPress={onClearSelection}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.surfaceStrong, borderColor: colors.line },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.buttonLabel, { color: colors.ink }]}>{t('history.utility.clearSelection', '해제')}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={t('history.accessibility.deleteSelection', '선택한 기록 삭제')}
            accessibilityRole="button"
            accessibilityState={{ disabled: selectedCount === 0 }}
            disabled={selectedCount === 0}
            onPress={onDeleteSelection}
            style={({ pressed }) => [
              styles.deleteButton,
              { backgroundColor: colors.accentRedSoft, borderColor: colors.accentRed },
              selectedCount === 0 ? styles.disabledButton : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.deleteLabel, { color: colors.accentRed }]}>{t('history.utility.delete', '삭제')}</Text>
          </Pressable>
        </View>
      </View>
    </HistorySurfaceCard>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    backgroundColor: historyDashboardColors.surfaceStrong,
    borderColor: historyDashboardColors.line,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: spacing.md,
  },
  buttonLabel: {
    color: historyDashboardColors.ink,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  copy: {
    color: historyDashboardColors.ink,
    flex: 1,
    fontSize: typography.bodyStrong,
    fontWeight: '700',
    lineHeight: 18,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: historyDashboardColors.accentRedSoft,
    borderColor: historyDashboardColors.accentRed,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: spacing.md,
  },
  deleteLabel: {
    color: historyDashboardColors.accentRed,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  disabledButton: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  row: {
    gap: spacing.sm,
  },
});
