import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
  historyDashboardColors,
  historyDashboardRadii as radii,
  type HistoryDashboardColors,
} from './historyDashboardTokens';

type HistorySurfaceCardProps = {
  accentWashColor?: string;
  children: React.ReactNode;
  colors?: HistoryDashboardColors;
  contentStyle?: StyleProp<ViewStyle>;
  coolWashColor?: string;
  style?: StyleProp<ViewStyle>;
  warmWashColor?: string;
};

export default function HistorySurfaceCard({
  accentWashColor,
  children,
  colors: providedColors,
  contentStyle,
  coolWashColor,
  style,
  warmWashColor,
}: HistorySurfaceCardProps): React.JSX.Element {
  const colors = providedColors ?? historyDashboardColors;
  const isLightPalette = colors === historyDashboardColors;
  const resolvedAccentWashColor = accentWashColor ?? colors.pearlMist;
  const resolvedCoolWashColor = coolWashColor ?? colors.pearlSage;
  const resolvedWarmWashColor = warmWashColor ?? colors.pearlPeach;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceStrong,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {isLightPalette ? (
        <PearlSurfaceOverlay
          accentWashColor={resolvedAccentWashColor}
          baseBottomColor={colors.surface}
          baseTopColor={colors.pearlIvory}
          coolWashColor={resolvedCoolWashColor}
          warmWashColor={resolvedWarmWashColor}
        />
      ) : null}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    gap: 16,
    padding: 20,
  },
});
