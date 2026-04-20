import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import HistorySurfaceCard from './HistorySurfaceCard';
import {
  historyDashboardColors as colors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardTypography as typography,
} from './historyDashboardTokens';
import { useI18n } from '@/features/i18n';

type HistorySelectionUtilityBarProps = {
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  onSelectAll: () => void;
  selectedCount: number;
  totalCount: number;
};

export default function HistorySelectionUtilityBar({
  onClearSelection,
  onDeleteSelection,
  onSelectAll,
  selectedCount,
  totalCount,
}: HistorySelectionUtilityBarProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <HistorySurfaceCard accentWashColor={colors.pearlMist}>
      <View style={styles.row}>
        <Text style={styles.copy}>
          {t('history.utility.selectionTemplate', '{selected}/{total} 선택').replace(
            '{selected}',
            String(selectedCount)
          ).replace('{total}', String(totalCount))}
        </Text>

        <View style={styles.actions}>
          <Pressable onPress={onSelectAll} style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}>
            <Text style={styles.buttonLabel}>{t('history.utility.selectAll', '전체')}</Text>
          </Pressable>
          <Pressable onPress={onClearSelection} style={({ pressed }) => [styles.button, pressed ? styles.pressed : null]}>
            <Text style={styles.buttonLabel}>{t('history.utility.clearSelection', '해제')}</Text>
          </Pressable>
          <Pressable onPress={onDeleteSelection} style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}>
            <Text style={styles.deleteLabel}>{t('history.utility.delete', '삭제')}</Text>
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
    gap: spacing.xs,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  buttonLabel: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 14,
  },
  copy: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.bodyStrong,
    fontWeight: '700',
    lineHeight: 18,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.accentRedSoft,
    borderColor: colors.accentRed,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  deleteLabel: {
    color: colors.accentRed,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 14,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  row: {
    gap: spacing.sm,
  },
});
