import React from 'react';
import { Globe, List, PenLine, ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ArchiveMode } from '../types/history.types';
import {
  historyDashboardColors as colors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardTypography as typography,
} from './historyDashboardTokens';
import { useI18n } from '@/features/i18n';

type HistoryJournalRailProps = {
  archiveMode: ArchiveMode;
  isEditMode: boolean;
  isMapModeAvailable: boolean;
  onBack: () => void;
  onSwitchMode: (mode: ArchiveMode) => void;
  onToggleEdit: () => void;
};

export default function HistoryJournalRail({
  archiveMode,
  isEditMode,
  isMapModeAvailable,
  onBack,
  onSwitchMode,
  onToggleEdit,
}: HistoryJournalRailProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Pressable
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
        >
          <ChevronLeft color={colors.ink} size={18} />
        </Pressable>

        <View style={styles.copy}>
          <Text style={styles.title}>{t('history.rail.title', '푸드 패스포트')}</Text>
          <Text style={styles.subtitle}>
            {archiveMode === 'list'
              ? t('history.rail.listMode', '저널')
              : t('history.rail.mapMode', '아틀라스')}
          </Text>
        </View>

        <View style={styles.utilityRow}>
          {archiveMode === 'list' ? (
            <Pressable
              hitSlop={8}
              onPress={onToggleEdit}
              style={({ pressed }) => [
                styles.editButton,
                isEditMode ? styles.editButtonActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <PenLine color={isEditMode ? colors.white : colors.ink} size={14} />
              <Text style={[styles.editLabel, isEditMode ? styles.editLabelActive : null]}>
                {isEditMode
                  ? t('history.utility.done', '완료')
                  : t('history.utility.edit', '편집')}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.modeSwitch}>
            <Pressable
              hitSlop={8}
              disabled={!isMapModeAvailable}
              onPress={() => onSwitchMode('map')}
              style={({ pressed }) => [
                styles.modeButton,
                archiveMode === 'map' ? styles.modeButtonActive : null,
                !isMapModeAvailable ? styles.modeButtonDisabled : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Globe color={archiveMode === 'map' ? colors.white : colors.inkSoft} size={16} />
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => onSwitchMode('list')}
              style={({ pressed }) => [
                styles.modeButton,
                archiveMode === 'list' ? styles.modeButtonActive : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <List color={archiveMode === 'list' ? colors.white : colors.inkSoft} size={16} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 0,
    paddingTop: 0,
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  editButtonActive: {
    backgroundColor: colors.accentBlue,
    borderColor: colors.accentBlue,
  },
  editLabel: {
    color: colors.ink,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  editLabelActive: {
    color: colors.white,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: radii.xs,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  modeButtonActive: {
    backgroundColor: colors.accentBlue,
  },
  modeButtonDisabled: {
    opacity: 0.42,
  },
  modeSwitch: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 3,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 48,
  },
  subtitle: {
    color: colors.inkSoft,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0.6,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: typography.bodyStrong,
    fontWeight: '800',
    lineHeight: 20,
  },
  utilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
