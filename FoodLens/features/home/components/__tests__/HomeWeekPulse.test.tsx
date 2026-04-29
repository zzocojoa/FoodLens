import React from 'react';
import { StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';

import type { WeeklyData } from '../../../../components/weeklyStatsStrip/types';
import HomeWeekPulse from '../HomeWeekPulse';
import { homeDashboardDarkColors } from '../homeDashboardTokens';

const createWeeklyItem = (
  day: number,
  hasSafe: boolean,
  hasWarning: boolean,
  hasDanger: boolean,
): WeeklyData => ({
  date: new Date(2026, 3, day),
  hasData: hasSafe || hasWarning || hasDanger,
  hasSafe,
  hasWarning,
  hasDanger,
});

describe('HomeWeekPulse', () => {
  it('uses the provided dark dashboard colors for signal dots', () => {
    const weeklyStats: WeeklyData[] = [
      createWeeklyItem(26, true, false, false),
      createWeeklyItem(27, false, true, false),
      createWeeklyItem(28, false, false, true),
      createWeeklyItem(29, false, false, false),
    ];

    const { UNSAFE_getAllByType } = render(
      <HomeWeekPulse
        colorScheme="dark"
        colors={homeDashboardDarkColors}
        locale="en-US"
        metaLabel="Week"
        selectedDate={new Date(2026, 3, 28)}
        title="Pulse"
        weeklyStats={weeklyStats}
      />,
    );

    const signalDotColors = UNSAFE_getAllByType(View)
      .map((node) => StyleSheet.flatten(node.props.style))
      .filter((style) => style?.width === 8 && style?.height === 8)
      .map((style) => style.backgroundColor);

    expect(signalDotColors).toEqual([
      homeDashboardDarkColors.accentGreen,
      homeDashboardDarkColors.accentAmber,
      homeDashboardDarkColors.accentRed,
      homeDashboardDarkColors.lineStrong,
    ]);
  });
});
