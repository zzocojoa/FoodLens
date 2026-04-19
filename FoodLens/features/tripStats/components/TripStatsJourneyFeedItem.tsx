import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, MapPin } from 'lucide-react-native';

import { homeDashboardColors, homeDashboardRadii, homeDashboardSpacing, homeDashboardTypography } from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';
import { useI18n } from '@/features/i18n';

export type TripStatsJourneyFeedSignalTone = 'safe' | 'caution' | 'danger' | 'neutral';

export type TripStatsJourneyFeedItemProps = Readonly<{
  id: string;
  countryName: string;
  locationLabel: string;
  dateLabel: string;
  summary: string;
  signalLabel: string;
  signalTone: TripStatsJourneyFeedSignalTone;
  onPress?: () => void;
}>;

type SignalToneSpec = Readonly<{
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  iconBackgroundColor: string;
  iconColor: string;
}>;

const resolveSignalToneSpec = (tone: TripStatsJourneyFeedSignalTone): SignalToneSpec => {
  if (tone === 'safe') {
    return {
      backgroundColor: homeDashboardColors.accentGreenSoft,
      borderColor: 'rgba(31, 107, 79, 0.16)',
      textColor: homeDashboardColors.accentGreen,
      iconBackgroundColor: 'rgba(31, 107, 79, 0.10)',
      iconColor: homeDashboardColors.accentGreen,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: homeDashboardColors.accentRedSoft,
      borderColor: 'rgba(185, 70, 62, 0.16)',
      textColor: homeDashboardColors.accentRed,
      iconBackgroundColor: 'rgba(185, 70, 62, 0.10)',
      iconColor: homeDashboardColors.accentRed,
    };
  }

  if (tone === 'neutral') {
    return {
      backgroundColor: homeDashboardColors.surfaceMuted,
      borderColor: homeDashboardColors.line,
      textColor: homeDashboardColors.inkSoft,
      iconBackgroundColor: homeDashboardColors.paperStrong,
      iconColor: homeDashboardColors.accentBlue,
    };
  }

  return {
    backgroundColor: homeDashboardColors.accentAmberSoft,
    borderColor: 'rgba(170, 106, 19, 0.16)',
    textColor: homeDashboardColors.accentAmber,
    iconBackgroundColor: 'rgba(170, 106, 19, 0.10)',
    iconColor: homeDashboardColors.accentAmber,
  };
};

export function TripStatsJourneyFeedItem({
  countryName,
  locationLabel,
  dateLabel,
  summary,
  signalLabel,
  signalTone,
  onPress,
}: TripStatsJourneyFeedItemProps): React.JSX.Element {
  const { t } = useI18n();
  const palette = resolveSignalToneSpec(signalTone);
  const isInteractive = typeof onPress === 'function';

  return (
    <Pressable
      accessibilityRole={isInteractive ? 'button' : undefined}
      disabled={!isInteractive}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.card,
        {
          backgroundColor: homeDashboardColors.surfaceStrong,
          borderColor: palette.borderColor,
        },
        pressed && isInteractive ? localStyles.cardPressed : null,
      ]}
    >
      <View style={localStyles.content}>
        <View style={localStyles.headRow}>
          <View style={localStyles.copyBlock}>
            <Text numberOfLines={1} style={localStyles.countryName}>
              {countryName}
            </Text>
            <Text numberOfLines={1} style={localStyles.locationLabel}>
              {locationLabel}
            </Text>
          </View>

          <View style={[homeDashboardStyles.pill, localStyles.signalPill, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor }]}>
            <Text style={[homeDashboardStyles.pillText, localStyles.signalPillText, { color: palette.textColor }]}>
              {signalLabel}
            </Text>
          </View>
        </View>

        <Text numberOfLines={2} style={localStyles.summary}>
          {summary}
        </Text>

        <View style={localStyles.footerRow}>
          <View style={localStyles.metaBlock}>
            <View style={[localStyles.iconFrame, { backgroundColor: palette.iconBackgroundColor }]}>
              <MapPin color={palette.iconColor} size={16} strokeWidth={2.1} />
            </View>
            <Text style={localStyles.dateLabel}>{dateLabel}</Text>
          </View>

          <View style={localStyles.actionRow}>
            <Text style={localStyles.actionText}>
              {t('tripStats.feed.openLabel', 'Open journey')}
            </Text>
            <ChevronRight color={homeDashboardColors.inkSoft} size={18} strokeWidth={2.2} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default TripStatsJourneyFeedItem;

const localStyles = StyleSheet.create({
  card: {
    borderRadius: homeDashboardRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
    padding: homeDashboardSpacing.md,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.988 }],
  },
  content: {
    gap: homeDashboardSpacing.sm,
  },
  headRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.sm,
  },
  copyBlock: {
    flex: 1,
    gap: homeDashboardSpacing.xxs,
    minWidth: 0,
  },
  countryName: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '800',
    lineHeight: 20,
  },
  locationLabel: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  signalPill: {
    minHeight: 30,
    paddingHorizontal: homeDashboardSpacing.sm,
  },
  signalPillText: {
    letterSpacing: 0.5,
  },
  summary: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.body,
    fontWeight: '600',
    lineHeight: 20,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: homeDashboardSpacing.xs,
    minWidth: 0,
  },
  iconFrame: {
    alignItems: 'center',
    borderRadius: homeDashboardRadii.md,
    borderCurve: 'continuous',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  dateLabel: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: homeDashboardSpacing.xxs,
  },
  actionText: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
});
