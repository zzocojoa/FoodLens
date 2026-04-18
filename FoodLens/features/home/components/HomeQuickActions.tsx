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
} from './homeDashboardTokens';

type HomeQuickActionsProps = {
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
  description: string;
  overlayAccentColor: string;
  overlayCoolColor: string;
  overlayWarmColor: string;
  title: string;
  value: string;
  onPress: () => void;
};

function QuickActionCard({
  accentBackgroundColor,
  accentTextColor,
  description,
  overlayAccentColor,
  overlayCoolColor,
  overlayWarmColor,
  title,
  value,
  onPress,
}: QuickActionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        homeDashboardStyles.sectionCard,
        styles.card,
        {
          opacity: pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <PearlSurfaceOverlay
        accentWashColor={overlayAccentColor}
        baseBottomColor="#FFF8F0"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={overlayCoolColor}
        warmWashColor={overlayWarmColor}
      />
      <View style={[styles.valueBadge, { backgroundColor: accentBackgroundColor }]}>
        <Text style={[styles.valueBadgeText, { color: accentTextColor }]}>{value}</Text>
      </View>
      <View style={styles.copyBlock}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {title}
        </Text>
        <Text numberOfLines={4} style={styles.cardDescription}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

export function HomeQuickActions({
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
        accentBackgroundColor={homeDashboardColors.accentRedSoft}
        accentTextColor={homeDashboardColors.accentRed}
        description={allergiesDescription}
        overlayAccentColor="rgba(185, 70, 62, 0.18)"
        overlayCoolColor={homeDashboardColors.pearlGlow}
        overlayWarmColor={homeDashboardColors.pearlPeach}
        title={allergiesTitle}
        value={allergiesValue}
        onPress={onOpenAllergies}
      />
      <QuickActionCard
        accentBackgroundColor={homeDashboardColors.accentBlue}
        accentTextColor={homeDashboardColors.white}
        description={historyDescription}
        overlayAccentColor="rgba(90, 111, 160, 0.22)"
        overlayCoolColor={homeDashboardColors.pearlMist}
        overlayWarmColor={homeDashboardColors.pearlGlow}
        title={historyTitle}
        value={historyValue}
        onPress={onOpenHistory}
      />
      <QuickActionCard
        accentBackgroundColor={homeDashboardColors.accentGreenSoft}
        accentTextColor={homeDashboardColors.accentGreen}
        description={tripStatsDescription}
        overlayAccentColor="rgba(31, 107, 79, 0.18)"
        overlayCoolColor={homeDashboardColors.pearlSage}
        overlayWarmColor={homeDashboardColors.pearlGlow}
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
