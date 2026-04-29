import React from 'react';
import { LayoutAnimation, StyleSheet, Text, View } from 'react-native';

import type { FilterType } from '@/hooks/useHistoryFilter';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { HISTORY_FILTERS, toFilterLabel } from '@/components/historyList/constants';
import { useI18n } from '@/features/i18n';
import { configureHistoryLayoutAnimation } from '../utils/historyLayoutAnimation';

import {
  getHistoryDashboardToneTokens,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardToneTokens,
  historyDashboardTypography as typography,
  type HistoryDashboardColors,
} from './historyDashboardTokens';

type HistoryFilterRailProps = {
  colors: HistoryDashboardColors;
  filter: FilterType;
  isReduceMotionEnabled: boolean;
  onChange: (filter: FilterType) => void;
};

const filterToneMap: Record<FilterType, keyof typeof historyDashboardToneTokens> = {
  all: 'accent',
  ask: 'caution',
  avoid: 'danger',
  ok: 'safe',
};

export default function HistoryFilterRail({
  colors: dashboardColors,
  filter,
  isReduceMotionEnabled,
  onChange,
}: HistoryFilterRailProps): React.JSX.Element {
  const { t } = useI18n();
  const toneTokens = getHistoryDashboardToneTokens(dashboardColors);

  return (
    <View style={styles.container}>
      {HISTORY_FILTERS.map((value) => {
        const tone = toneTokens[filterToneMap[value]];
        const isActive = filter === value;

        return (
          <HapticTouchableOpacity
            accessibilityLabel={toFilterLabel(value, t)}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            key={value}
            hapticType="selection"
            onPress={() => {
              configureHistoryLayoutAnimation(isReduceMotionEnabled, LayoutAnimation.Presets.easeInEaseOut);
              onChange(value);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: isActive ? tone.backgroundColor : dashboardColors.surfaceStrong,
                borderColor: isActive ? tone.borderColor : dashboardColors.line,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: isActive ? tone.textColor : dashboardColors.inkSoft },
              ]}
            >
              {toFilterLabel(value, t)}
            </Text>
          </HapticTouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingBottom: spacing.xs,
    paddingTop: spacing.xs,
  },
  label: {
    fontSize: typography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
});
