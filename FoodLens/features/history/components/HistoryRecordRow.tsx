import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Circle, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { FoodThumbnail } from '@/components/FoodThumbnail';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { useI18n } from '@/features/i18n';
import { formatCalendarDate } from '@/features/i18n/services/formatService';

import type { HistoryRecentEntry } from '../types/historyViewModel.types';
import {
  historyDashboardColors as colors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardToneTokens,
  historyDashboardTypography as typography,
} from './historyDashboardTokens';

type HistoryRecordRowProps = {
  entry: HistoryRecentEntry;
  isEditMode: boolean;
  isSelected: boolean;
  onDelete: (id: string) => void;
  onPress: (entry: HistoryRecentEntry) => void;
  onToggleSelect: (id: string) => void;
};

const toneMap = {
  ask: historyDashboardToneTokens.caution,
  avoid: historyDashboardToneTokens.danger,
  ok: historyDashboardToneTokens.safe,
} as const;

export default function HistoryRecordRow({
  entry,
  isEditMode,
  isSelected,
  onDelete,
  onPress,
  onToggleSelect,
}: HistoryRecordRowProps): React.JSX.Element {
  const { locale, t } = useI18n();
  const tone = toneMap[entry.tone];
  const dateLabel = formatCalendarDate(entry.timestamp, locale);
  const locationLabel = `${entry.cityLabel}, ${entry.countryLabel}`;
  const combinedMetaLabel = `${locationLabel} · ${dateLabel}`;

  const renderRightActions = (
    dragX: Animated.AnimatedInterpolation<number>
  ): React.JSX.Element => {
    const translateX = dragX.interpolate({
      extrapolate: 'clamp',
      inputRange: [-84, 0],
      outputRange: [0, 84],
    });

    return (
      <Pressable onPress={() => onDelete(entry.id)} style={styles.deleteAction}>
        <Animated.View style={[styles.deleteContent, { transform: [{ translateX }] }]}>
          <Trash2 color={colors.white} size={18} />
          <Text style={styles.deleteText}>{t('common.delete', '삭제')}</Text>
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrapper}>
      <Swipeable
        enabled={!isEditMode}
        overshootRight={false}
        renderRightActions={(_progress, dragX) =>
          renderRightActions(dragX as Animated.AnimatedInterpolation<number>)
        }
    >
      <HapticTouchableOpacity
        hapticType="light"
        onPress={() => {
            if (isEditMode) {
              onToggleSelect(entry.id);
              return;
            }

          onPress(entry);
        }}
        style={styles.row}
      >
          <View style={[styles.toneRail, { backgroundColor: tone.borderColor }]} />

          {isEditMode ? (
            <Pressable onPress={() => onToggleSelect(entry.id)} style={styles.selectionButton}>
              {isSelected ? (
                <CheckCircle2 color={colors.accentBlue} fill={colors.white} size={20} />
              ) : (
                <Circle color={colors.lineStrong} size={20} />
              )}
            </Pressable>
          ) : null}

          <View style={styles.thumbnail}>
            <FoodThumbnail
              emoji={entry.emoji}
              fallbackFontSize={20}
              imageStyle={styles.thumbnailImage}
              style={styles.thumbnailImage}
              uri={entry.imageUri}
            />
          </View>

          <View style={styles.copy}>
            <Text numberOfLines={1} style={styles.title}>
              {entry.foodName}
            </Text>
            <Text numberOfLines={1} style={styles.meta}>
              {combinedMetaLabel}
            </Text>
          </View>

          <View style={[styles.tonePill, { backgroundColor: tone.backgroundColor, borderColor: tone.borderColor }]}>
            <Text style={[styles.toneLabel, { color: tone.textColor }]}>
              {entry.tone === 'ok'
                ? t('history.utility.safe', '안전')
                : entry.tone === 'avoid'
                  ? t('history.utility.avoid', '회피')
                  : t('history.utility.ask', '확인')}
            </Text>
          </View>
        </HapticTouchableOpacity>
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  deleteAction: {
    alignItems: 'center',
    backgroundColor: colors.accentRed,
    borderCurve: 'continuous',
    borderRadius: radii.lg,
    justifyContent: 'center',
    marginVertical: 2,
    width: 88,
  },
  deleteContent: {
    alignItems: 'center',
    gap: 6,
  },
  deleteText: {
    color: colors.white,
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 14,
  },
  meta: {
    color: colors.inkSoft,
    fontSize: typography.caption - 1,
    lineHeight: 14,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 72,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  selectionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toneRail: {
    alignSelf: 'stretch',
    borderRadius: radii.pill,
    marginRight: spacing.xs,
    width: 3,
  },
  thumbnail: {
    alignItems: 'center',
    backgroundColor: colors.paperMuted,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  thumbnailImage: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    height: '100%',
    width: '100%',
  },
  title: {
    color: colors.ink,
    fontSize: typography.bodyStrong,
    fontWeight: '700',
    lineHeight: 17,
  },
  toneLabel: {
    fontSize: typography.caption - 1,
    fontWeight: '700',
    lineHeight: 12,
  },
  tonePill: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minWidth: 48,
    paddingHorizontal: spacing.xs + 1,
    paddingVertical: 5,
  },
  wrapper: {
    marginVertical: 1,
  },
});
