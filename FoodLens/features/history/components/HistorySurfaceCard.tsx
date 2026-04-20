import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
  historyDashboardColors as colors,
  historyDashboardRadii as radii,
} from './historyDashboardTokens';

type HistorySurfaceCardProps = {
  accentWashColor?: string;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  coolWashColor?: string;
  style?: StyleProp<ViewStyle>;
  warmWashColor?: string;
};

export default function HistorySurfaceCard({
  accentWashColor,
  children,
  contentStyle,
  coolWashColor,
  style,
  warmWashColor,
}: HistorySurfaceCardProps): React.JSX.Element {
  const resolvedAccentWashColor = accentWashColor ?? colors.pearlMist;
  const resolvedCoolWashColor = coolWashColor ?? colors.pearlSage;
  const resolvedWarmWashColor = warmWashColor ?? colors.pearlPeach;

  return (
    <View style={[styles.card, style]}>
      <PearlSurfaceOverlay
        accentWashColor={resolvedAccentWashColor}
        baseBottomColor={colors.surface}
        baseTopColor={colors.pearlIvory}
        coolWashColor={resolvedCoolWashColor}
        warmWashColor={resolvedWarmWashColor}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.line,
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
