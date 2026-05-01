import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { homeDashboardStyles } from './homeDashboardStyles';
import PearlSurfaceOverlay from './PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
  type HomeDashboardColors,
  type HomeDashboardColorScheme,
} from './homeDashboardTokens';
import { markHomeNavigationTrace } from '../services/homeNavigationTrace';
import type { HomeNavigationTraceTarget } from '../services/homeNavigationTrace';

type HomeQuickActionsProps = {
  colorScheme: HomeDashboardColorScheme;
  colors: HomeDashboardColors;
  allergiesDescription: string;
  allergiesTitle: string;
  allergiesValue: string;
  historyDescription: string;
  historyTitle: string;
  historyValue: string;
  tripStatsDescription: string;
  tripStatsTitle: string;
  tripStatsValue: string;
  onOpenAllergies: () => void;
  onOpenHistory: () => void;
  onOpenTripStats: () => void;
};

type QuickActionCardProps = {
  accentBackgroundColor: string;
  accentTextColor: string;
  colorScheme: HomeDashboardColorScheme;
  colors: HomeDashboardColors;
  description: string;
  navigationTraceTarget: HomeNavigationTraceTarget;
  overlayAccentColor: string;
  overlayCoolColor: string;
  overlayWarmColor: string;
  testID: string;
  title: string;
  value: string;
  onPress: () => void;
};

function QuickActionCard({
  accentBackgroundColor,
  accentTextColor,
  colorScheme,
  colors,
  description,
  navigationTraceTarget,
  overlayAccentColor,
  overlayCoolColor,
  overlayWarmColor,
  testID,
  title,
  value,
  onPress,
}: QuickActionCardProps) {
  const handlePress = React.useCallback((): void => {
    markHomeNavigationTrace(navigationTraceTarget, 'card_press');
    onPress();
  }, [navigationTraceTarget, onPress]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        homeDashboardStyles.sectionCard,
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line },
        {
          opacity: pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      {colorScheme === 'light' ? (
        <PearlSurfaceOverlay
          accentWashColor={overlayAccentColor}
          baseBottomColor="#FFF8F0"
          baseTopColor={colors.pearlIvory}
          coolWashColor={overlayCoolColor}
          warmWashColor={overlayWarmColor}
        />
      ) : null}
      <View style={[styles.valueBadge, { backgroundColor: accentBackgroundColor }]}>
        <Text style={[styles.valueBadgeText, { color: accentTextColor }]}>{value}</Text>
      </View>
      <View style={styles.copyBlock}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: colors.ink }]}>
          {title}
        </Text>
        <Text numberOfLines={4} style={[styles.cardDescription, { color: colors.inkSoft }]}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeQuickActions({
  colorScheme,
  colors,
  allergiesDescription,
  allergiesTitle,
  allergiesValue,
  historyDescription,
  historyTitle,
  historyValue,
  tripStatsDescription,
  tripStatsTitle,
  tripStatsValue,
  onOpenAllergies,
  onOpenHistory,
  onOpenTripStats,
}: HomeQuickActionsProps) {
  return (
    <View style={styles.row}>
      <QuickActionCard
        accentBackgroundColor={colors.accentRedSoft}
        accentTextColor={colors.accentRed}
        colorScheme={colorScheme}
        colors={colors}
        description={allergiesDescription}
        overlayAccentColor="rgba(185, 70, 62, 0.18)"
        overlayCoolColor={homeDashboardColors.pearlGlow}
        overlayWarmColor={homeDashboardColors.pearlPeach}
        navigationTraceTarget="allergies"
        testID="home-quick-action-allergies"
        title={allergiesTitle}
        value={allergiesValue}
        onPress={onOpenAllergies}
      />
      <QuickActionCard
        accentBackgroundColor={colors.accentBlue}
        accentTextColor={colorScheme === 'dark' ? homeDashboardColors.black : colors.white}
        colorScheme={colorScheme}
        colors={colors}
        description={historyDescription}
        overlayAccentColor="rgba(90, 111, 160, 0.22)"
        overlayCoolColor={homeDashboardColors.pearlMist}
        overlayWarmColor={homeDashboardColors.pearlGlow}
        navigationTraceTarget="history"
        testID="home-quick-action-history"
        title={historyTitle}
        value={historyValue}
        onPress={onOpenHistory}
      />
      <QuickActionCard
        accentBackgroundColor={colors.accentGreenSoft}
        accentTextColor={colors.accentGreen}
        colorScheme={colorScheme}
        colors={colors}
        description={tripStatsDescription}
        overlayAccentColor="rgba(31, 107, 79, 0.18)"
        overlayCoolColor={homeDashboardColors.pearlSage}
        overlayWarmColor={homeDashboardColors.pearlGlow}
        navigationTraceTarget="trip_stats"
        testID="home-quick-action-trip-stats"
        title={tripStatsTitle}
        value={tripStatsValue}
        onPress={onOpenTripStats}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: homeDashboardSpacing.sm,
  },
  card: {
    flex: 1,
    minHeight: 132,
    justifyContent: 'space-between',
    paddingVertical: homeDashboardSpacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  valueBadge: {
    alignSelf: 'flex-start',
    minWidth: 48,
    paddingHorizontal: homeDashboardSpacing.sm,
    paddingVertical: homeDashboardSpacing.xs,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueBadgeText: {
    fontSize: homeDashboardTypography.bodyStrong,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  copyBlock: {
    gap: 6,
  },
  cardTitle: {
    fontSize: homeDashboardTypography.bodyStrong,
    lineHeight: 19,
    fontWeight: '700',
    color: homeDashboardColors.ink,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: homeDashboardColors.inkSoft,
  },
});

export default HomeQuickActions;
