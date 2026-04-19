import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { homeDashboardColors, homeDashboardRadii, homeDashboardSpacing, homeDashboardTypography } from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';
import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
  TripStatsJourneyFeedItem,
  type TripStatsJourneyFeedItemProps,
  type TripStatsJourneyFeedSignalTone,
} from './TripStatsJourneyFeedItem';

export type TripStatsJourneyFeedEntry = Readonly<{
  id: string;
  countryName: string;
  locationLabel: string;
  dateLabel: string;
  summary: string;
  signalLabel: string;
  signalTone: TripStatsJourneyFeedSignalTone;
}>;

export type TripStatsJourneyFeedProps = Readonly<{
  title: string;
  meta: string;
  items: ReadonlyArray<TripStatsJourneyFeedEntry>;
  emptyTitle?: string;
  emptyDescription?: string;
  onPressItem?: (itemId: string) => void;
}>;

export function TripStatsJourneyFeed({
  title,
  meta,
  items,
  emptyTitle,
  emptyDescription,
  onPressItem,
}: TripStatsJourneyFeedProps): React.JSX.Element | null {
  if (items.length === 0) {
    if (typeof emptyTitle !== 'string' || emptyTitle.trim().length === 0) {
      return null;
    }

    return (
      <View style={[homeDashboardStyles.sectionCard, localStyles.container]}>
        <PearlSurfaceOverlay
          accentWashColor={homeDashboardColors.pearlMist}
          baseBottomColor="#FFF8F0"
          baseTopColor={homeDashboardColors.pearlIvory}
          coolWashColor={homeDashboardColors.pearlSage}
          warmWashColor={homeDashboardColors.pearlPeach}
        />

        <View style={homeDashboardStyles.sectionHeaderRow}>
          <View style={homeDashboardStyles.sectionHeaderCopy}>
            <Text style={localStyles.title}>{title}</Text>
            <Text style={localStyles.meta}>{meta}</Text>
          </View>

          <View style={[homeDashboardStyles.pill, localStyles.countPill]}>
            <Text style={[homeDashboardStyles.pillText, localStyles.countPillText]}>0</Text>
          </View>
        </View>

        <View style={localStyles.emptyState}>
          <Text style={localStyles.emptyTitle}>{emptyTitle}</Text>
          {typeof emptyDescription === 'string' && emptyDescription.trim().length > 0 ? (
            <Text style={localStyles.emptyDescription}>{emptyDescription}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[homeDashboardStyles.sectionCard, localStyles.container]}>
      <PearlSurfaceOverlay
        accentWashColor={homeDashboardColors.pearlMist}
        baseBottomColor="#FFF8F0"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={homeDashboardColors.pearlSage}
        warmWashColor={homeDashboardColors.pearlPeach}
      />

      <View style={homeDashboardStyles.sectionHeaderRow}>
        <View style={homeDashboardStyles.sectionHeaderCopy}>
          <Text style={localStyles.title}>{title}</Text>
          <Text style={localStyles.meta}>{meta}</Text>
        </View>

        <View style={[homeDashboardStyles.pill, localStyles.countPill]}>
          <Text style={[homeDashboardStyles.pillText, localStyles.countPillText]}>
            {String(items.length)}
          </Text>
        </View>
      </View>

      <View style={localStyles.list}>
        {items.map((item) => {
          const feedItemProps: TripStatsJourneyFeedItemProps = {
            id: item.id,
            countryName: item.countryName,
            locationLabel: item.locationLabel,
            dateLabel: item.dateLabel,
            summary: item.summary,
            signalLabel: item.signalLabel,
            signalTone: item.signalTone,
            onPress: typeof onPressItem === 'function' ? () => onPressItem(item.id) : undefined,
          };

          return <TripStatsJourneyFeedItem key={item.id} {...feedItemProps} />;
        })}
      </View>
    </View>
  );
}

export default TripStatsJourneyFeed;

const localStyles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
    gap: homeDashboardSpacing.md,
  },
  title: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.section,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  meta: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.9,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  countPill: {
    minWidth: 44,
    backgroundColor: homeDashboardColors.surfaceMuted,
  },
  countPillText: {
    color: homeDashboardColors.ink,
  },
  list: {
    gap: homeDashboardSpacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: homeDashboardColors.surfaceMuted,
    borderRadius: homeDashboardRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    gap: homeDashboardSpacing.xs,
    paddingHorizontal: homeDashboardSpacing.md,
    paddingVertical: homeDashboardSpacing.xl,
  },
  emptyTitle: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyDescription: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
});
